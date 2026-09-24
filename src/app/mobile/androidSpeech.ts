/** Web Speech shaped adapter for Android's native TextToSpeech service. */
interface AndroidBridge {
  ttsVoices(): string
  ttsState(): string
  ttsSpeak(id: string, text: string, voiceUri: string, rate: number): void
  ttsStop(): void
  ttsInstallVoices?(): void
  ttsExport?(id: string, fileName: string, chunksJson: string): void
  ttsCancelExport?(id: string): void
}

interface NativeSpeechEvent {
  id: string
  kind: 'start' | 'boundary' | 'end' | 'error'
  start: number
  end: number
}

interface NativeExportEvent {
  id: string
  kind: 'progress' | 'done' | 'error' | 'cancelled'
  completed: number
  total: number
  message?: string
  stage?: 'synthesis' | 'combining'
}

interface NativeVoiceInstallEvent {
  kind: 'returned' | 'error'
  before: number
  after: number
  added?: number
  completed?: boolean
}

declare global {
  interface Window {
    CartaAndroidBridge?: AndroidBridge
    __cartaAndroidTtsEvent?: (event: NativeSpeechEvent) => void
    __cartaAndroidTtsVoicesChanged?: () => void
    __cartaAndroidTtsExportEvent?: (event: NativeExportEvent) => void
    __cartaAndroidTtsInstallEvent?: (event: NativeVoiceInstallEvent) => void
  }
}

export class AndroidUtterance extends EventTarget {
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null

  constructor(readonly text: string) {
    super()
  }
}

export class AndroidSynth extends EventTarget {
  speaking = false
  paused = false
  private current: AndroidUtterance | null = null
  private activeId = ''
  private serial = 0
  private offset = 0
  private resumeAt = 0
  private started = false

  constructor(private readonly bridge: AndroidBridge) {
    super()
  }

  getVoices(): SpeechSynthesisVoice[] {
    try {
      const rows = JSON.parse(this.bridge.ttsVoices()) as SpeechSynthesisVoice[]
      return Array.isArray(rows) ? rows : []
    } catch {
      return []
    }
  }

  speak(utterance: AndroidUtterance): void {
    this.cancel()
    this.current = utterance
    this.speaking = true
    this.started = false
    this.resumeAt = 0
    this.playFrom(0)
  }

  cancel(): void {
    this.activeId = ''
    this.current = null
    this.speaking = false
    this.paused = false
    this.bridge.ttsStop()
  }

  pause(): void {
    if (!this.speaking || this.paused) return
    this.paused = true
    this.activeId = ''
    this.bridge.ttsStop()
  }

  resume(): void {
    if (!this.paused || !this.current) return
    this.paused = false
    this.playFrom(this.resumeAt)
  }

  receive(event: NativeSpeechEvent): void {
    if (event.id !== this.activeId || !this.current || this.paused) return
    const utterance = this.current
    if (event.kind === 'start') {
      if (!this.started) {
        this.started = true
        utterance.dispatchEvent(new Event('start'))
      }
    } else if (event.kind === 'boundary') {
      const index = this.offset + event.start
      this.resumeAt = index
      const boundary = new Event('boundary') as SpeechSynthesisEvent
      Object.defineProperties(boundary, {
        charIndex: { value: index },
        charLength: { value: Math.max(0, event.end - event.start) },
        name: { value: 'word' },
      })
      utterance.dispatchEvent(boundary)
    } else {
      this.activeId = ''
      this.current = null
      this.speaking = false
      utterance.dispatchEvent(new Event(event.kind))
    }
  }

  private playFrom(offset: number): void {
    const utterance = this.current
    if (!utterance) return
    this.offset = offset
    this.activeId = `carta-${++this.serial}`
    this.bridge.ttsSpeak(
      this.activeId,
      utterance.text.slice(offset),
      utterance.voice?.voiceURI ?? '',
      utterance.rate,
    )
  }
}

export function installAndroidSpeech(): void {
  const bridge = window.CartaAndroidBridge
  if (!bridge) return
  const synth = new AndroidSynth(bridge)
  window.__cartaAndroidTtsEvent = (event) => synth.receive(event)
  window.__cartaAndroidTtsVoicesChanged = () => synth.dispatchEvent(new Event('voiceschanged'))
  window.__cartaAndroidTtsExportEvent = (event) => {
    window.dispatchEvent(new CustomEvent('carta:audiobook-export', { detail: event }))
  }
  window.__cartaAndroidTtsInstallEvent = (event) => {
    synth.dispatchEvent(new Event('voiceschanged'))
    window.dispatchEvent(new CustomEvent('carta:voice-install', { detail: event }))
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: AndroidUtterance })
}
