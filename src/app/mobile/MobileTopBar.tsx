import { Bookmark, List } from 'lucide-react'
import type { Bookmarking } from '../../kernel/ui/mobile'
import { ICON } from '../../kernel/core/metrics'
import styles from './Reader.module.css'
import { uiText, useUiLanguage } from '../../kernel/ui/i18n'

export interface MobileTopBarProps {
  readonly name: string
  readonly title?: string
  readonly chapterLabel: string
  readonly chrome: boolean
  readonly onClose: () => void
  readonly bookmarking: Bookmarking
  readonly onOpenTools: () => void
}

export function MobileTopBar({
  name,
  title,
  chapterLabel,
  chrome,
  onClose,
  bookmarking,
  onOpenTools,
}: MobileTopBarProps) {
  const language = useUiLanguage()
  const displayTitle = (title || name).trim() || uiText(language, '未命名', 'Untitled')

  return (
    <header className={styles.topBar} data-visible={chrome} inert={!chrome}>
      <button className={styles.backButton} type="button" onClick={onClose} aria-label={uiText(language, '返回书架', 'Shelf')}>
        ‹ {uiText(language, '书架', 'Shelf')}
      </button>

      <div className={styles.titleBlock}>
        <span className={styles.bookTitle}>{displayTitle}</span>
        {chapterLabel && <span className={styles.chapterSubtitle}>{chapterLabel}</span>}
      </div>

      <div className={styles.topActions}>
        <button
          className={`${styles.iconButton} ${bookmarking.here ? styles.bookmarkActive : ''}`}
          type="button"
          aria-label={bookmarking.here ? uiText(language, '移除书签', 'Remove bookmark') : uiText(language, '添加书签', 'Bookmark this place')}
          title={bookmarking.here ? uiText(language, '移除书签', 'Remove bookmark') : uiText(language, '添加书签', 'Bookmark this place')}
          aria-pressed={bookmarking.here !== null}
          disabled={!bookmarking.canBookmark}
          onClick={bookmarking.toggle}
        >
          <Bookmark
            size={ICON.control}
            strokeWidth={ICON.stroke}
            fill={bookmarking.here ? 'currentColor' : 'none'}
          />
        </button>

        <button
          className={styles.iconButton}
          type="button"
          aria-label={uiText(language, '阅读工具', 'Tools')}
          title={uiText(language, '阅读工具', 'Tools')}
          onClick={onOpenTools}
        >
          <List size={ICON.control} strokeWidth={ICON.stroke} />
        </button>
      </div>
    </header>
  )
}
