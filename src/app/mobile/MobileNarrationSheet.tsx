import { useEffect, useState } from 'react'
import { AudioLines, Check, ChevronLeft, ChevronRight, Download, Volume2, X } from 'lucide-react'
import type { SettingsStore } from '../../kernel'
import {
  bestVoice,
  chosenVoice,
  uiText,
  useUiLanguage,
  voiceGroups,
  voiceKey,
  type ReadableTier,
  type VoiceFacts,
} from '../../kernel/ui/mobile'
import { ICON } from '../../kernel/core/metrics'
import type { ReadingPrefs } from './useReadingPrefs'
import {
  MOBILE_NARRATION_SETTINGS,
  NARRATION_RATES,
  PARAGRAPH_GAPS,
  SENTENCE_GAPS,
} from './narrationSettings'
import styles from './Reader.module.css'

export interface MobileNarrationSheetProps {
  readonly settings: SettingsStore
  readonly prefs: ReadingPrefs
  readonly lang: string | null
  readonly voices: readonly VoiceFacts[]
  readonly fixedLayout: boolean
  readonly exportState: null | { readonly busy: boolean; readonly completed: number; readonly total: number; readonly message: string }
  readonly onExport: () => void
  readonly onCancelExport: () => void
}

const TIER_LABELS: Record<ReadableTier, { zh: string; en: string }> = {
  premium: { zh: 'Premium 高级', en: 'Premium' },
  enhanced: { zh: 'Enhanced 增强', en: 'Enhanced' },
  unknown: { zh: '平台声音', en: 'Platform voices' },
}

function StepSetting({
  label,
  values,
  value,
  format,
  onChange,
}: {
  readonly label: string
  readonly values: readonly number[]
  readonly value: number
  readonly format: (value: number) => string
  readonly onChange: (value: number) => void
}) {
  const nearest = values.reduce(
    (best, one, index) =>
      Math.abs(one - value) < Math.abs((values[best] ?? value) - value) ? index : best,
    0,
  )

  return (
    <div className={styles.narrationSettingRow}>
      <span>{label}</span>
      <div className={styles.narrationStepper}>
        <button
          type="button"
          aria-label={`${label} −`}
          disabled={nearest === 0}
          onClick={() => onChange(values[Math.max(0, nearest - 1)] ?? value)}
        >
          <ChevronLeft size={ICON.standalone} strokeWidth={ICON.stroke} />
        </button>
        <output>{format(value)}</output>
        <button
          type="button"
          aria-label={`${label} +`}
          disabled={nearest === values.length - 1}
          onClick={() => onChange(values[Math.min(values.length - 1, nearest + 1)] ?? value)}
        >
          <ChevronRight size={ICON.standalone} strokeWidth={ICON.stroke} />
        </button>
      </div>
    </div>
  )
}

