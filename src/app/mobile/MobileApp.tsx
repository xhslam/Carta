import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cards,
  Library,
  coverIn,
  resolvePlatform,
  tauriVaultFs,
  TrashSheet,
  useAppPalette,
  useCards,
  useLibrary,
  usePrefersDark,
  UiLanguageProvider,
} from '../../kernel/ui/mobile'
import {
  KERNEL_SETTINGS,
  contentPathIn,
  listTrash,
  storedBookName,
  type BookRecord,
  type Composition,
  type IndexedBook,
  type KernelServices,
  type TrashedBook,
} from '../../kernel'
import { TabBar, type Tab } from '../shell/TabBar'
import { ContinueStrip } from '../shell/ContinueStrip'
import { ReadingSettings } from './ReadingSettings'
import { importMobileBook } from './importBooks'
import { useThemePrefs } from './useReadingPrefs'
import styles from '../shell/shell.module.css'
import { Reader } from './Reader'
import { localContent } from './localContent'
import { useUiLanguagePreference } from './useUiLanguage'

export interface MobileAppProps {
  readonly services: KernelServices
  readonly shelfUnread: boolean
  readonly composition: Composition
  readonly bootNotice?: string | null
}

const deviceCovers = (bookId: string) => coverIn(tauriVaultFs, bookId)

