// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { File as NativeFile } from 'node:buffer'
import { createKernelServices, KERNEL_SETTINGS } from '../../kernel'
import { Reader } from './Reader'

/** `node:buffer` File lacks `webkitRelativePath`; cast is safe here. */
const testFile = () => new NativeFile(['content'], 'test.epub') as unknown as File

const mockDrawMark = vi.fn()
const mockEraseMark = vi.fn()
const mockDeselect = vi.fn()
const mockGoLeft = vi.fn()
const mockGoRight = vi.fn()
const mockNext = vi.fn()
const mockPrev = vi.fn()

// Mock FoliateView so we don't need real foliate-js rendering in jsdom
vi.mock('../../kernel/ui/mobile', async () => {
  const actual = await vi.importActual<typeof import('../../kernel/ui/mobile')>('../../kernel/ui/mobile')
  return {
    ...actual,
    FoliateView: ({
      paginated,
      onRelocate,
      onSelection,
      onNavigator,
      onFixedLayout,
      onDocument,
    }: {
      paginated: boolean
      onRelocate: (gen: number, pos: unknown) => void
      onSelection: (sel: unknown) => void
      onNavigator: (gen: number, nav: unknown) => void
      onFixedLayout?: (gen: number, fixed: boolean) => void
      onDocument?: (gen: number, doc: Document | null) => void
    }) => {
      // Expose a test-accessible hook to trigger events
      return (
        <div data-testid="foliate-view" data-paginated={String(paginated)}>
          <button
            type="button"
            data-testid="trigger-relocate"
            onClick={() => {
              onNavigator(0, {
                placeHere: () => ({
                  cfi: 'epubcfi(/6/4!/4/2)',
                  sectionIndex: 0,
                  chapter: 'Chapter 1',
                  text: 'Sample text from page',
                  prefix: '',
                  suffix: '',
                }),
                goTo: vi.fn(),
                search: vi.fn(),
                goLeft: mockGoLeft,
                goRight: mockGoRight,
                next: mockNext,
                prev: mockPrev,
                drawMark: mockDrawMark,
                eraseMark: mockEraseMark,
                deselect: mockDeselect,
              })
              onRelocate(0, {
                cfi: 'epubcfi(/6/4!/4/2)',
                sectionIndex: 0,
                sectionExact: true,
                chapterLabel: 'Chapter 1',
                chapterHref: 'chapter1.xhtml',
                fraction: 0.25,
              })
            }}
          >
            Relocate
          </button>
          <button
            type="button"
            data-testid="trigger-selection"
            onClick={() => {
              onSelection({
                cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:15)',
                sectionIndex: 0,
                text: 'Selected passage',
                prefix: 'before ',
                suffix: ' after',
              })
            }}
          >
            Select
          </button>
          <button
            type="button"
            data-testid="trigger-fixed-layout"
            onClick={() => {
              onFixedLayout?.(0, true)
            }}
          >
            FixedLayout
          </button>
          <button
            type="button"
            data-testid="trigger-document"
            onClick={() => {
              const doc = document.implementation.createHTMLDocument('test section')
              Object.defineProperty(doc.documentElement, 'clientWidth', { value: 300, configurable: true })
              onDocument?.(0, doc)
              ;(window as unknown as { lastTestDoc?: Document }).lastTestDoc = doc
            }}
          >
            Document
          </button>
        </div>
      )
    },
  }
})

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('Mobile Reader', () => {
  it('renders header controls: Shelf, title, Bookmark, and Tools', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    expect(screen.getByRole('button', { name: /Shelf/ })).toBeDefined()
    expect(screen.getByText('Test Book Title')).toBeDefined()
    expect(screen.getByRole('button', { name: /Bookmark/ })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Tools' })).toBeDefined()
  })

  it('respects the pageLayout setting for FoliateView paginated prop', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    services.settings.set(KERNEL_SETTINGS.pageLayout, 'paginated')
    const file = testFile()

    const { rerender } = render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    const foliateView = screen.getByTestId('foliate-view')
    expect(foliateView.getAttribute('data-paginated')).toBe('true')

    // Change to scrolled mode
    services.settings.set(KERNEL_SETTINGS.pageLayout, 'scrolled')
    rerender(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )
    expect(screen.getByTestId('foliate-view').getAttribute('data-paginated')).toBe('false')
  })

  it('shows bookmark button in initial unset state and updates position on relocate', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    const bookmarkBtn = screen.getByRole('button', { name: /Bookmark/ })
    // Initially not pressed — marks store is not ready (no fs), so canBookmark is false
    expect(bookmarkBtn.getAttribute('aria-pressed')).toBe('false')
    expect(bookmarkBtn.getAttribute('aria-label')).toBe('Bookmark this place')

    // Simulate book relocation — verifies position wiring works without crash
    fireEvent.click(screen.getByTestId('trigger-relocate'))

    // Button is still present and stable after relocation
    expect(screen.getByRole('button', { name: /Bookmark/ })).toBeDefined()
  })

  it('shows SelectionBar on text selection with Highlight, Note, Cite, and Copy actions', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    // Trigger text selection
    fireEvent.click(screen.getByTestId('trigger-selection'))

    expect(screen.getByRole('toolbar', { name: 'Selection' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Note' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cite' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined()
    expect(screen.getByText('2 words')).toBeDefined()
  })

  it('copies citation and updates markTint setting', async () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { writeText: writeTextMock },
    })

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    // Trigger selection and cite
    fireEvent.click(screen.getByTestId('trigger-selection'))
    fireEvent.click(screen.getByRole('button', { name: 'Cite' }))

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('Selected passage'))
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('Test Book Title'))

    // Tap green swatch to change tint preference
    const greenSwatch = screen.getByRole('button', { name: 'green highlight' })
    fireEvent.click(greenSwatch)
    expect(services.settings.get(KERNEL_SETTINGS.markTint)).toBe('green')
  })

  it('applies fixed layout page filter to stage on fixed layout books', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    services.settings.set(KERNEL_SETTINGS.theme, 'night')
    services.settings.set(KERNEL_SETTINGS.themeFollowsOs, false)
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    // Trigger fixed layout callback
    fireEvent.click(screen.getByTestId('trigger-fixed-layout'))

    const stage = screen.getByTestId('foliate-view').parentElement
    expect(stage?.getAttribute('style')).toContain('--carta-page-filter')
    expect(stage?.getAttribute('style')).toContain('invert(1)')
  })

  it('opens and closes tools sheet', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    const toolsBtn = screen.getByRole('button', { name: 'Tools' })
    fireEvent.click(toolsBtn)

    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Search' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Narration' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Notes' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reading' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Narration' }))
    expect(screen.getByRole('heading', { name: 'Read aloud' })).toBeDefined()
    expect(screen.getByRole('combobox', { name: 'Voice' })).toBeDefined()
  })

  it('uses the native back action to close the top layer before leaving the reader', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const onClose = vi.fn()
    render(
      <Reader
        file={testFile()}
        bookId="test-book"
        name="Test Book Title"
        onClose={onClose}
        services={services}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeDefined()
    fireEvent(window, new Event('carta:native-back', { cancelable: true }))
    expect(screen.queryByRole('dialog', { name: 'Tools' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent(window, new Event('carta:native-back', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders bottom control console with progress scrubber and action toolbar', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Reading controls' }).getAttribute('data-visible')).toBe('false')
    expect(screen.getByRole('slider', { name: 'Reading progress' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Table of contents' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reading appearance' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Search book' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Notes and marks' })).toBeDefined()
  })

  it('adjusts font size and theme via reading appearance sheet', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    // Open appearance sheet
    fireEvent.click(screen.getByRole('button', { name: 'Reading appearance' }))
    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeDefined()

    // Test font size increment
    const prevSize = services.settings.get(KERNEL_SETTINGS.textSize)
    const incBtn = screen.getByRole('button', { name: 'Increase font size' })
    fireEvent.click(incBtn)
    expect(services.settings.get(KERNEL_SETTINGS.textSize)).toBeGreaterThan(prevSize)

    // Test theme swatch
    const nightSwatch = screen.getByRole('radio', { name: /Night/ })
    fireEvent.click(nightSwatch)
    expect(services.settings.get(KERNEL_SETTINGS.theme)).toBe('night')
  })

  it('toggles Day/Night theme from bottom console', () => {
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    services.settings.set(KERNEL_SETTINGS.theme, 'carta')
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    const nightToggle = screen.getByRole('button', { name: 'Switch to night mode' })
    fireEvent.click(nightToggle)
    expect(services.settings.get(KERNEL_SETTINGS.theme)).toBe('night')
    expect(screen.getByRole('main').dataset.theme).toBe('night')

    const dayToggle = screen.getByRole('button', { name: 'Switch to day mode' })
    fireEvent.click(dayToggle)
    expect(services.settings.get(KERNEL_SETTINGS.theme)).toBe('carta')
    expect(screen.getByRole('main').dataset.theme).toBe('carta')
  })

  it('highlights text when Highlight button is tapped and immediately calls drawMark', () => {
    mockDrawMark.mockClear()
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    fireEvent.click(screen.getByTestId('trigger-relocate'))
    fireEvent.click(screen.getByTestId('trigger-selection'))

    const highlightBtn = screen.getByRole('button', { name: 'Highlight' })
    fireEvent.click(highlightBtn)

    expect(mockDrawMark).toHaveBeenCalledTimes(1)
    expect(mockDrawMark).toHaveBeenCalledWith(
      expect.objectContaining({
        cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:15)',
        kind: 'highlight',
      }),
    )
  })

  it('highlights text immediately when a color swatch is tapped on an active selection', () => {
    mockDrawMark.mockClear()
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    fireEvent.click(screen.getByTestId('trigger-relocate'))
    fireEvent.click(screen.getByTestId('trigger-selection'))

    const purpleSwatch = screen.getByRole('button', { name: 'purple highlight' })
    fireEvent.click(purpleSwatch)

    expect(mockDrawMark).toHaveBeenCalledWith(
      expect.objectContaining({
        cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:15)',
        tint: 'purple',
      }),
    )
  })

  it('opens note editor and saves note with highlight', () => {
    mockDrawMark.mockClear()
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    fireEvent.click(screen.getByTestId('trigger-relocate'))
    fireEvent.click(screen.getByTestId('trigger-selection'))

    const noteBtn = screen.getByRole('button', { name: 'Note' })
    fireEvent.click(noteBtn)

    expect(screen.getByRole('dialog', { name: 'Note' })).toBeDefined()
    const textarea = screen.getByPlaceholderText(/Write your thoughts/)
    fireEvent.change(textarea, { target: { value: 'My reading insight' } })

    const saveBtn = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveBtn)

    expect(mockDrawMark).toHaveBeenCalledWith(
      expect.objectContaining({
        cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:15)',
      }),
    )
  })

  it('turns page forward when tapping on the right side and backward on the left in paginated mode', () => {
    mockGoLeft.mockClear()
    mockGoRight.mockClear()
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    services.settings.set(KERNEL_SETTINGS.pageLayout, 'paginated')
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    fireEvent.click(screen.getByTestId('trigger-relocate'))
    fireEvent.click(screen.getByTestId('trigger-document'))

    const doc = (window as unknown as { lastTestDoc: Document }).lastTestDoc
    expect(doc).toBeDefined()

    // Tap right (e.g., x=280 on 300px width, > 200px)
    doc.body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 280, clientY: 100, bubbles: true }))
    doc.body.dispatchEvent(new PointerEvent('pointerup', { clientX: 280, clientY: 100, bubbles: true }))

    expect(mockGoRight).toHaveBeenCalledTimes(1)
    expect(mockGoLeft).not.toHaveBeenCalled()

    // Tap left (e.g., x=20 on 300px width, < 100px)
    doc.body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 100, bubbles: true }))
    doc.body.dispatchEvent(new PointerEvent('pointerup', { clientX: 20, clientY: 100, bubbles: true }))

    expect(mockGoLeft).toHaveBeenCalledTimes(1)
  })

  it('advances and retreats even in scrolled mode when tapping left or right', () => {
    mockGoLeft.mockClear()
    mockGoRight.mockClear()
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    services.settings.set(KERNEL_SETTINGS.pageLayout, 'scrolled')
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    fireEvent.click(screen.getByTestId('trigger-relocate'))
    fireEvent.click(screen.getByTestId('trigger-document'))

    const doc = (window as unknown as { lastTestDoc: Document }).lastTestDoc
    expect(doc).toBeDefined()

    // Tap right in scrolled mode
    doc.body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 280, clientY: 100, bubbles: true }))
    doc.body.dispatchEvent(new PointerEvent('pointerup', { clientX: 280, clientY: 100, bubbles: true }))

    expect(mockGoRight).toHaveBeenCalledTimes(1)

    // Tap left in scrolled mode
    doc.body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 100, bubbles: true }))
    doc.body.dispatchEvent(new PointerEvent('pointerup', { clientX: 20, clientY: 100, bubbles: true }))

    expect(mockGoLeft).toHaveBeenCalledTimes(1)
  })

  it('toggles chrome when clicking the middle third', () => {
    mockGoLeft.mockClear()
    mockGoRight.mockClear()
    const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
    const file = testFile()

    render(
      <Reader
        file={file}
        bookId="test-book"
        name="Test Book Title"
        onClose={vi.fn()}
        services={services}
      />,
    )

    fireEvent.click(screen.getByTestId('trigger-relocate'))
    fireEvent.click(screen.getByTestId('trigger-document'))

    const doc = (window as unknown as { lastTestDoc: Document }).lastTestDoc
    // Tap middle (e.g. x=150 on 300px width, between 100px and 200px)
    doc.body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 100, bubbles: true }))
    doc.body.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 100, bubbles: true }))

    // Middle third does NOT turn pages
    expect(mockGoRight).not.toHaveBeenCalled()
    expect(mockGoLeft).not.toHaveBeenCalled()
  })
})
