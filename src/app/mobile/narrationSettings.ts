import { defineSetting } from '../../kernel'

/**
 * Mobile narration preferences use the same persisted keys as Paper v0.4.2.
 * Keeping the wire names aligned lets a future shared settings surface adopt
 * them without migrating a phone's choices.
 */
export const NARRATION_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5] as const
export const SENTENCE_GAPS = [0, 150, 300, 500, 750, 1000] as const
export const PARAGRAPH_GAPS = [0, 300, 600, 900, 1400, 2000] as const

const bounded = (min: number, max: number) => (raw: unknown): number | undefined =>
  Number.isFinite(raw) ? Math.max(min, Math.min(max, raw as number)) : undefined

const voices = (raw: unknown): Readonly<Record<string, string>> | undefined => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const kept: Record<string, string> = {}
  for (const [language, voice] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof voice === 'string' && voice !== '') kept[language] = voice
  }
  return kept
}

const boolean = (raw: unknown): boolean | undefined =>
  typeof raw === 'boolean' ? raw : undefined

export const MOBILE_NARRATION_SETTINGS = {
  readingVoice: defineSetting<Readonly<Record<string, string>>>('kernel.readingVoice', {}, voices),
  readingRate: defineSetting<number>('kernel.readingRate', 1, bounded(0.5, 2.5)),
  readingNotesAloud: defineSetting<boolean>('kernel.readingNotesAloud', false, boolean),
  sentenceGapMs: defineSetting<number>('kernel.sentenceGapMs', 150, bounded(0, 1000)),
  paragraphGapMs: defineSetting<number>('kernel.paragraphGapMs', 600, bounded(0, 2000)),
} as const