export function MobileApp({
  services,
  shelfUnread,
  composition,
  bootNotice = null,
}: MobileAppProps) {
  const [language, setLanguage] = useUiLanguagePreference()
  const [tab, setTab] = useState<Tab>('library')
  const tabRef = useRef<Tab>('library')
  const tabHistory = useRef<Tab[]>([])
  const [query, setQuery] = useState('')
  const library = useLibrary(services.library)
  const cards = useCards(services.cards)
  const [platform] = useState(resolvePlatform)

  const settings = services.settings
  const themePrefs = useThemePrefs(settings)

  const prefersDark = usePrefersDark()
  const theme = themePrefs.themeFollowsOs
    ? prefersDark
      ? 'night'
      : 'carta'
    : themePrefs.theme
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  useAppPalette(
    host,
    theme,
    themePrefs.brightness,
    themePrefs.contrast,
  )

  useEffect(() => {
    // Mobile reading standard: default to paginated (左右翻页) layout unless explicitly configured.
    const key = 'carta.mobile.pageLayoutInitialized'
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        settings.set(KERNEL_SETTINGS.pageLayout, 'paginated')
      }
    } catch {
      settings.set(KERNEL_SETTINGS.pageLayout, 'paginated')
    }
  }, [settings])

  const [notice, setNotice] = useState<string | null>(bootNotice)
  const picker = useRef<HTMLInputElement>(null)
  const importingNow = useRef(false)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)

  const [currentBook, setCurrentBook] = useState<IndexedBook | null>(null)
  const [currentFile, setCurrentFile] = useState<File | { readonly range: object; readonly name: string } | null>(null)
  const [readingSession, setReadingSession] = useState(0)

  const selectTab = useCallback((next: Tab) => {
    const current = tabRef.current
    if (next === current) return
    tabHistory.current.push(current)
    tabRef.current = next
    setTab(next)
  }, [])

  useEffect(() => {
    const onNativeBack = (event: Event) => {
      // A reader sheet gets the first chance to consume this event.
      queueMicrotask(() => {
        if (event.defaultPrevented) return
        const previous = tabHistory.current.pop()
        if (!previous) return
        tabRef.current = previous
        setTab(previous)
      })
    }
    window.addEventListener('carta:native-back', onNativeBack)
    return () => window.removeEventListener('carta:native-back', onNativeBack)
  }, [])

  const [trashOpen, setTrashOpen] = useState(false)
  const [trashRows, setTrashRows] = useState<readonly TrashedBook[] | null>(null)
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashError, setTrashError] = useState<string | null>(null)

  const openBook = useCallback(
    async (entry: IndexedBook) => {
      if (!services.fs) {
        setImportNotice(language === 'zh' ? '设备存储不可用。' : 'Device storage is unavailable.')
        return
      }
      let targetEntry = entry
      const cleanTitle = (entry.title || (language === 'zh' ? '未命名' : 'Untitled')).replace(/(\.pdf)+$/gi, '').trim() || (language === 'zh' ? '未命名' : 'Untitled')
      if (cleanTitle !== entry.title) {
        void services.library.update(entry.bookId, (r: BookRecord) => ({ ...r, title: cleanTitle })).catch(() => {})
        targetEntry = { ...entry, title: cleanTitle }
      }
      const name = storedBookName(targetEntry)
      try {
        setImportNotice(null)
        const content = localContent({
          fs: services.fs,
          bookOf: (id) => services.library.getSnapshot().find((b: IndexedBook) => b.bookId === id),
          sizes: services.sizes(),
        })
        const facts = await content.locate(entry.bookId)
        if (!facts.here) {
          setImportNotice(language === 'zh' ? '书架中缺少这本书的正文文件。' : 'Your library does not have this book’s pages.')
          return
        }
        let source: File | { readonly range: object; readonly name: string }
        if (facts.ext === 'pdf') {
          let pdfSize = facts.size
          if (typeof pdfSize !== 'number' || pdfSize <= 0) {
            const found = contentPathIn(entry.bookId, name)
            const probed = await services.sizes()?.bytesAt(found).catch(() => null)
            if (typeof probed === 'number' && probed > 0) {
              pdfSize = probed
            }
          }
          if (typeof pdfSize === 'number' && pdfSize > 0) {
            const { pdfRangeTransport } = await import('../shared/pdfRange')
            const range = await pdfRangeTransport(content, entry.bookId, pdfSize, {
              onFailure: (cause) => setImportNotice(String(cause)),
              contentHash: facts.contentHash,
            })
            source = { range, name }
          } else {
            console.error('Carta: refusing to load whole PDF into mobile memory without ranged size', entry.bookId)
            setImportNotice(language === 'zh' ? '无法安全打开此 PDF，请重新导入。' : 'This PDF could not be opened safely. Please try re-importing.')
            return
          }
        } else {
          source = await content.fileOf(entry.bookId, name)
        }
        setCurrentBook(targetEntry)
        setCurrentFile(source)
        setReadingSession((n) => n + 1)
        selectTab('reading')
        void services.library
          .update(entry.bookId, (record: BookRecord) => ({ ...record, openedAt: Date.now() }))
          .catch((cause: unknown) => setImportNotice(String(cause)))
      } catch (cause) {
        console.error('Failed to open book:', cause)
        setImportNotice(language === 'zh' ? '无法打开这本书，请重新添加。' : 'That book could not be opened. Try adding it again.')
      }
    },
    [services, selectTab, language],
  )

  const openTrash = useCallback(async () => {
    if (!services.fs) return
    setTrashOpen(true)
    setTrashLoading(true)
    setTrashError(null)
    try {
      const rows = await listTrash(services.fs)
      setTrashRows(rows)
    } catch (e) {
      setTrashError(String(e))
    } finally {
      setTrashLoading(false)
    }
  }, [services.fs])

  const restoreTrashBook = useCallback(
    async (bookId: string) => {
      try {
        await services.library.restore(bookId)
        if (services.fs) {
          const rows = await listTrash(services.fs)
          setTrashRows(rows)
        }
      } catch (e) {
        setTrashError(String(e))
      }
    },
    [services],
  )

  const importFiles = async (files: readonly File[]) => {
    if (importingNow.current || files.length === 0) return
    importingNow.current = true
    setImportNotice(null)
    let added = 0
    const failures: string[] = []
    try {
      for (const [index, file] of files.entries()) {
        setImporting({ done: index, total: files.length })
        try {
          await importMobileBook(services, file)
          added += 1
        } catch (cause) {
          failures.push(`${file.name}: ${String(cause)}`)
        }
      }
      setImportNotice(
        language === 'zh'
          ? `已保存 ${added} 本书。${failures.length ? ` 以下文件导入失败：${failures.join('；')}` : ''}`
          : `${added} book(s) saved.${failures.length ? ' Could not import: ' + failures.join('; ') : ''}`,
      )
    } finally {
      importingNow.current = false
      setImporting(null)
    }
  }

  const titleOf = useCallback(
    (id: string) => services.library.getSnapshot().find((b: IndexedBook) => b.bookId === id)?.title,
    [services.library],
  )
  const onCloseReader = useCallback(() => {
    tabHistory.current = tabHistory.current.filter((entry) => entry !== 'reading')
    tabRef.current = 'library'
    setTab('library')
    void services.drain().catch((cause: unknown) => setImportNotice(String(cause)))
  }, [services])

  if (tab === 'reading' && currentBook && currentFile) {
    return (
      <UiLanguageProvider language={language}>
        <Reader
          key={`${currentBook.bookId}:${readingSession}`}
          file={currentFile}
          bookId={currentBook.bookId}
          name={storedBookName(currentBook)}
          services={services}
          titleOf={titleOf}
          onClose={onCloseReader}
        />
      </UiLanguageProvider>
    )
  }

  return (
    <UiLanguageProvider language={language}>
    <div className={styles.shell} ref={setHost} data-theme={theme} lang={language === 'zh' ? 'zh-CN' : 'en'}>
      <input
        ref={picker}
        type="file"
        hidden
        multiple
        aria-label={language === 'zh' ? '导入书籍' : 'Import books'}
        accept=".epub,.pdf,.mobi,.azw3,.fb2,.fbz,.cbz,application/epub+zip,application/pdf"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          void importFiles(files)
        }}
      />
      {tab === 'library' && (
        <div className={`${styles.stage} ${styles.shelfStage}`}>
          <ContinueStrip books={library.books} onOpen={openBook} coverFor={deviceCovers} />
          <div className={styles.stageList}>
            <Library
              books={library.books}
              coverFor={deviceCovers}
              platform={platform}
              shelfUnread={shelfUnread}
              onOpen={openBook}
              onRemove={(entry) => {
                void services.library.remove(entry.bookId).catch((e: unknown) => setImportNotice(String(e)))
              }}
              onTagBooks={library.tagBooks}
              onUntagBooks={library.untagBooks}
              lastRemoval={library.lastRemoval}
              onUndoRemoveTag={library.undoRemoveTag}
              onSetFinished={(bookId, finished) => {
                void services.library
                  .setFinished(bookId, finished)
                  .catch((e: unknown) => setImportNotice(String(e)))
              }}
              saveFailure={library.saveFailure}
              onDismissSaveFailure={library.dismissSaveFailure}
              libraryQuery={query}
              onQueryChange={setQuery}
              defaultLayout="list"
              bootNotice={notice}
              onDismissBootNotice={() => setNotice(null)}
              onAddBooks={services.fs ? () => picker.current?.click() : undefined}
              importing={importing}
              enriching={0}
              importNotice={importNotice}
              bookActions={composition.bookActions}
              bookStatuses={composition.bookStatuses}
            />
          </div>
        </div>
      )}
      {tab === 'cards' && (
        <div className={`${styles.stage} ${styles.screen}`}>
          <h1 className={styles.screenTitle}>{language === 'zh' ? '卡片' : 'Cards'}</h1>
          <Cards
            cards={{
              all: cards.all,
              persistent: cards.persistent,
              discard: cards.discard,
            }}
            bookId={null}
          />
        </div>
      )}
      {tab === 'settings' && (
        <div className={`${styles.stage} ${styles.screen}`}>
          <h1 className={styles.screenTitle}>{language === 'zh' ? '设置' : 'Settings'}</h1>
          <ReadingSettings
            settings={settings}
            sections={composition.settings}
            language={language}
            onLanguage={setLanguage}
          />
          {services.fs && (
            <div style={{ padding: '1rem', width: '100%', boxSizing: 'border-box' }}>
              <button
                type="button"
                className="carta-cap-button"
                onClick={openTrash}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {language === 'zh' ? '回收站与已移除书籍' : 'Trash & Removed Books'}
              </button>
            </div>
          )}
        </div>
      )}
      {trashOpen && (
        <TrashSheet
          rows={trashRows ?? []}
          now={Date.now()}
          loading={trashLoading}
          error={trashError}
          onRestore={restoreTrashBook}
          onDismiss={() => setTrashOpen(false)}
        />
      )}
      <TabBar active={tab} onSelect={selectTab} hasBook={currentBook !== null} />
    </div>
    </UiLanguageProvider>
  )
}
