import { useMemo, useState } from 'react'
import { Bookmark, Edit3, Highlighter, List, Trash2 } from 'lucide-react'
import type { TocItem } from 'foliate-js/view.js'
import type { MarkRef, MarksView, Bookmark as StoredBookmark, Annotation, Placed } from '../../kernel/ui/mobile'
import { ICON } from '../../kernel/core/metrics'
import styles from './Reader.module.css'
import { uiText, useUiLanguage } from '../../kernel/ui/i18n'

export interface MobileContentsDrawerProps {
  readonly toc: readonly TocItem[]
  readonly currentHref: string
  readonly onGoTo: (target: string) => void
  readonly marks: MarksView
  readonly onDeleteBookmark: (mark: MarkRef) => void
  readonly onDeleteAnnotation: (mark: MarkRef) => void
  readonly onEditAnnotation?: (mark: Placed<Annotation>) => void
  readonly initialTab?: 'contents' | 'bookmarks' | 'notes'
}

interface FlattenedToc {
  readonly label: string
  readonly href: string
  readonly depth: number
}

function flattenToc(items: readonly TocItem[], depth = 0): readonly FlattenedToc[] {
  const result: FlattenedToc[] = []
  for (const item of items) {
    if (item.href) {
      result.push({
        label: (item.label || '').trim() || 'Untitled section',
        href: item.href,
        depth,
      })
    }
    if (item.subitems && item.subitems.length > 0) {
      result.push(...flattenToc(item.subitems, depth + 1))
    }
  }
  return result
}

