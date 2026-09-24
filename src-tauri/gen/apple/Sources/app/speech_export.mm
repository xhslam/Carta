#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>

using CartaProgress = void (*)(void *, uint32_t, uint32_t);

static std::mutex cartaExportLock;
static std::mutex cartaSynthLock;
static std::atomic_bool cartaExportCancelled{false};
static AVSpeechSynthesizer *cartaActiveSynth = nil;
static dispatch_semaphore_t cartaActiveFinished = nil;

static void writeError(char *destination, size_t capacity, const char *message) {
  if (destination == nullptr || capacity == 0) return;
  std::snprintf(destination, capacity, "%s", message == nullptr ? "Audiobook export failed" : message);
}

static bool sameFormat(AVAudioFormat *a, AVAudioFormat *b) {
  return a != nil && b != nil &&
    a.sampleRate == b.sampleRate &&
    a.channelCount == b.channelCount &&
    a.commonFormat == b.commonFormat &&
    a.isInterleaved == b.isInterleaved;
}

static bool writeSilence(AVAudioFile *file, AVAudioFormat *format, NSInteger milliseconds, NSError **error) {
  if (milliseconds <= 0 || format == nil) return true;
  const AVAudioFrameCount frames = (AVAudioFrameCount)(format.sampleRate * (double)milliseconds / 1000.0);
  if (frames == 0) return true;
  AVAudioPCMBuffer *silence = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:frames];
  if (silence == nil) return false;
  silence.frameLength = frames;
  AudioBufferList *buffers = silence.mutableAudioBufferList;
  for (UInt32 index = 0; index < buffers->mNumberBuffers; index++) {
    AudioBuffer &buffer = buffers->mBuffers[index];
    if (buffer.mData != nullptr) std::memset(buffer.mData, 0, buffer.mDataByteSize);
  }
  return [file writeFromBuffer:silence error:error];
}

