import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  List,
  Moon,
  Search as SearchIcon,
  Sun,
  Type,
} from 'lucide-react'
import { ICON } from '../../kernel/core/metrics'
import type { Theme } from '../../kernel/core/uiTypes'
import { minutesLeft } from '../shell/ProgressFooter'
import styles from './Reader.module.css'
import { uiText, useUiLanguage } from '../../kernel/ui/i18n'

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
      data-visible={chrome && visible}
      inert={!chrome || !visible}
      aria-label={uiText(language, '阅读控制', 'Reading controls')}
    >
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
