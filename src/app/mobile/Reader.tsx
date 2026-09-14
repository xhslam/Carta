import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Highlighter, List, Search as SearchIcon, Type } from 'lucide-react'
import { BottomSheet } from '../shell/BottomSheet'
import { SelectionBar } from '../shell/SelectionBar'
import {
  FoliateView,
  FootnotePopover,
  SearchPanel,
  useAppPalette,
  usePrefersDark,
  useMarks,
  useBookmarking,
  uiText,
  useUiLanguage,
  findMark,
  citation,
  pageFilter,
  isPlaced,
} from '../../kernel/ui/mobile'
import {
  KERNEL_SETTINGS,
  positionRecorder,
  type KernelServices,
  type MarkTint,
  type PositionRecorder,
} from '../../kernel'
import { useTapToTurn } from '../shared/useTapToTurn'
import type { Annotation, BookMeta, BookmarkPlace, FootnoteRender, MarkAnchor, Placed, SearchHit, SelectionSnapshot, Source } from '../../kernel/ui/mobile'
import { externalTarget } from '../../kernel'
import type { TocItem } from 'foliate-js/view.js'
import {
  BRIGHTNESS,
  CONTRAST,
  measureForStep,
  pageMargins,
  ICON,
  proseGrid,
  stepAt,
  stepIndexForSize,
} from '../../kernel/core/metrics'
import { MobileTopBar } from './MobileTopBar'
import { MobileBottomConsole } from './MobileBottomConsole'
import { MobileAmbientFooter } from './MobileAmbientFooter'
import { MobileContentsDrawer } from './MobileContentsDrawer'
import { MobileAppearanceSheet } from './MobileAppearanceSheet'
import { useReadingPrefs } from './useReadingPrefs'
import { useImmersiveMode } from './useImmersiveMode'
import styles from './Reader.module.css'

export interface ReaderProps {
  readonly file: File | string | { readonly range: object; readonly name: string }
  readonly bookId: string
  readonly name: string
  readonly onClose: () => void
  readonly services: KernelServices
  readonly titleOf?: (bookId: string) => string | undefined
}