extern "C" int32_t carta_export_audiobook_json(
  const char *jsonBytes,
  const char *destinationBytes,
  CartaProgress progress,
  void *context,
  char *errorBuffer,
  size_t errorCapacity
) {
  std::unique_lock<std::mutex> exportGuard(cartaExportLock);
  cartaExportCancelled.store(false);
  if (jsonBytes == nullptr || destinationBytes == nullptr) {
    writeError(errorBuffer, errorCapacity, "Invalid audiobook export request");
    return 1;
  }

  NSString *jsonText = [NSString stringWithUTF8String:jsonBytes];
  NSData *jsonData = [jsonText dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id value = [NSJSONSerialization JSONObjectWithData:jsonData options:NSJSONReadingFragmentsAllowed error:&parseError];
  if (![value isKindOfClass:[NSArray class]] || [(NSArray *)value count] == 0) {
    writeError(errorBuffer, errorCapacity, parseError.localizedDescription.UTF8String ?: "No readable text to export");
    return 1;
  }

  NSString *destination = [NSString stringWithUTF8String:destinationBytes];
  NSURL *destinationURL = nil;
  if ([destination hasPrefix:@"file:"]) destinationURL = [NSURL URLWithString:destination];
  else if ([destination hasPrefix:@"/"]) destinationURL = [NSURL fileURLWithPath:destination];
  if (destinationURL == nil || !destinationURL.isFileURL) {
    writeError(errorBuffer, errorCapacity, "The selected save location is not a local file");
    return 2;
  }

  NSURL *audioOutputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory()
    stringByAppendingPathComponent:[NSString stringWithFormat:@"carta-audiobook-%@.wav", NSUUID.UUID.UUIDString]]];
  AVSpeechSynthesizer *synth = [[AVSpeechSynthesizer alloc] init];
  {
    std::lock_guard<std::mutex> lock(cartaSynthLock);
    cartaActiveSynth = synth;
  }
  __block AVAudioFile *audioFile = nil;
  __block AVAudioFormat *outputFormat = nil;
  auto audioLock = std::make_shared<std::mutex>();
  __block NSString *nativeError = nil;
  NSArray *chunks = (NSArray *)value;
  int32_t result = 0;

  for (NSUInteger index = 0; index < chunks.count; index++) {
    if (cartaExportCancelled.load()) {
      result = 4;
      break;
    }
    NSDictionary *chunk = [chunks[index] isKindOfClass:[NSDictionary class]] ? chunks[index] : nil;
    NSString *text = [chunk[@"text"] isKindOfClass:[NSString class]] ? chunk[@"text"] : @"";
    NSString *voiceIdentifier = [chunk[@"voiceURI"] isKindOfClass:[NSString class]] ? chunk[@"voiceURI"] : @"";
    const double multiplier = [chunk[@"rate"] respondsToSelector:@selector(doubleValue)] ? [chunk[@"rate"] doubleValue] : 1.0;
    const NSInteger gapAfterMs = [chunk[@"gapAfterMs"] respondsToSelector:@selector(integerValue)] ? [chunk[@"gapAfterMs"] integerValue] : 0;
    AVSpeechSynthesisVoice *voice = [AVSpeechSynthesisVoice voiceWithIdentifier:voiceIdentifier];
    if (text.length == 0 || voice == nil) {
      nativeError = voice == nil ? @"The selected Apple voice is no longer available. Refresh voice settings and retry." : @"A text section was empty";
      result = 3;
      break;
    }

    AVSpeechUtterance *utterance = [[AVSpeechUtterance alloc] initWithString:text];
    utterance.voice = voice;
    utterance.rate = (float)MAX(AVSpeechUtteranceMinimumSpeechRate,
      MIN(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * multiplier));
    dispatch_semaphore_t finished = dispatch_semaphore_create(0);
    __block bool signalled = false;
    {
      std::lock_guard<std::mutex> lock(cartaSynthLock);
      cartaActiveFinished = finished;
    }
    [synth writeUtterance:utterance toBufferCallback:^(AVAudioBuffer *buffer) {
      AVAudioPCMBuffer *pcm = [buffer isKindOfClass:[AVAudioPCMBuffer class]] ? (AVAudioPCMBuffer *)buffer : nil;
      if (pcm == nil) {
        nativeError = @"Apple returned an unsupported speech buffer";
        if (!signalled) { signalled = true; dispatch_semaphore_signal(finished); }
        return;
      }
      if (pcm.frameLength == 0) {
        if (!signalled) { signalled = true; dispatch_semaphore_signal(finished); }
        return;
      }
      if (cartaExportCancelled.load()) return;
      std::lock_guard<std::mutex> lock(*audioLock);
      NSError *writeError = nil;
      if (audioFile == nil) {
        outputFormat = pcm.format;
        audioFile = [[AVAudioFile alloc] initForWriting:audioOutputURL
          settings:outputFormat.settings
          commonFormat:outputFormat.commonFormat
          interleaved:outputFormat.isInterleaved
          error:&writeError];
        if (audioFile == nil) nativeError = writeError.localizedDescription ?: @"Could not create the WAV file";
      } else if (!sameFormat(outputFormat, pcm.format)) {
        nativeError = @"The selected voices use different audio formats. Choose one compatible voice for every chapter and retry.";
      }
      if (nativeError == nil && ![audioFile writeFromBuffer:pcm error:&writeError]) {
        nativeError = writeError.localizedDescription ?: @"Could not write the WAV audio";
      }
      if (nativeError != nil && !signalled) {
        signalled = true;
        dispatch_semaphore_signal(finished);
        dispatch_async(dispatch_get_main_queue(), ^{ [synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate]; });
      }
    }];
    dispatch_semaphore_wait(finished, DISPATCH_TIME_FOREVER);
    /* If cancellation woke the waiter while the callback was writing, acquire
     * its lock before the temporary file can be removed below. */
    { std::lock_guard<std::mutex> lock(*audioLock); }
    {
      std::lock_guard<std::mutex> lock(cartaSynthLock);
      cartaActiveFinished = nil;
    }

    if (nativeError != nil) {
      result = 3;
      break;
    }
    if (cartaExportCancelled.load()) {
      result = 4;
      break;
    }
    NSError *silenceError = nil;
    {
      std::lock_guard<std::mutex> lock(*audioLock);
      if (gapAfterMs > 0 && !writeSilence(audioFile, outputFormat, MIN(gapAfterMs, 5000), &silenceError)) {
        nativeError = silenceError.localizedDescription ?: @"Could not write the chapter pause";
        result = 3;
      }
    }
    if (result != 0) break;
    if (progress != nullptr) progress(context, (uint32_t)(index + 1), (uint32_t)chunks.count);
  }

  {
    std::lock_guard<std::mutex> lock(cartaSynthLock);
    cartaActiveSynth = nil;
  }
  if (cartaExportCancelled.load() && result == 0) result = 4;
  if (result != 0) {
    [[NSFileManager defaultManager] removeItemAtURL:audioOutputURL error:nil];
    if (result == 4) writeError(errorBuffer, errorCapacity, "Export cancelled");
    else writeError(errorBuffer, errorCapacity, nativeError.UTF8String ?: "Could not synthesize audiobook audio");
    return result;
  }
  if (audioFile == nil) {
    [[NSFileManager defaultManager] removeItemAtURL:audioOutputURL error:nil];
    writeError(errorBuffer, errorCapacity, "The book contains no audio");
    return 3;
  }
  audioFile = nil;
  NSFileManager *fileManager = [NSFileManager defaultManager];
  NSError *commitError = nil;
  BOOL committed = [fileManager fileExistsAtPath:destinationURL.path]
    ? [fileManager replaceItemAtURL:destinationURL withItemAtURL:audioOutputURL backupItemName:nil options:0 resultingItemURL:nil error:&commitError]
    : [fileManager moveItemAtURL:audioOutputURL toURL:destinationURL error:&commitError];
  if (!committed) {
    [fileManager removeItemAtURL:audioOutputURL error:nil];
    writeError(errorBuffer, errorCapacity, commitError.localizedDescription.UTF8String ?: "Could not save the completed audiobook");
    return 5;
  }
  return 0;
}

extern "C" void carta_cancel_audiobook() {
  cartaExportCancelled.store(true);
  AVSpeechSynthesizer *synth = nil;
  dispatch_semaphore_t finished = nil;
  {
    std::lock_guard<std::mutex> lock(cartaSynthLock);
    synth = cartaActiveSynth;
    finished = cartaActiveFinished;
  }
  if (finished != nil) dispatch_semaphore_signal(finished);
  if (synth != nil) {
    dispatch_async(dispatch_get_main_queue(), ^{ [synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate]; });
  }
}
