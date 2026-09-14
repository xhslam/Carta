// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { File as NativeFile } from 'node:buffer'
import { fakeFs } from '../../kernel/testkit'
import { MobileApp } from './MobileApp'
import { createKernelServices, type Composition } from '../../kernel'

/**
 * EVERY TAB RENDERS — which is the thing a screenshot of one tab cannot say.
 *
 * The shell came up on the iPhone 17 simulator showing Library, and that
 * proved the entry, the insets and the tab bar. It proved nothing about the
 * other three: a tab whose screen throws looks exactly like a tab nobody has
 * pressed. Tapping them by hand would have needed the Simulator's window
 * geometry, which reports a landscape box for a portrait phone — so this is
 * both the cheaper check and the one that survives.
 *
 * `Reading` is deliberately not here: `TabBar` redirects it to Library while
 * there is no book, and asserting that is `TabBar`'s own job.
 */

const EMPTY_COMPOSITION = {
  order: [],
  failures: [],
  panes: [],
  settings: [],
  bookActions: [],
  bookStatuses: [],
  services: new Map(),
  clients: [],
  [Symbol.dispose]: () => {},
} as unknown as Composition

function mount() {
  /* NO FILESYSTEM AND NO STORAGE. Both are legal — a browser has neither, and
     `createKernelServices` is built to answer for that — so this mounts the
     shell in the state a phone reaches before any book has been carried onto
     it, which is also what the simulator shows. */
  const services = createKernelServices({ fs: null, storage: null, initialBooks: [] })
  return render(<MobileApp services={services} shelfUnread={false} composition={EMPTY_COMPOSITION} />)
}

/* jsdom HAS NO `ResizeObserver`, and the You screen's `Settings` groups measure
   themselves to animate open. A stub that observes nothing is enough — these
   cases are about which screen renders, not about how tall it is. The browser
   client's Reader test stubs it the same way, for the same component. */
beforeEach(() => {
  localStorage.setItem('carta.ui.language.v1', 'en')
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
  localStorage.clear()
  vi.unstubAllGlobals()
  cleanup()
})

describe('the phone shell', () => {
  it('opens on the Library', () => {
    mount()
    expect(screen.getByRole('button', { name: 'Library' }).getAttribute('aria-current')).toBe('page')
  })

  it('draws the four tabs the design names, in order', () => {
    mount()
    const bar = screen.getByRole('navigation', { name: 'Sections' })
    const labels = [...bar.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual(['Library', 'Reading', 'Cards', 'Settings'])
  })

  it.each(['Cards', 'Settings'])('renders the %s screen when its tab is pressed', (tab) => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: tab }))
    /* THE HEADING, not just the absence of a throw — a screen that rendered
       nothing at all would pass a smoke test and show a blank tab. */
    expect(screen.getByRole('heading', { name: tab })).not.toBeNull()
    expect(screen.getByRole('button', { name: tab }).getAttribute('aria-current')).toBe('page')
  })

  /* NO WINDOW CHROME. The shell drew a 52px overlay titlebar and three traffic
     lights on a phone for as long as `resolvePlatform` answered `macos` there;
     jsdom's user agent is not a phone's, so this asserts the SHELL draws none
     of its own regardless of what the platform resolves to. */
  it('draws no titlebar of its own', () => {
    const { container } = mount()
    expect(container.querySelector('[class*="titlebar" i]')).toBeNull()
    expect(container.querySelector('[class*="trafficLight" i]')).toBeNull()
  })

  it('switches the whole shell to Chinese and keeps the choice', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('radio', { name: '中文' }))
    expect(screen.getByRole('button', { name: '书架' })).toBeDefined()
    expect(screen.getByRole('heading', { name: '设置' })).toBeDefined()
    expect(localStorage.getItem('carta.ui.language.v1')).toBe('zh')
  })
})

vi.mock('./Reader', () => ({
  Reader: ({ name, onClose }: { name: string; onClose: () => void }) =>
    <section aria-label="Open book">{name}<button onClick={onClose}>Return to library</button></section>,
}))

it('imports from the picker, opens the saved row, returns, and resumes from Reading', async () => {
  const services = createKernelServices({ fs: fakeFs(), storage: null, initialBooks: [] })
  render(<MobileApp services={services} shelfUnread={false} composition={EMPTY_COMPOSITION} />)
  expect(screen.getByRole('button', { name: /Add books/ })).toBeDefined()
  const file = new NativeFile(['test book contents'], 'Mobile sample.epub')
  fireEvent.change(screen.getByLabelText('Import books'), { target: { files: [file] } })
  await waitFor(() => expect(screen.getByText('1 book(s) saved.')).toBeDefined())
  fireEvent.click(screen.getAllByText('Mobile sample')[0]!)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Open book' })).toBeDefined())

  expect(screen.getByRole('region', { name: 'Open book' }).textContent).toContain('Mobile sample.epub')
  fireEvent.click(screen.getByText('Return to library'))
  fireEvent.click(screen.getByRole('button', { name: 'Reading' }))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Open book' })).toBeDefined())
  await services.drain()
})

it('refuses whole-file fallback on mobile if a PDF has no measurable size', async () => {
  const fs = fakeFs()
  const services = createKernelServices({ fs, storage: null, initialBooks: [] })
  render(<MobileApp services={services} shelfUnread={false} composition={EMPTY_COMPOSITION} />)

  // Import a PDF file
  const file = new NativeFile(['%PDF-1.4 test'], 'Document.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Import books'), { target: { files: [file] } })
  await waitFor(() => expect(screen.getByText('1 book(s) saved.')).toBeDefined())

  // Without sizePort bound, services.sizes() returns null and locate answers size: null
  fireEvent.click(screen.getAllByText('Document')[0]!)
  await waitFor(() => {
    expect(screen.getByText('This PDF could not be opened safely. Please try re-importing.')).toBeDefined()
  })
  // Ensure we didn't open the Reader with an in-memory full file
  expect(screen.queryByRole('region', { name: 'Open book' })).toBeNull()
  await services.drain()
})
