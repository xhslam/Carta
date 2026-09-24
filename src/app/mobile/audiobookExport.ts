import { sentenceSpansOf } from '../../kernel/ui/mobile'

export interface AudiobookChunk {
  readonly text: string
  readonly voiceURI: string
  readonly rate: number
  readonly gapAfterMs: number
}

const MAX_UTTERANCE_CHARS = 1_800

/** Split the reader's already-filtered text into bounded native TTS calls. */
export function audiobookChunks(
  text: string,
  lang: string | null,
  voiceURI: string,
  rate: number,
  sentenceGapMs: number,
  paragraphGapMs: number,
  blocks: readonly number[],
): readonly AudiobookChunk[] {
  const spans = sentenceSpansOf(text, lang ?? undefined)
  const chunks: AudiobookChunk[] = []

  spans.forEach((span, index) => {
    const sentence = text.slice(span.start, span.end).trim()
    if (!sentence) return
    const parts = splitLongSentence(sentence)
    const next = spans[index + 1]
    const paragraphBreak = next !== undefined && blocks.some(
      (start) => start > span.start && start <= next.start,
    )
    parts.forEach((part, partIndex) => {
      chunks.push({
        text: part,
        voiceURI,
        rate,
        gapAfterMs: partIndex === parts.length - 1
          ? (paragraphBreak ? paragraphGapMs : sentenceGapMs)
          : 0,
      })
    })
  })

  if (chunks.length > 0) {
    const last = chunks[chunks.length - 1]
    if (last) chunks[chunks.length - 1] = { ...last, gapAfterMs: 0 }
  }
  return chunks
}

function splitLongSentence(sentence: string): string[] {
  const chars = Array.from(sentence)
  const parts: string[] = []
  for (let start = 0; start < chars.length;) {
    let end = Math.min(start + MAX_UTTERANCE_CHARS, chars.length)
    if (end < chars.length) {
      const breakAt = chars.lastIndexOf(' ', end - 1)
      if (breakAt > start + Math.floor(MAX_UTTERANCE_CHARS / 2)) end = breakAt
    }
    const part = chars.slice(start, end).join('').trim()
    if (part) parts.push(part)
    start = end
    while (chars[start] === ' ') start += 1
  }
  return parts
}

export function audiobookFileName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${clean || 'Carta audiobook'}.wav`
}
