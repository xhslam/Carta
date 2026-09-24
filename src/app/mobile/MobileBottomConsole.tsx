import { useState, useEffect } from 'react'
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Highlighter,
  List,
  Moon,
  Pause,
  Play,
  Rewind,
  Search as SearchIcon,
  Settings2,
  SkipBack,
  SkipForward,
  Square,
  StepBack,
  StepForward,
  Sun,
  Type,
} from 'lucide-react'
import { ICON } from '../../kernel/core/metrics'
import type { Theme } from '../../kernel/core/uiTypes'
import { minutesLeft } from '../shell/ProgressFooter'
import styles from './Reader.module.css'
import { uiText, useUiLanguage } from '../../kernel/ui/i18n'
import type { Speech } from '../../kernel/ui/mobile'

export interface MobileBottomConsoleProps {
  readonly fraction: number
  readonly chapterLabel: string
  readonly chrome: boolean
  readonly visible: boolean
  readonly onScrub: (fraction: number) => void
  readonly onPrevChapter: () => void
  readonly onNextChapter: () => void
  readonly hasPrevChapter: boolean
  readonly hasNextChapter: boolean
  readonly onOpenContents: () => void
  readonly onOpenAppearance: () => void
  readonly onToggleTheme: () => void
  readonly onOpenSearch: () => void
  readonly onOpenNotes: () => void
  readonly speech: Speech
  readonly narrationReady: boolean
  readonly readingRate: number
  readonly onListen: () => void
  readonly onOpenNarration: () => void
  readonly onCycleRate: () => void
  readonly theme: Theme
}