export function Reader({ file, bookId, name, onClose, services, titleOf }: ReaderProps) {
  const language = useUiLanguage()
  const [lastLocation] = useState(() => services.library.positionOf(bookId))
  const readingGeneration = useRef(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [footnote, setFootnote] = useState<FootnoteRender | null>(null)
  const [stageBox, setStageBox] = useState<HTMLDivElement | null>(null)
  const [toc, setToc] = useState<readonly TocItem[]>([])
  const [meta, setMeta] = useState<BookMeta | null>(null)
  const [fixedLayout, setFixedLayout] = useState(false)

  const marks = useMarks(services.marks, bookId)

  const takeMeta = useCallback((_generation: number, next: BookMeta) => {
    setMeta(next)
  }, [])

  const prefsStore = services.settings
  const prefs = useReadingPrefs(prefsStore)
  const prefersDark = usePrefersDark()
  const theme = prefs.themeFollowsOs ? (prefersDark ? 'night' : 'carta') : prefs.storedTheme
  const typeface = prefs.typeface
  const textSize = prefs.textSize
  const spacing = prefs.spacing
  const align = prefs.align
  const readingStyle = prefs.readingStyle
  const pageLayout = prefs.pageLayout

  const [screenHost, setScreenHost] = useState<HTMLElement | null>(null)
  useAppPalette(
    screenHost,
    theme,
    prefs.brightness,
    prefs.contrast,
  )

  useImmersiveMode(true)

  const [tool, setTool] = useState<'contents' | 'search' | 'notes' | 'settings' | 'appearance' | null>(null)
  const [chrome, setChrome] = useState(false)
  const [position, setPosition] = useState<{
    cfi: string | null
    sectionIndex: number | null
    sectionExact: boolean
    chapterLabel: string
    chapterHref: string
    fraction: number
  }>({
    cfi: lastLocation ?? null,
    sectionIndex: null,
    sectionExact: false,
    chapterLabel: '',
    chapterHref: '',
    fraction: 0,
  })

  const here = position.chapterHref
  const chapterLabel = position.chapterLabel
  const fraction = position.fraction

  const takeToc = useCallback((_generation: number, next: readonly TocItem[]) => setToc(next), [])

  const [stage, setStage] = useState(() => Math.min(window.innerWidth, 1200))
  const stageEl = useRef<HTMLDivElement | null>(null)
  const takeStage = useCallback((node: HTMLDivElement | null) => {
    stageEl.current = node
    setStageBox(node)
    if (node && node.clientWidth > 0) {
      setStage(Math.min(node.clientWidth, 1200))
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      const w = stageEl.current?.clientWidth || window.innerWidth
      setStage(Math.min(w, 1200))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const stepIdx = useMemo(() => stepIndexForSize(textSize), [textSize])

  // Mobile layout metrics: On phone screens (< 640px), provide clean, comfortable margins (16px per side)
  // instead of desktop proseGrid's 112px gutter+marginCol reservations.
  const readingMetrics = useMemo(() => {
    const mobileMargin = 16
    if (stage < 640) {
      const pageMargins = mobileMargin * 2
      const measure = Math.max(200, stage - pageMargins)
      return { measure, pageMargins }
    }
    const grid = proseGrid(stage, false, measureForStep(stepIdx))
    return {
      measure: grid.measure,
      pageMargins: pageMargins(grid),
    }
  }, [stage, stepIdx])
  const ignore = useCallback(() => {}, [])

  const followExternalLink = useCallback((detail: { href_: string }, event: Event) => {
    event.preventDefault()
    const target = externalTarget(detail.href_)
    if (target.kind === 'refuse') {
      setProblem(target.why)
      return
    }
    globalThis.open(target.url, '_blank', 'noopener,noreferrer')
  }, [])

  const navigator = useRef<{
    next: () => void
    prev: () => void
    goLeft: () => void
    goRight: () => void
    goTo: (target: string) => void
    goToFraction?: (fraction: number) => void
    search: (query: string, signal: AbortSignal) => AsyncGenerator<SearchHit>
    drawMark?: (anchor: MarkAnchor) => void
    eraseMark?: (anchor: MarkAnchor) => void
    deselect?: () => void
    setFootnoteMount?: (mount: HTMLElement | null, within: HTMLElement | null) => void
    closeFootnote?: () => void
    placeHere?: () => BookmarkPlace | null
  } | null>(null)

  const placeHere = useCallback(() => navigator.current?.placeHere?.() ?? null, [])
  const bookForBookmark = useMemo(
    () => ({
      bookId,
      position,
      placeHere,
    }),
    [bookId, position, placeHere],
  )
  const bookmarking = useBookmarking(bookForBookmark, marks)

  const footnoteMount = useRef<HTMLElement | null>(null)
  const footnoteSpace = useRef<HTMLElement | null>(null)
  const takeFootnoteMount = useCallback((mount: HTMLElement | null, within: HTMLElement | null) => {
    footnoteMount.current = mount
    footnoteSpace.current = within
    navigator.current?.setFootnoteMount?.(mount, within)
  }, [])

  const takeNavigator = useCallback((_generation: number, next: unknown) => {
    navigator.current = next as typeof navigator.current
    navigator.current?.setFootnoteMount?.(footnoteMount.current, footnoteSpace.current)
  }, [])

  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [tint, setTint] = useState<MarkTint>(() => prefsStore.get(KERNEL_SETTINGS.markTint))
  const [noteDraft, setNoteDraft] = useState<{
    readonly mark?: Placed<Annotation> | null
    readonly selection?: SelectionSnapshot | null
    readonly text: string
    readonly note: string
    readonly tint: MarkTint
  } | null>(null)

  const backState = useRef({ noteDraft: false, tool: null as typeof tool, chrome: false, selection: false })
  backState.current = { noteDraft: noteDraft !== null, tool, chrome, selection: selection !== null }

  useEffect(() => {
    const onNativeBack = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      const current = backState.current
      if (current.noteDraft) {
        setNoteDraft(null)
      } else if (current.tool !== null) {
        setTool(null)
      } else if (current.selection) {
        setSelection(null)
        navigator.current?.deselect?.()
      } else if (current.chrome) {
        setChrome(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('carta:native-back', onNativeBack)
    return () => window.removeEventListener('carta:native-back', onNativeBack)
  }, [onClose])

  const selectedMark = useMemo(() => {
    if (!selection || !bookId) return null
    return findMark(marks.current, {
      cfi: selection.cfi,
      sectionIndex: selection.sectionIndex,
      bookId,
    })
  }, [selection, marks.current, bookId])

  const highlight = useCallback(
    (note = '', tintToUse = tint) => {
      if (!selection || selection.cfi === '') return
      let createdAnchor: MarkAnchor | null = null
      try {
        const added = marks.add({
          bookId,
          cfi: selection.cfi,
          sectionIndex: selection.sectionIndex,
          text: selection.text,
          prefix: selection.prefix,
          suffix: selection.suffix,
          note: note === '' && selectedMark ? selectedMark.note : note,
          kind: 'highlight',
          tint: tintToUse,
          style: prefsStore.get(KERNEL_SETTINGS.markStyle) ?? 'fill',
          chapter: chapterLabel,
        })
        if (isPlaced(added)) {
          createdAnchor = added
        }
      } catch (cause) {
        setProblem(String(cause))
      }
      if (createdAnchor) {
        if (selectedMark && selectedMark.cfi !== createdAnchor.cfi) {
          navigator.current?.eraseMark?.(selectedMark)
        }
        navigator.current?.drawMark?.(createdAnchor)
      }
      setSelection(null)
      navigator.current?.deselect?.()
    },
    [selection, bookId, tint, marks, chapterLabel, selectedMark, prefsStore],
  )

  const onTint = useCallback(
    (next: MarkTint) => {
      setTint(next)
      prefsStore.set(KERNEL_SETTINGS.markTint, next)
      if (selection) {
        highlight(selectedMark ? selectedMark.note : '', next)
      }
    },
    [prefsStore, selection, selectedMark, highlight],
  )

  const sourceFor = useCallback(
    (sectionIndex: number): Source => ({
      title: meta?.title ?? name,
      author: meta?.author ?? '',
      chapter: chapterLabel,
      page: (meta?.pageCount ?? 0) > 0 ? sectionIndex + 1 : 0,
      fraction,
    }),
    [meta, name, chapterLabel, fraction],
  )

  const copySelection = useCallback(() => {
    if (!selection) return
    void globalThis.navigator.clipboard?.writeText(selection.text).catch(() => {})
  }, [selection])

  const copyCitation = useCallback(() => {
    if (!selection) return
    const textToCopy = citation(selection.text, sourceFor(selection.sectionIndex))
    void globalThis.navigator.clipboard?.writeText(textToCopy).catch(() => {})
  }, [selection, sourceFor])

  const turn = useCallback((intent: 'left' | 'right' | 'next' | 'prev') => {
    const nav = navigator.current
    if (nav === null) return
    if (intent === 'left') nav.goLeft()
    else if (intent === 'right') nav.goRight()
    else if (intent === 'next') nav.next()
    else nav.prev()
  }, [])

  const { watchDocument } = useTapToTurn({
    fixedLayout,
    stage: stageBox ?? stageEl,
    turn,
    hideChrome: useCallback(() => setChrome(false), []),
    toggleChrome: useCallback(() => setChrome((was) => !was), []),
  })

  const rememberRef = useRef(services.library.rememberPosition)
  rememberRef.current = services.library.rememberPosition

  const saver = useRef<PositionRecorder | null>(null)
  if (saver.current === null) {
    saver.current = positionRecorder({
      write: (id, at, fraction) => {
        void rememberRef.current(id, at, fraction).catch((cause: unknown) => setProblem(String(cause)))
      },
      delayMs: 2000,
    })
  }

  useEffect(() => {
    const recorder = saver.current
    if (!recorder) return
    const flush = () => recorder.flush()
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      recorder.flush()
      recorder.stop()
    }
  }, [])

  const remember = useCallback(
    (
      _generation: number,
      next: {
        cfi: string | null
        chapterHref?: string
        chapterLabel?: string
        fraction?: number
        sectionIndex?: number | null
        sectionExact?: boolean
      },
    ) => {
      if (next.cfi) {
        saver.current?.record(bookId, next.cfi, next.fraction ?? 0)
      }
      setPosition((prev) => {
        const nextCfi = next.cfi
        const nextFraction = next.fraction ?? 0
        const nextSectionIndex = next.sectionIndex ?? null
        const nextSectionExact = next.sectionExact ?? false
        const nextChapterLabel = next.chapterLabel ?? ''
        const nextChapterHref = next.chapterHref ?? ''
        if (
          prev.cfi === nextCfi &&
          prev.fraction === nextFraction &&
          prev.sectionIndex === nextSectionIndex &&
          prev.sectionExact === nextSectionExact &&
          prev.chapterLabel === nextChapterLabel &&
          prev.chapterHref === nextChapterHref
        ) {
          return prev
        }
        return {
          cfi: nextCfi,
          sectionIndex: nextSectionIndex,
          sectionExact: nextSectionExact,
          chapterLabel: nextChapterLabel,
          chapterHref: nextChapterHref,
          fraction: nextFraction,
        }
      })
    },
    [bookId],
  )

  // Flattened TOC for chapter navigation
  const flatToc = useMemo(() => {
    const list: Array<{ label: string; href: string }> = []
    const walk = (items: readonly TocItem[]) => {
      for (const it of items) {
        if (it.href) list.push({ label: it.label || '', href: it.href })
        if (it.subitems) walk(it.subitems)
      }
    }
    walk(toc)
    return list
  }, [toc])

  const currentChapterIdx = useMemo(() => {
    if (!here || flatToc.length === 0) return -1
    return flatToc.findIndex((it) => it.href && (here === it.href || here.includes(it.href)))
  }, [here, flatToc])

  const hasPrevChapter = currentChapterIdx > 0
  const hasNextChapter = currentChapterIdx >= 0 && currentChapterIdx < flatToc.length - 1

  const onPrevChapter = useCallback(() => {
    if (currentChapterIdx > 0) {
      const prev = flatToc[currentChapterIdx - 1]
      if (prev?.href) navigator.current?.goTo(prev.href)
    }
  }, [currentChapterIdx, flatToc])

  const onNextChapter = useCallback(() => {
    if (currentChapterIdx >= 0 && currentChapterIdx < flatToc.length - 1) {
      const next = flatToc[currentChapterIdx + 1]
      if (next?.href) navigator.current?.goTo(next.href)
    }
  }, [currentChapterIdx, flatToc])

  const onScrub = useCallback((targetFraction: number) => {
    setPosition((prev) => ({ ...prev, fraction: targetFraction }))
    if (navigator.current?.goToFraction) {
      navigator.current.goToFraction(targetFraction)
    } else {
      navigator.current?.goTo({ fraction: targetFraction } as unknown as string)
    }
  }, [])

  const onToggleTheme = useCallback(() => {
    const nextTheme = theme === 'night' ? 'carta' : 'night'
    prefsStore.set(KERNEL_SETTINGS.theme, nextTheme)
    prefsStore.set(KERNEL_SETTINGS.themeFollowsOs, false)
  }, [theme, prefsStore])

  const jacketSaved = useRef(false)
  const onCover = useCallback(
    (_generation: number, cover: Blob | null) => {
      if (cover && !jacketSaved.current) {
        jacketSaved.current = true
        void services.library
          .keepJacket(bookId, cover)
          .catch((cause: unknown) => setProblem(String(cause)))
      }
    },
    [bookId, services.library],
  )

  const onError = useCallback((_generation: number, message: string) => {
    setProblem(message)
  }, [])

  const onFixedLayout = useCallback((_generation: number, fixed: boolean) => {
    setFixedLayout(fixed)
  }, [])

  const searchable = useMemo(
    () => ({
      source: typeof file === 'string' ? null : (file as File),
      meta,
      error: problem,
      search: async function* (query: string, signal: AbortSignal) {
        let nav = navigator.current
        while ((nav === undefined || nav === null) && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 100))
          nav = navigator.current
        }
        if (nav === undefined || nav === null) return
        yield* nav.search(query, signal)
      },
      goTo: (target: string) => navigator.current?.goTo(target),
    }),
    [file, meta, problem],
  )

  const displayTitle = meta?.title ?? titleOf?.(bookId) ?? name

  return (
    <main className={styles.screen} ref={setScreenHost} data-theme={theme}>
      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <MobileTopBar
        name={name}
        title={displayTitle}
        chapterLabel={chapterLabel}
        chrome={chrome}
        onClose={onClose}
        bookmarking={bookmarking}
        onOpenTools={() => setTool((was) => (was === null ? (toc.length > 0 ? 'contents' : 'search') : null))}
      />

      {/* ── Problem Notification Banner ────────────────────────────────────── */}
      {problem !== null && (
        <div className={styles.problem} role="alert">
          <span>{problem}</span>
          <button className="carta-cap-button" type="button" onClick={() => setProblem(null)}>
            {uiText(language, '关闭', 'Dismiss')}
          </button>
        </div>
      )}

      {/* ── Ambient Status Line (Fullscreen Immersion Mode) ─────────────────── */}
      <MobileAmbientFooter
        chapterLabel={chapterLabel}
        fraction={fraction}
        visible={!chrome && selection === null}
      />

      {/* ── Bottom Control Console (When Chrome is Shown) ───────────────────── */}
      <MobileBottomConsole
        fraction={fraction}
        chapterLabel={chapterLabel}
        chrome={chrome}
        visible={selection === null}
        onScrub={onScrub}
        onPrevChapter={onPrevChapter}
        onNextChapter={onNextChapter}
        hasPrevChapter={hasPrevChapter}
        hasNextChapter={hasNextChapter}
        onOpenContents={() => setTool('contents')}
        onOpenAppearance={() => setTool('appearance')}
        onToggleTheme={onToggleTheme}
        onOpenSearch={() => setTool('search')}
        onOpenNotes={() => setTool('notes')}
        theme={theme}
      />

      {/* ── Selection Floating Toolbar ─────────────────────────────────────── */}
      {selection !== null && (
        <SelectionBar
          text={selection.text}
          tint={tint}
          onTint={onTint}
          onHighlight={() => highlight('')}
          onNote={() => {
            setNoteDraft({
              mark: selectedMark,
              selection,
              text: selection.text,
              note: selectedMark?.note ?? '',
              tint,
            })
          }}
          onUnmark={
            selectedMark
              ? () => {
                  navigator.current?.eraseMark?.(selectedMark)
                  marks.remove(selectedMark)
                  setSelection(null)
                  navigator.current?.deselect?.()
                }
              : undefined
          }
          onCite={copyCitation}
          onCopy={copySelection}
        />
      )}

      {/* ── Secondary Sheets (TOC / Notes / Appearance / Search) ─────────────── */}
      {tool !== null && (
        <BottomSheet
          label={uiText(language, '阅读工具', 'Tools')}
          height={tool === 'appearance' || tool === 'settings' ? 0.78 : 0.82}
          onDismiss={() => setTool(null)}
          foot={
            <nav className={styles.toolTabs} aria-label={uiText(language, '阅读工具', 'Tools')}>
              {toc.length > 0 && (
                <button
                  type="button"
                  className={styles.toolTab}
                  aria-pressed={tool === 'contents'}
                  aria-label={uiText(language, '目录', 'Contents')}
                  onClick={() => setTool('contents')}
                >
                  <List size={ICON.tab} strokeWidth={ICON.stroke} />
                </button>
              )}
              <button
                type="button"
                className={styles.toolTab}
                aria-pressed={tool === 'search'}
                aria-label={uiText(language, '搜索', 'Search')}
                onClick={() => setTool('search')}
              >
                <SearchIcon size={ICON.tab} strokeWidth={ICON.stroke} />
              </button>
              <button
                type="button"
                className={styles.toolTab}
                aria-pressed={tool === 'notes'}
                aria-label={uiText(language, '笔记', 'Notes')}
                onClick={() => setTool('notes')}
              >
                <Highlighter size={ICON.tab} strokeWidth={ICON.stroke} />
              </button>
              <button
                type="button"
                className={styles.toolTab}
                aria-pressed={tool === 'settings' || tool === 'appearance'}
                aria-label={uiText(language, '阅读排版', 'Reading')}
                onClick={() => setTool('appearance')}
              >
                <Type size={ICON.tab} strokeWidth={ICON.stroke} />
              </button>
            </nav>
          }
        >
          {tool === 'contents' && (
            <MobileContentsDrawer
              toc={toc}
              currentHref={here}
              onGoTo={(href) => {
                navigator.current?.goTo(href)
                setTool(null)
              }}
              marks={marks}
              onDeleteBookmark={(mark) => {
                void marks.remove(mark)
              }}
              onDeleteAnnotation={(mark) => {
                const target = marks.current.find((m) => m.id === mark.id)
                if (target) navigator.current?.eraseMark?.(target)
                void marks.remove(mark)
              }}
              initialTab="contents"
            />
          )}
          {tool === 'notes' && (
            <MobileContentsDrawer
              toc={toc}
              currentHref={here}
              onGoTo={(target) => {
                navigator.current?.goTo(target)
                setTool(null)
              }}
              marks={marks}
              onDeleteBookmark={(mark) => {
                void marks.remove(mark)
              }}
              onDeleteAnnotation={(mark) => {
                const target = marks.current.find((m) => m.id === mark.id)
                if (target) navigator.current?.eraseMark?.(target)
                void marks.remove(mark)
              }}
              onEditAnnotation={(mark) => {
                setTool(null)
                setNoteDraft({
                  mark,
                  text: mark.text,
                  note: mark.note,
                  tint: mark.tint,
                })
              }}
              initialTab="notes"
            />
          )}
          {tool === 'search' && <SearchPanel book={searchable} />}
          {(tool === 'settings' || tool === 'appearance') && (
            <MobileAppearanceSheet settings={prefsStore} />
          )}
        </BottomSheet>
      )}

      {/* ── Note Editor BottomSheet ────────────────────────────────────────── */}
      {noteDraft !== null && (
        <BottomSheet
          label={uiText(language, '笔记', 'Note')}
          height={0.55}
          onDismiss={() => setNoteDraft(null)}
        >
          <div className={styles.noteSheetBody}>
            <div className={styles.noteSheetHeader}>
              <h2 className={styles.noteSheetTitle}>
                {noteDraft.mark ? uiText(language, '编辑笔记', 'Edit note') : uiText(language, '添加笔记', 'Add note')}
              </h2>
              <div className={styles.noteSheetTints}>
                {(['yellow', 'green', 'purple'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={styles.noteSheetSwatch}
                    data-tint={t}
                    aria-label={uiText(language, `${t === 'yellow' ? '黄色' : t === 'green' ? '绿色' : '紫色'}高亮`, `${t} highlight`)}
                    aria-pressed={noteDraft.tint === t}
                    onClick={() => setNoteDraft((prev) => (prev ? { ...prev, tint: t } : null))}
                  />
                ))}
              </div>
            </div>

            {noteDraft.text && (
              <div
                className={styles.noteSheetQuote}
                style={{
                  borderLeftColor:
                    noteDraft.tint === 'green'
                      ? '#22c55e'
                      : noteDraft.tint === 'purple'
                        ? '#a855f7'
                        : '#eab308',
                }}
              >
                {noteDraft.text}
              </div>
            )}

            <textarea
              className={styles.noteTextarea}
              placeholder={uiText(language, '写下你的想法或书摘感悟…', 'Write your thoughts about this passage…')}
              value={noteDraft.note}
              autoFocus
              rows={4}
              onChange={(e) => {
                const val = e.target.value
                setNoteDraft((prev) => (prev ? { ...prev, note: val } : null))
              }}
            />

            <div className={styles.noteSheetActions}>
              <button
                type="button"
                className={styles.noteCancelBtn}
                onClick={() => setNoteDraft(null)}
              >
                {uiText(language, '取消', 'Cancel')}
              </button>
              <button
                type="button"
                className={styles.noteSaveBtn}
                onClick={() => {
                  const toSave = noteDraft
                  if (toSave.mark) {
                    const mark = toSave.mark
                    void Promise.all([
                      services.marks.updateNote(mark.id, toSave.note, mark.bookId),
                      services.marks.setTint(mark.id, toSave.tint, mark.bookId),
                    ]).then(() => {
                      navigator.current?.drawMark?.({
                        cfi: mark.cfi,
                        sectionIndex: mark.sectionIndex,
                        kind: mark.kind,
                        tint: toSave.tint,
                        style: mark.style,
                      })
                      setNoteDraft(null)
                    }).catch((cause: unknown) => {
                      setProblem(uiText(language, `笔记保存失败：${String(cause)}`, `Could not save the note: ${String(cause)}`))
                    })
                  } else if (toSave.selection) {
                    highlight(toSave.note, toSave.tint)
                    setNoteDraft(null)
                  }
                }}
              >
                {uiText(language, '保存', 'Save')}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Document Stage ─────────────────────────────────────────────────── */}
      <div
        className={styles.stage}
        data-fixed-layout={fixedLayout}
        style={
          {
            '--carta-page-filter': fixedLayout
              ? pageFilter({
                  theme,
                  brightness: prefs.brightness,
                  contrast: prefs.contrast,
                })
              : 'none',
          } as React.CSSProperties
        }
        ref={takeStage}
      >
        <FoliateView
          file={file}
          generation={readingGeneration.current}
          style={readingStyle}
          stepIdx={stepIdx}
          measure={readingMetrics.measure}
          pageMargins={readingMetrics.pageMargins}
          theme={theme}
          typeface={typeface}
          spacing={spacing}
          align={align}
          brightness={stepAt(BRIGHTNESS, prefs.brightness)}
          contrast={stepAt(CONTRAST, prefs.contrast)}
          animated
          paginated={pageLayout === 'paginated'}
          lastLocation={lastLocation}
          onToc={takeToc}
          onRelocate={remember}
          onDocument={watchDocument}
          onMeta={takeMeta}
          onCover={onCover}
          onError={onError}
          onNavigator={takeNavigator}
          marks={marks.current}
          onSelection={setSelection}
          onMarkDrawn={ignore}
          onLink={ignore}
          onExternalLink={followExternalLink}
          onFootnote={setFootnote}
          onFileDropped={ignore}
          onPageIntent={turn}
          onFixedLayout={onFixedLayout}
          onDirection={ignore}
        />
        <FootnotePopover
          note={footnote}
          stage={stageBox}
          column={null}
          onMount={takeFootnoteMount}
          onCopy={copySelection}
          onDismiss={() => {
            navigator.current?.closeFootnote?.()
            setFootnote(null)
          }}
        />
      </div>
    </main>
  )
}
