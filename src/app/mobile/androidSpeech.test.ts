import { describe, expect, it, vi } from 'vitest'
import { AndroidSynth, AndroidUtterance } from './androidSpeech'

function fixture() {
  const speak = vi.fn()
  const stop = vi.fn()
  const synth = new AndroidSynth({
    ttsVoices: () => JSON.stringify([
      { name: 'Local', lang: 'en-US', voiceURI: 'android:local', localService: true, quality: 500 },
    ]),
    ttsState: () => 'ready',
    ttsSpeak: speak,
    ttsStop: stop,
  })
  return { synth, speak, stop }
}

describe('Android native speech adapter', () => {
  it('exposes local voices and relays native word ranges to follow-along', () => {
    const { synth, speak } = fixture()
    const utterance = new AndroidUtterance('Hello world')
    const ranges: number[] = []
    utterance.addEventListener('boundary', (event) => ranges.push((event as SpeechSynthesisEvent).charIndex))
    synth.speak(utterance)
    expect(synth.getVoices()[0]?.voiceURI).toBe('android:local')
    expect(speak).toHaveBeenCalledWith('carta-1', 'Hello world', '', 1)
    synth.receive({ id: 'carta-1', kind: 'boundary', start: 6, end: 11 })
    expect(ranges).toEqual([6])
  })

  it('resumes at the last reported word and ignores a stopped utterance', () => {
    const { synth, speak } = fixture()
    const utterance = new AndroidUtterance('Hello world again')
    const ended = vi.fn()
    utterance.addEventListener('end', ended)
    synth.speak(utterance)
    synth.receive({ id: 'carta-1', kind: 'boundary', start: 6, end: 11 })
    synth.pause()
    synth.receive({ id: 'carta-1', kind: 'end', start: 0, end: 0 })
    expect(ended).not.toHaveBeenCalled()
    synth.resume()
    expect(speak).toHaveBeenLastCalledWith('carta-2', 'world again', '', 1)
    synth.receive({ id: 'carta-2', kind: 'end', start: 0, end: 0 })
    expect(ended).toHaveBeenCalledTimes(1)
  })
})