export function MobileBottomConsole({
  fraction,
  chapterLabel,
  chrome,
  visible,
  onScrub,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
  onOpenContents,
  onOpenAppearance,
  onToggleTheme,
  onOpenSearch,
  onOpenNotes,
  speech,
  narrationReady,
  readingRate,
  onListen,
  onOpenNarration,
  onCycleRate,
  theme,
}: MobileBottomConsoleProps) {
  const language = useUiLanguage()
  const [sliderValue, setSliderValue] = useState(() => Math.round(Math.max(0, Math.min(1, fraction)) * 100))
  const [isScrubbing, setIsScrubbing] = useState(false)

  // Sync slider with external reading position when not dragging
  useEffect(() => {
    if (!isScrubbing) {
      setSliderValue(Math.round(Math.max(0, Math.min(1, fraction)) * 100))
    }
  }, [fraction, isScrubbing])

  const mins = minutesLeft(sliderValue / 100)
  const isNight = theme === 'night'
  return (
    <nav
      className={styles.bottomConsole}
      data-visible={(chrome || speech.speaking) && visible}
      data-speech-only={!chrome && speech.speaking}
      inert={(!chrome && !speech.speaking) || !visible}
      aria-label={uiText(language, '阅读控制', 'Reading controls')}
    >
      {speech.speaking && (
        <section className={styles.speechTransport} aria-label={uiText(language, '朗读控制', 'Read-aloud controls')}>
          <div className={styles.speechStatusRow}>
            <span className={styles.speechStatus} data-paused={speech.paused}>
              <AudioLines size={16} strokeWidth={ICON.stroke} />
              {speech.paused ? uiText(language, '已暂停', 'Paused') : uiText(language, '正在朗读', 'Reading aloud')}
            </span>
            <div className={styles.speechMetaActions}>
              <button type="button" onClick={onCycleRate} aria-label={uiText(language, '切换语速', 'Change speed')}>
                {readingRate}×
              </button>
              <button type="button" onClick={onOpenNarration} aria-label={uiText(language, '朗读设置', 'Narration settings')}>
                <Settings2 size={16} strokeWidth={ICON.stroke} />
              </button>
              <button type="button" onClick={speech.stop} aria-label={uiText(language, '停止朗读', 'Stop reading')}>
                <Square size={14} fill="currentColor" strokeWidth={ICON.stroke} />
              </button>
            </div>
          </div>

          {!speech.followsWords && (
            <span className={styles.speechFollowStatus} role="status">
              {uiText(language, '当前声音不支持逐词跟随', 'This voice does not report word timing')}
            </span>
          )}

          <div className={styles.transportButtons} role="toolbar" aria-label={uiText(language, '朗读跳转', 'Narration navigation')}>
            <button type="button" onClick={() => speech.stepParagraph(-1)} aria-label={uiText(language, '上一段', 'Previous paragraph')}>
              <Rewind size={18} strokeWidth={ICON.stroke} />
            </button>
            <button type="button" onClick={() => speech.stepSentence(-1)} aria-label={uiText(language, '上一句', 'Previous sentence')}>
              <StepBack size={18} strokeWidth={ICON.stroke} />
            </button>
            <button
              type="button"
              className={styles.transportPrimary}
              onClick={speech.paused ? speech.resume : speech.pause}
              aria-label={speech.paused ? uiText(language, '继续朗读', 'Resume reading') : uiText(language, '暂停朗读', 'Pause reading')}
            >
              {speech.paused
                ? <Play size={20} fill="currentColor" strokeWidth={ICON.stroke} />
                : <Pause size={20} fill="currentColor" strokeWidth={ICON.stroke} />}
            </button>
            <button type="button" onClick={() => speech.stepSentence(1)} aria-label={uiText(language, '下一句', 'Next sentence')}>
              <StepForward size={18} strokeWidth={ICON.stroke} />
            </button>
            <button type="button" onClick={() => speech.stepParagraph(1)} aria-label={uiText(language, '下一段', 'Next paragraph')}>
              <FastForward size={18} strokeWidth={ICON.stroke} />
            </button>
          </div>
          {(speech.chapters.back || speech.chapters.forward) && (
            <div className={styles.transportChapterRow}>
              {speech.chapters.back && (
                <button type="button" onClick={() => speech.stepChapter(-1)} aria-label={uiText(language, '朗读上一章', 'Read previous chapter')}>
                  <SkipBack size={16} strokeWidth={ICON.stroke} />
                  {uiText(language, '上一章', 'Previous chapter')}
                </button>
              )}
              {speech.chapters.forward && (
                <button type="button" onClick={() => speech.stepChapter(1)} aria-label={uiText(language, '朗读下一章', 'Read next chapter')}>
                  {uiText(language, '下一章', 'Next chapter')}
                  <SkipForward size={16} strokeWidth={ICON.stroke} />
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Scrubber & Chapter Step Controls ────────────────────────────────── */}
      <div className={styles.scrubberRow}>
        <button
          type="button"
          className={styles.stepNavButton}
          disabled={!hasPrevChapter}
          aria-label={uiText(language, '上一章', 'Previous chapter')}
          onClick={onPrevChapter}
        >
          <ChevronLeft size={16} strokeWidth={ICON.stroke} />
          <span>{uiText(language, '上一章', 'Previous')}</span>
        </button>

        <div className={styles.sliderContainer}>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sliderValue}
            aria-label={uiText(language, '阅读进度', 'Reading progress')}
            aria-valuenow={sliderValue}
            aria-valuemin={0}
            aria-valuemax={100}
            className={styles.scrubberInput}
            onPointerDown={() => setIsScrubbing(true)}
            onChange={(e) => {
              const val = Number(e.target.value)
              setSliderValue(val)
              onScrub(val / 100)
            }}
            onPointerUp={() => setIsScrubbing(false)}
          />
        </div>

        <button
          type="button"
          className={styles.stepNavButton}
          disabled={!hasNextChapter}
          aria-label={uiText(language, '下一章', 'Next chapter')}
          onClick={onNextChapter}
        >
          <span>{uiText(language, '下一章', 'Next')}</span>
          <ChevronRight size={16} strokeWidth={ICON.stroke} />
        </button>
      </div>

      {/* ── Progress Info Readout ───────────────────────────────────────────── */}
      <div className={styles.progressMetaRow}>
        <span className={styles.metaChapterLabel}>{chapterLabel || uiText(language, '正文', 'Text')}</span>
        <span className={styles.metaPercentInfo}>
          {sliderValue}%
          {sliderValue > 0 && ` · ${mins < 1 ? uiText(language, '即将读完', 'Almost finished') : mins < 60 ? uiText(language, `约${mins}分钟`, `~${mins} min`) : uiText(language, `约${Math.round(mins / 60)}小时`, `~${Math.round(mins / 60)} hr`)}`}
        </span>
      </div>

      {/* ── Action Toolbar ─────────────────────────────────────────────────── */}
      <div className={styles.bottomToolbar} role="toolbar" aria-label={uiText(language, '阅读工具', 'Reading tools')}>
        <button
          type="button"
          className={styles.toolbarAction}
          aria-label={uiText(language, '目录', 'Table of contents')}
          onClick={onOpenContents}
        >
          <List size={ICON.tab} strokeWidth={ICON.stroke} />
          <span className={styles.toolbarActionLabel}>{uiText(language, '目录', 'Contents')}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarAction}
          aria-label={uiText(language, '阅读排版', 'Reading appearance')}
          onClick={onOpenAppearance}
        >
          <Type size={ICON.tab} strokeWidth={ICON.stroke} />
          <span className={styles.toolbarActionLabel}>{uiText(language, '排版', 'Type')}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarAction}
          aria-label={isNight ? uiText(language, '切换到日间模式', 'Switch to day mode') : uiText(language, '切换到夜间模式', 'Switch to night mode')}
          onClick={onToggleTheme}
        >
          {isNight ? <Sun size={ICON.tab} strokeWidth={ICON.stroke} /> : <Moon size={ICON.tab} strokeWidth={ICON.stroke} />}
          <span className={styles.toolbarActionLabel}>{isNight ? uiText(language, '日间', 'Day') : uiText(language, '夜间', 'Night')}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarAction}
          aria-label={speech.speaking ? uiText(language, '停止朗读', 'Stop reading') : uiText(language, '开始朗读', 'Read aloud')}
          aria-pressed={speech.speaking}
          disabled={!speech.available}
          data-unavailable={!narrationReady}
          title={!narrationReady ? uiText(language, '打开朗读设置查看可用声音', 'Open narration settings to check available voices') : undefined}
          onClick={speech.speaking ? speech.stop : onListen}
        >
          <AudioLines size={ICON.tab} strokeWidth={ICON.stroke} />
          <span className={styles.toolbarActionLabel}>{speech.speaking ? uiText(language, '停止', 'Stop') : uiText(language, '朗读', 'Listen')}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarAction}
          aria-label={uiText(language, '搜索本书', 'Search book')}
          onClick={onOpenSearch}
        >
          <SearchIcon size={ICON.tab} strokeWidth={ICON.stroke} />
          <span className={styles.toolbarActionLabel}>{uiText(language, '搜索', 'Search')}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarAction}
          aria-label={uiText(language, '笔记与高亮', 'Notes and marks')}
          onClick={onOpenNotes}
        >
          <Highlighter size={ICON.tab} strokeWidth={ICON.stroke} />
          <span className={styles.toolbarActionLabel}>{uiText(language, '笔记', 'Notes')}</span>
        </button>
      </div>
    </nav>
  )
}