export function MobileNarrationSheet({
  settings,
  prefs,
  lang,
  voices,
  fixedLayout,
  exportState,
  onExport,
  onCancelExport,
}: MobileNarrationSheetProps) {
  const language = useUiLanguage()
  const androidState = window.CartaAndroidBridge?.ttsState()
  const isAndroid = androidState !== undefined
  const groups = voiceGroups(voices, lang)
  const readableVoiceCount = groups.reduce((count, group) => count + group.voices.length, 0)
  const selected = chosenVoice(voices, lang, prefs.readingVoice)?.voiceURI ?? ''
  const automaticVoice = bestVoice(voices, lang)
  const key = voiceKey(lang)
  const [installPending, setInstallPending] = useState(false)
  const [installMessage, setInstallMessage] = useState('')

  useEffect(() => {
    if (!isAndroid) return
    const onInstall = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: 'returned' | 'error'; added?: number; after: number; completed?: boolean }>).detail
      setInstallPending(false)
      setInstallMessage(detail.kind === 'error'
        ? uiText(language, '无法打开 Android 系统语音安装器。', 'Could not open the Android voice installer.')
        : detail.added && detail.added > 0
          ? uiText(language, `已发现 ${detail.added} 个新离线声音；共 ${detail.after} 个。`, `${detail.added} new offline voice${detail.added === 1 ? '' : 's'} found; ${detail.after} available.`)
          : detail.completed
            ? uiText(language, '语音列表已刷新；系统未报告新增声音。可在系统语音设置中确认下载状态。', 'Voice list refreshed; Android reported no new voices. Check download status in system speech settings.')
            : uiText(language, '系统语音安装已取消；没有检测到新增声音。', 'Voice installation was cancelled; no new voice was detected.'))
    }
    window.addEventListener('carta:voice-install', onInstall)
    return () => window.removeEventListener('carta:voice-install', onInstall)
  }, [isAndroid, language])

  const setVoice = (voice: string) => {
    const next = { ...prefs.readingVoice }
    if (voice === '') delete next[key]
    else next[key] = voice
    settings.set(MOBILE_NARRATION_SETTINGS.readingVoice, next)
  }

  return (
    <div className={styles.narrationSheet}>
      <div className={styles.narrationIntro}>
        <span className={styles.narrationGlyph}><Volume2 size={20} strokeWidth={ICON.stroke} /></span>
        <div>
          <h2>{uiText(language, '朗读', 'Read aloud')}</h2>
          <p>
            {uiText(
              language,
              isAndroid
                ? '使用 Android 系统文字转语音的离线声音，优先选同语言的高质量声音。'
                : 'Apple 设备仅列出已安装的 Enhanced / Premium 声音；可在系统“声音”设置下载更多声音。',
              isAndroid
                ? 'Uses offline Android system voices, preferring higher quality voices in the book’s language.'
                : 'Apple devices list installed Enhanced / Premium voices; download more in the system Voices settings.',
            )}
          </p>
        </div>
      </div>

      <label className={styles.narrationVoiceField}>
        <span>{uiText(language, '声音', 'Voice')}</span>
        <select value={selected} onChange={(event) => setVoice(event.target.value)}>
          <option value="">
            {groups.length > 0
              ? uiText(
                  language,
                  automaticVoice ? `自动 · ${automaticVoice.name}` : '自动 · 使用系统默认声音',
                  automaticVoice ? `Automatic · ${automaticVoice.name}` : 'Automatic · system default voice',
                )
              : androidState === 'loading'
                ? uiText(language, '正在加载系统声音', 'Loading system voices')
                : isAndroid
                  ? uiText(language, '没有适合本书的离线声音', 'No offline voice for this book')
                  : uiText(language, '没有适合本书的高质量声音', 'No high-quality voice for this book')}
          </option>
          {groups.map((group, index) => (
            <optgroup
              key={`${group.tier}-${index}`}
              label={isAndroid
                ? uiText(language, 'Android 离线声音', 'Android offline voices')
                : uiText(language, TIER_LABELS[group.tier].zh, TIER_LABELS[group.tier].en)}
            >
              {group.voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {isAndroid ? `${voice.lang} · ${voice.name}` : voice.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {groups.length === 0 && androidState !== 'loading' && (
        <p className={styles.narrationEmpty} role="status">
          {androidState === 'error'
            ? uiText(language, 'Android 系统文字转语音引擎启动失败。请检查系统语音设置后重开 Carta。', 'Android text-to-speech could not start. Check system speech settings, then reopen Carta.')
            : isAndroid
              ? uiText(language, '可从下方打开系统安装器。下载大小与进度由当前 Android 语音引擎显示；返回 Carta 后会刷新声音列表。', 'Open the system installer below. Your Android speech engine shows download size and progress; Carta refreshes the voice list when you return.')
              : uiText(language, '暂未找到适合本书的 Enhanced / Premium 本机声音。可在“设置 › 辅助功能 › 朗读与口述 › 声音”下载后，再返回 Carta。', 'No suitable Enhanced / Premium on-device voice is listed. Download one in Settings › Accessibility › Read & Speak › Voices, then return to Carta.')}
        </p>
      )}

      {isAndroid && (
        <div className={styles.narrationVoiceDownloads}>
          <button
            type="button"
            className={styles.narrationAction}
            disabled={installPending || androidState === 'loading'}
            onClick={() => {
              setInstallPending(true)
              setInstallMessage(uiText(language, '正在打开系统语音安装器…', 'Opening the system voice installer…'))
              window.CartaAndroidBridge?.ttsInstallVoices?.()
            }}
          >
            <Download size={16} strokeWidth={ICON.stroke} />
            {installPending
              ? uiText(language, '系统语音安装器已打开', 'System installer opened')
              : uiText(language, '下载离线语音', 'Download offline voices')}
          </button>
          {installMessage && <p role="status" className={styles.narrationActionStatus}>{installMessage}</p>}
        </div>
      )}
      {!isAndroid && (
        <div className={styles.narrationVoiceDownloads}>
          <p role="status" className={styles.narrationActionStatus}>
            {uiText(language,
              `此设备有 ${readableVoiceCount} 个可用的增强本机声音。可在“设置 › 辅助功能 › 朗读与口述 › 声音”管理或下载声音。`,
              `${readableVoiceCount} eligible on-device voice${readableVoiceCount === 1 ? '' : 's'} available. Manage or download voices in Settings › Accessibility › Read & Speak › Voices.`)}
          </p>
        </div>
      )}

      <div className={styles.narrationSettingsGroup}>
        <StepSetting
          label={uiText(language, '语速', 'Speed')}
          values={NARRATION_RATES}
          value={prefs.readingRate}
          format={(value) => `${value}×`}
          onChange={(value) => settings.set(MOBILE_NARRATION_SETTINGS.readingRate, value)}
        />
        <StepSetting
          label={uiText(language, '句间停顿', 'Sentence pause')}
          values={SENTENCE_GAPS}
          value={prefs.sentenceGapMs}
          format={(value) => `${value} ms`}
          onChange={(value) => settings.set(MOBILE_NARRATION_SETTINGS.sentenceGapMs, value)}
        />
        <StepSetting
          label={uiText(language, '段间停顿', 'Paragraph pause')}
          values={PARAGRAPH_GAPS}
          value={prefs.paragraphGapMs}
          format={(value) => `${value} ms`}
          onChange={(value) => settings.set(MOBILE_NARRATION_SETTINGS.paragraphGapMs, value)}
        />
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={prefs.readingNotesAloud}
        className={styles.narrationToggle}
        onClick={() => settings.set(MOBILE_NARRATION_SETTINGS.readingNotesAloud, !prefs.readingNotesAloud)}
      >
        <span>
          <strong>{uiText(language, '朗读注脚正文', 'Read footnote bodies')}</strong>
          <small>{uiText(language, '注脚标记、目录页码和 ruby 注音仍会自动跳过。', 'Footnote markers, print page numbers, and ruby annotations are still skipped.')}</small>
        </span>
        <span className={styles.narrationToggleMark} aria-hidden="true">
          {prefs.readingNotesAloud && <Check size={15} strokeWidth={2.5} />}
        </span>
      </button>

      <div className={styles.narrationExport}>
        <div className={styles.narrationExportCopy}>
          <strong>{uiText(language, '导出有声书', 'Export audiobook')}</strong>
          <small>{uiText(language, '使用所选本机声音与语速，保存为 WAV。文件较大，需预留存储空间。', 'Uses the selected on-device voice and speed. WAV files can be large; make sure you have enough storage.')}</small>
        </div>
        {exportState?.busy ? (
          <button type="button" className={styles.narrationAction} onClick={onCancelExport}>
            <X size={16} strokeWidth={ICON.stroke} />
            {uiText(language, '取消', 'Cancel')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.narrationAction}
            disabled={fixedLayout || voices.length === 0}
            onClick={onExport}
          >
            <AudioLines size={16} strokeWidth={ICON.stroke} />
            {uiText(language, '导出 WAV', 'Export WAV')}
          </button>
        )}
        {fixedLayout && <p className={styles.narrationActionStatus} role="status">{uiText(language, '固定版式目前不支持有声书导出。', 'Audiobook export is unavailable for fixed-layout books.')}</p>}
        {voices.length === 0 && !fixedLayout && <p className={styles.narrationActionStatus} role="status">{uiText(language, '先安装本机离线声音，才能导出。', 'Install an on-device voice before exporting.')}</p>}
        {exportState?.busy && (
          <div className={styles.narrationExportProgress} role="status" aria-live="polite">
            <span>{exportState.message}</span>
            {exportState.total > 0 && <progress max={exportState.total} value={exportState.completed} />}
          </div>
        )}
        {exportState && !exportState.busy && exportState.message && (
          <p className={styles.narrationActionStatus} role="status">{exportState.message}</p>
        )}
      </div>
    </div>
  )
}
