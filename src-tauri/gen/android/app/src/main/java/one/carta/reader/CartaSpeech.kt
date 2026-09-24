package one.carta.reader

import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Android WebView does not expose SpeechSynthesis, so the reader uses the OS engine. */
class CartaSpeech(private val activity: Activity, private val webView: WebView) {
  private data class ExportChunk(
    val text: String,
    val voiceUri: String,
    val rate: Float,
    val gapAfterMs: Int,
  )

  private data class ExportJob(
    val id: String,
    val destination: Uri,
    val chunks: List<ExportChunk>,
    val directory: File,
    val combinedFile: File = File(directory, "audiobook.wav"),
    var currentFile: File? = null,
    var waveFormat: WaveInfo? = null,
    var dataBytes: Long = 0,
    var index: Int = 0,
    var currentUtteranceId: String = "",
    @Volatile var cancelled: Boolean = false,
    @Volatile var finalizing: Boolean = false,
  )

  private data class WaveInfo(
    val format: Int,
    val channels: Int,
    val sampleRate: Int,
    val byteRate: Int,
    val blockAlign: Int,
    val bits: Int,
    val dataOffset: Long,
    val dataSize: Long,
  )

  private var engine: TextToSpeech? = null
  private var exportJob: ExportJob? = null
  @Volatile private var voiceSnapshot = "[]"
  @Volatile private var status = "loading"

  init {
    createEngine()
  }