export function MobileContentsDrawer({
  toc,
  currentHref,
  onGoTo,
  marks,
  onDeleteBookmark,
  onDeleteAnnotation,
  onEditAnnotation,
  initialTab = 'contents',
}: MobileContentsDrawerProps) {
  const language = useUiLanguage()
  const [activeTab, setActiveTab] = useState<'contents' | 'bookmarks' | 'notes'>(initialTab)
  const flattened = useMemo(() => flattenToc(toc), [toc])

  const bookmarkedList: readonly StoredBookmark[] = marks.bookmarks ?? []
  const annotationList: readonly Placed<Annotation>[] = marks.current ?? []

  return (
    <div className={styles.toolBody}>
      {/* ── Segmented Navigation Tabs ────────────────────────────────────────── */}
      <nav className={styles.segmentedNav} aria-label={uiText(language, '目录、书签与笔记', 'Book structure and marks')}>
        <button
          type="button"
          className={`${styles.segmentBtn} ${activeTab === 'contents' ? styles.segmentBtnActive : ''}`}
          aria-pressed={activeTab === 'contents'}
          onClick={() => setActiveTab('contents')}
        >
          <List size={ICON.control} strokeWidth={ICON.stroke} />
          <span>目录</span>
          <span className={styles.segmentCountBadge}>{flattened.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.segmentBtn} ${activeTab === 'bookmarks' ? styles.segmentBtnActive : ''}`}
          aria-pressed={activeTab === 'bookmarks'}
          onClick={() => setActiveTab('bookmarks')}
        >
          <Bookmark size={ICON.control} strokeWidth={ICON.stroke} />
          <span>书签</span>
          <span className={styles.segmentCountBadge}>{bookmarkedList.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.segmentBtn} ${activeTab === 'notes' ? styles.segmentBtnActive : ''}`}
          aria-pressed={activeTab === 'notes'}
          onClick={() => setActiveTab('notes')}
        >
          <Highlighter size={ICON.control} strokeWidth={ICON.stroke} />
          <span>笔记</span>
          <span className={styles.segmentCountBadge}>{annotationList.length}</span>
        </button>
      </nav>

      {/* ── Tab: Table of Contents ─────────────────────────────────────────── */}
      {activeTab === 'contents' && (
        <div className={styles.itemList} role="list" aria-label={uiText(language, '目录', 'Table of contents')}>
          {flattened.length === 0 ? (
            <div className={styles.emptyNotice}>
              <List size={ICON.standalone} strokeWidth={1.5} />
              <p className={styles.emptyNoticeText}>本书无目录信息</p>
            </div>
          ) : (
            flattened.map((item, index) => {
              const isCurrent = currentHref.length > 0 && item.href.length > 0 && currentHref.includes(item.href)
              return (
                <button
                  key={`${item.href}:${index}`}
                  type="button"
                  className={`${styles.tocRow} ${isCurrent ? styles.tocRowActive : ''}`}
                  style={{ paddingLeft: `calc(var(--space-12) + ${item.depth * 16}px)` }}
                  onClick={() => onGoTo(item.href)}
                >
                  {isCurrent && <span className={styles.tocActiveDot} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* ── Tab: Bookmarks ─────────────────────────────────────────────────── */}
      {activeTab === 'bookmarks' && (
        <div className={styles.itemList} role="list" aria-label={uiText(language, '书签', 'Bookmarks')}>
          {bookmarkedList.length === 0 ? (
            <div className={styles.emptyNotice}>
              <Bookmark size={ICON.standalone} strokeWidth={1.5} />
              <p className={styles.emptyNoticeText}>
                暂无书签
                <br />
                阅读时点击右上角书签图标即可添加书签
              </p>
            </div>
          ) : (
            bookmarkedList.map((bm: StoredBookmark) => (
              <div
                key={bm.id}
                className={styles.markCard}
                onClick={() => onGoTo(bm.cfi)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onGoTo(bm.cfi)
                }}
              >
                <div className={styles.markCardHeader}>
                  <span className={styles.markChapterBadge}>{bm.chapter || '书签'}</span>
                  <button
                    type="button"
                    className={styles.markDeleteBtn}
                    aria-label={uiText(language, '删除书签', 'Delete bookmark')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteBookmark(bm)
                    }}
                  >
                    <Trash2 size={ICON.control} strokeWidth={ICON.stroke} />
                  </button>
                </div>
                {bm.text && <p className={styles.markQuote}>{bm.text}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Notes & Highlights ────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div className={styles.itemList} role="list" aria-label={uiText(language, '高亮与笔记', 'Highlights and notes')}>
          {annotationList.length === 0 ? (
            <div className={styles.emptyNotice}>
              <Highlighter size={ICON.standalone} strokeWidth={1.5} />
              <p className={styles.emptyNoticeText}>
                暂无划线与笔记
                <br />
                在正文中选择文本即可进行高亮和记笔记
              </p>
            </div>
          ) : (
            annotationList.map((ann: Placed<Annotation>) => (
              <div
                key={ann.id}
                className={styles.markCard}
                onClick={() => onGoTo(ann.cfi)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onGoTo(ann.cfi)
                }}
              >
                <div className={styles.markCardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor:
                          ann.tint === 'green'
                            ? '#22c55e'
                            : ann.tint === 'purple'
                              ? '#a855f7'
                              : '#eab308',
                        flexShrink: 0,
                      }}
                    />
                    <span className={styles.markChapterBadge}>{ann.chapter || '章节片段'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {onEditAnnotation && (
                      <button
                        type="button"
                        className={styles.markActionBtn}
                        aria-label={uiText(language, '编辑笔记', 'Edit note')}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditAnnotation(ann)
                        }}
                      >
                        <Edit3 size={ICON.control} strokeWidth={ICON.stroke} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.markDeleteBtn}
                      aria-label={uiText(language, '删除笔记', 'Delete note')}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteAnnotation(ann)
                      }}
                    >
                      <Trash2 size={ICON.control} strokeWidth={ICON.stroke} />
                    </button>
                  </div>
                </div>
                {ann.text && (
                  <p
                    className={styles.markQuote}
                    style={{
                      borderLeftColor:
                        ann.tint === 'green'
                          ? '#22c55e'
                          : ann.tint === 'purple'
                            ? '#a855f7'
                            : '#eab308',
                    }}
                  >
                    {ann.text}
                  </p>
                )}
                {ann.note ? (
                  <div className={styles.markNoteComment}>{ann.note}</div>
                ) : (
                  onEditAnnotation && (
                    <div
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        paddingTop: '2px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditAnnotation(ann)
                      }}
                    >
                      <Edit3 size={12} strokeWidth={ICON.stroke} />
                      添加笔记...
                    </div>
                  )
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