  private fun createEngine(onReady: (() -> Unit)? = null) {
    status = "loading"
    engine = TextToSpeech(activity) { result ->
      activity.runOnUiThread {
        if (result == TextToSpeech.SUCCESS) {
          engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) {
              if (exportJob?.currentUtteranceId != utteranceId) emit(utteranceId, "start")
            }

            override fun onDone(utteranceId: String) {
              val job = exportJob
              if (job != null && job.currentUtteranceId == utteranceId) finishExportChunk(job)
              else emit(utteranceId, "end")
            }

            @Suppress("DEPRECATION")
            override fun onError(utteranceId: String) = handleUtteranceError(utteranceId)

            override fun onError(utteranceId: String, errorCode: Int) = handleUtteranceError(utteranceId)

            override fun onStop(utteranceId: String, interrupted: Boolean) {
              val job = exportJob
              if (job != null && job.currentUtteranceId == utteranceId) {
                if (job.cancelled) finishExport(job, "cancelled", "Export cancelled")
                else finishExport(job, "error", "Android stopped audiobook synthesis unexpectedly")
              }
            }

            override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) {
              if (exportJob?.currentUtteranceId != utteranceId) emit(utteranceId, "boundary", start, end)
            }
          })
          updateVoiceSnapshot()
          status = "ready"
        } else {
          status = "error"
          voiceSnapshot = "[]"
        }
        webView.evaluateJavascript("window.__cartaAndroidTtsVoicesChanged?.()", null)
        onReady?.invoke()
      }
    }
  }

  private fun updateVoiceSnapshot(): List<String> {
    val tts = engine
    val defaultName = tts?.voice?.name
    val local = tts?.voices.orEmpty()
      .filter(::availableOffline)
      .sortedWith(compareByDescending<android.speech.tts.Voice> { it.quality }
        .thenByDescending { it.name == defaultName }
        .thenBy { it.name })
    val json = JSONArray()
    val names = mutableListOf<String>()
    for (voice in local) {
      names += "android:${voice.name}"
      json.put(JSONObject()
        .put("name", voice.name)
        .put("lang", voice.locale.toLanguageTag())
        .put("voiceURI", "android:${voice.name}")
        .put("localService", true)
        .put("default", voice.name == defaultName)
        .put("quality", voice.quality))
    }
    voiceSnapshot = json.toString()
    return names
  }

  fun voices(): String = voiceSnapshot
  fun state(): String = status
  fun defaultEnginePackage(): String? = engine?.defaultEngine

  private fun availableOffline(voice: android.speech.tts.Voice): Boolean =
    !voice.isNetworkConnectionRequired &&
      TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in voice.features.orEmpty()

  fun refreshVoices(before: List<String>, completed: Boolean) {
    val oldEngine = engine
    engine = null
    oldEngine?.shutdown()
    createEngine {
      val now = try { JSONArray(voiceSnapshot) } catch (_: Exception) { JSONArray() }
      val current = (0 until now.length()).mapNotNull { now.optJSONObject(it)?.optString("voiceURI") }
      val added = current.count { it !in before }
      val payload = JSONObject()
        .put("kind", "returned")
        .put("before", before.size)
        .put("after", current.size)
        .put("added", added)
        .put("completed", completed)
      webView.evaluateJavascript("window.__cartaAndroidTtsInstallEvent?.($payload)", null)
    }
  }

  fun installFailed(before: List<String>) {
    val payload = JSONObject().put("kind", "error").put("before", before.size).put("after", before.size)
    webView.evaluateJavascript("window.__cartaAndroidTtsInstallEvent?.($payload)", null)
  }

  fun voiceUris(): List<String> = try {
    val rows = JSONArray(voiceSnapshot)
    (0 until rows.length()).mapNotNull { rows.optJSONObject(it)?.optString("voiceURI") }
  } catch (_: Exception) {
    emptyList()
  }

  fun speak(id: String, text: String, voiceUri: String, rate: Float) {
    activity.runOnUiThread {
      val tts = engine
      val local = tts?.voices?.filter(::availableOffline).orEmpty()
      val localVoice = local.firstOrNull { "android:${it.name}" == voiceUri }
      val fallback = local.firstOrNull { it.name == tts?.voice?.name }
        ?: local.maxByOrNull { it.quality }
      val selected = if (voiceUri.isEmpty()) fallback else localVoice
      if (tts == null || selected == null || text.length > TextToSpeech.getMaxSpeechInputLength()) {
        emit(id, "error")
        return@runOnUiThread
      }
      if (tts.setVoice(selected) != TextToSpeech.SUCCESS) {
        emit(id, "error")
        return@runOnUiThread
      }
      tts.setSpeechRate(rate.coerceIn(0.5f, 2.5f))
      if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id) != TextToSpeech.SUCCESS) emit(id, "error")
    }
  }

  fun startExport(id: String, destination: Uri, chunksJson: String) {
    activity.runOnUiThread {
      try {
        if (exportJob != null) throw IllegalStateException("An audiobook export is already running")
        val values = JSONArray(chunksJson)
        if (values.length() == 0) throw IllegalArgumentException("This book has no readable text")
        val chunks = (0 until values.length()).map { index ->
          val value = values.getJSONObject(index)
          val text = value.getString("text")
          if (text.isBlank() || text.length > TextToSpeech.getMaxSpeechInputLength()) {
            throw IllegalArgumentException("A text section is too long for the Android speech engine")
          }
          ExportChunk(
            text = text,
            voiceUri = value.getString("voiceURI"),
            rate = value.optDouble("rate", 1.0).toFloat(),
            gapAfterMs = value.optInt("gapAfterMs", 0).coerceIn(0, 5_000),
          )
        }
        val directory = File(activity.cacheDir, "carta-audiobook-${System.nanoTime()}")
        if (!directory.mkdirs()) throw IllegalStateException("Could not prepare temporary audio files")
        val job = ExportJob(id, destination, chunks, directory)
        exportJob = job
        synthesizeNext(job)
      } catch (error: Exception) {
        sendExport(id, "error", 0, 0, error.message ?: "Could not start audiobook export")
      }
    }
  }

  fun cancelExport(id: String) {
    activity.runOnUiThread {
      val job = exportJob ?: return@runOnUiThread
      if (job.id != id) return@runOnUiThread
      job.cancelled = true
      engine?.stop()
      if (job.finalizing) return@runOnUiThread
    }
  }

  fun cancelExportFromPicker(id: String) {
    sendExport(id, "cancelled", 0, 0, "Save cancelled")
  }

  fun exportRequestFailed(id: String, message: String) {
    sendExport(id, "error", 0, 0, message)
  }

  private fun synthesizeNext(job: ExportJob) {
    if (exportJob !== job) return
    if (job.index >= job.chunks.size) {
      combineAndSave(job)
      return
    }
    val chunk = job.chunks[job.index]
    val tts = engine
    val voice = tts?.voices?.firstOrNull { "android:${it.name}" == chunk.voiceUri && availableOffline(it) }
    if (tts == null || voice == null) {
      finishExport(job, "error", "The selected offline voice is no longer available. Reopen voice settings and try again.")
      return
    }
    if (tts.setVoice(voice) != TextToSpeech.SUCCESS) {
      finishExport(job, "error", "Android could not select the offline voice for this chapter")
      return
    }
    tts.setSpeechRate(chunk.rate.coerceIn(0.5f, 2.5f))
    val output = File(job.directory, "chunk-${job.index}.wav")
    job.currentUtteranceId = "carta-export-${job.id}-${job.index}"
    job.currentFile = output
    val result = tts.synthesizeToFile(chunk.text, Bundle(), output, job.currentUtteranceId)
    if (result != TextToSpeech.SUCCESS) {
      finishExport(job, "error", "Android could not synthesize chapter ${job.index + 1}")
    }
  }

  private fun finishExportChunk(job: ExportJob) {
    if (exportJob !== job) return
    job.currentUtteranceId = ""
    val current = job.currentFile ?: run {
      finishExport(job, "error", "Android did not produce an audio chapter")
      return
    }
    job.finalizing = true
    Thread({
      try {
        if (job.cancelled) throw InterruptedException("Export cancelled")
        appendWaveChunk(job, current, job.chunks[job.index])
        current.delete()
        activity.runOnUiThread {
          if (exportJob !== job) return@runOnUiThread
          job.currentFile = null
          job.finalizing = false
          if (job.cancelled) {
            finishExport(job, "cancelled", "Export cancelled")
            return@runOnUiThread
          }
          job.index += 1
          sendExport(job.id, "progress", job.index, job.chunks.size)
          synthesizeNext(job)
        }
      } catch (error: Exception) {
        current.delete()
        val cancelled = job.cancelled || error is InterruptedException
        activity.runOnUiThread {
          finishExport(job, if (cancelled) "cancelled" else "error", if (cancelled) "Export cancelled" else error.message ?: "Could not append synthesized audio")
        }
      }
    }, "carta-audiobook-chunk").start()
  }

  private fun appendWaveChunk(job: ExportJob, file: File, chunk: ExportChunk) {
    val info = waveInfo(file)
    if (info.format != 1 || info.bits != 16 || info.blockAlign != info.channels * 2) {
      throw IllegalStateException("This Android speech engine returned an unsupported audio format; no audiobook was saved")
    }
    val format = job.waveFormat
    if (format == null) {
      job.waveFormat = info.copy(dataOffset = 0, dataSize = 0)
      RandomAccessFile(job.combinedFile, "rw").use { output -> writeWaveHeader(output, info, 0) }
    } else if (format != info.copy(dataOffset = 0, dataSize = 0)) {
      throw IllegalStateException("The installed voices use different audio formats. Select one voice for every chapter and retry.")
    }
    val silenceBytes = silenceBytes(info, chunk.gapAfterMs)
    val nextDataBytes = job.dataBytes + info.dataSize + silenceBytes
    if (nextDataBytes > 0xffff_ffffL - 36) throw IllegalStateException("The WAV audiobook would exceed the 4 GB WAV limit")
    RandomAccessFile(job.combinedFile, "rw").use { output ->
      RandomAccessFile(file, "r").use { input ->
        input.seek(info.dataOffset)
        output.seek(output.length())
        var remaining = info.dataSize
        val buffer = ByteArray(64 * 1024)
        while (remaining > 0) {
          if (job.cancelled) throw InterruptedException("Export cancelled")
          val count = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
          if (count <= 0) throw IllegalStateException("An audio chapter ended before it was fully written")
          output.write(buffer, 0, count)
          remaining -= count
        }
        writeSilence(output, info, chunk.gapAfterMs)
      }
    }
    job.dataBytes = nextDataBytes
  }

  private fun combineAndSave(job: ExportJob) {
    if (job.finalizing) return
    job.finalizing = true
    sendExport(job.id, "progress", job.index, job.chunks.size, stage = "combining")
    Thread({
      try {
        if (job.cancelled) throw InterruptedException("Export cancelled")
        if (job.waveFormat == null || job.dataBytes == 0L) throw IllegalStateException("No audio was synthesized")
        RandomAccessFile(job.combinedFile, "rw").use { output ->
          output.seek(4)
          writeIntLE(output, (job.dataBytes + 36).toInt())
          output.seek(40)
          writeIntLE(output, job.dataBytes.toInt())
        }
        if (job.cancelled) throw InterruptedException("Export cancelled")
        val target = activity.contentResolver.openOutputStream(job.destination, "wt")
          ?: throw IllegalStateException("Could not open the selected save location")
        target.use { output ->
          FileInputStream(job.combinedFile).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              if (job.cancelled) throw InterruptedException("Export cancelled")
              val count = input.read(buffer)
              if (count < 0) break
              output.write(buffer, 0, count)
            }
          }
        }
        activity.runOnUiThread { finishExport(job, "done", "Audiobook saved") }
      } catch (error: Exception) {
        val cancelled = job.cancelled || error is InterruptedException
        val message = if (cancelled) "Export cancelled; the destination may contain a partial WAV file" else error.message ?: "Could not save synthesized audio"
        activity.runOnUiThread {
          finishExport(job, if (cancelled) "cancelled" else "error", message)
        }
      }
    }, "carta-audiobook-export").start()
  }

  private fun waveInfo(file: File): WaveInfo = RandomAccessFile(file, "r").use { input ->
    if (input.length() < 44) throw IllegalStateException("The Android speech engine returned an incomplete WAV file")
    val head = ByteArray(12)
    input.readFully(head)
    if (String(head, 0, 4, Charsets.US_ASCII) != "RIFF" || String(head, 8, 4, Charsets.US_ASCII) != "WAVE") {
      throw IllegalStateException("The Android speech engine did not return WAV audio")
    }
    var format: Int? = null
    var channels: Int? = null
    var sampleRate: Int? = null
    var byteRate: Int? = null
    var blockAlign: Int? = null
    var bits: Int? = null
    var dataOffset: Long? = null
    var dataSize: Long? = null
    while (input.filePointer + 8 <= input.length()) {
      val id = ByteArray(4)
      input.readFully(id)
      val size = Integer.toUnsignedLong(readIntLE(input))
      val offset = input.filePointer
      when (String(id, Charsets.US_ASCII)) {
        "fmt " -> {
          if (size < 16) throw IllegalStateException("Invalid WAV format header")
          format = readUnsignedShortLE(input)
          channels = readUnsignedShortLE(input)
          sampleRate = readIntLE(input)
          byteRate = readIntLE(input)
          blockAlign = readUnsignedShortLE(input)
          bits = readUnsignedShortLE(input)
        }
        "data" -> {
          dataOffset = offset
          dataSize = size
        }
      }
      input.seek(offset + size + (size and 1L))
    }
    WaveInfo(
      format ?: error("WAV format chunk missing"), channels ?: error("WAV channel count missing"),
      sampleRate ?: error("WAV sample rate missing"), byteRate ?: error("WAV byte rate missing"),
      blockAlign ?: error("WAV block alignment missing"), bits ?: error("WAV bit depth missing"),
      dataOffset ?: error("WAV audio data missing"), dataSize ?: error("WAV audio data missing"),
    )
  }

  private fun silenceBytes(info: WaveInfo, gapMs: Int): Long =
    (info.sampleRate.toLong() * gapMs / 1_000).coerceAtLeast(0) * info.blockAlign

  private fun writeWaveHeader(output: RandomAccessFile, info: WaveInfo, dataBytes: Long) {
    output.setLength(0)
    output.write("RIFF".toByteArray(Charsets.US_ASCII))
    writeIntLE(output, (dataBytes + 36).toInt())
    output.write("WAVEfmt ".toByteArray(Charsets.US_ASCII))
    writeIntLE(output, 16)
    writeShortLE(output, info.format)
    writeShortLE(output, info.channels)
    writeIntLE(output, info.sampleRate)
    writeIntLE(output, info.byteRate)
    writeShortLE(output, info.blockAlign)
    writeShortLE(output, info.bits)
    output.write("data".toByteArray(Charsets.US_ASCII))
    writeIntLE(output, dataBytes.toInt())
  }

  private fun writeSilence(output: RandomAccessFile, info: WaveInfo, gapMs: Int) {
    var remaining = silenceBytes(info, gapMs)
    val zeros = ByteArray(16 * 1024)
    while (remaining > 0) {
      val count = minOf(zeros.size.toLong(), remaining).toInt()
      output.write(zeros, 0, count)
      remaining -= count
    }
  }

  private fun readIntLE(input: RandomAccessFile): Int {
    val bytes = ByteArray(4)
    input.readFully(bytes)
    return ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).int
  }

  private fun readUnsignedShortLE(input: RandomAccessFile): Int {
    val bytes = ByteArray(2)
    input.readFully(bytes)
    return ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).short.toInt() and 0xffff
  }

  private fun writeIntLE(output: RandomAccessFile, value: Int) = output.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array())
  private fun writeShortLE(output: RandomAccessFile, value: Int) = output.write(ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(value.toShort()).array())

  private fun handleUtteranceError(id: String) {
    val job = exportJob
    if (job != null && job.currentUtteranceId == id) {
      finishExport(job, "error", "Android could not synthesize chapter ${job.index + 1}")
    } else emit(id, "error")
  }

  private fun finishExport(job: ExportJob, kind: String, message: String) {
    if (exportJob !== job) return
    exportJob = null
    job.directory.deleteRecursively()
    sendExport(job.id, kind, job.index, job.chunks.size, message)
  }

  private fun sendExport(id: String, kind: String, completed: Int, total: Int, message: String? = null, stage: String? = null) {
    val payload = JSONObject().put("id", id).put("kind", kind)
      .put("completed", completed).put("total", total)
    if (message != null) payload.put("message", message)
    if (stage != null) payload.put("stage", stage)
    activity.runOnUiThread {
      webView.evaluateJavascript("window.__cartaAndroidTtsExportEvent?.($payload)", null)
    }
  }

  fun stop() {
    activity.runOnUiThread { engine?.stop() }
  }

  fun shutdown() {
    exportJob?.let { finishExport(it, "cancelled", "Export interrupted because Carta closed") }
    engine?.shutdown()
    engine = null
  }

  private fun emit(id: String, kind: String, start: Int = 0, end: Int = 0) {
    val payload = JSONObject().put("id", id).put("kind", kind)
      .put("start", start).put("end", end)
    activity.runOnUiThread {
      webView.evaluateJavascript("window.__cartaAndroidTtsEvent?.($payload)", null)
    }
  }
}
