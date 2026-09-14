// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { makePdf } from './makePdf'

const state = vi.hoisted(() => ({
  cleanups: [] as number[],
  cancels: [] as number[],
  pdfCleanups: 0,
  pageRenders: [] as number[],
  pending: false,
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))
vi.mock('pdfjs-dist/web/pdf_viewer.css?raw', () => ({ default: '' }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  TextLayer: class { render = async () => {}; cancel() {} },
  getDocument: () => ({
    destroy: async () => {},
    promise: Promise.resolve({
      numPages: 2,
      cleanup: async () => { state.pdfCleanups += 1; return true },
      getMetadata: async () => ({ info: {} }),
      getOutline: async () => [],
      getPage: async (number: number) => ({
        pageNumber: number,
        getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
        streamTextContent: () => ({}),
        cleanup: () => { state.cleanups.push(number); return true },
        render: () => {
          state.pageRenders.push(number)
          let reject!: (error: Error) => void
          return {
            promise: state.pending ? new Promise<void>((_r, no) => { reject = no }) : Promise.resolve(),
            cancel: () => { state.cancels.push(number); reject?.(new Error('cancelled')) },
          }
        },
      }),
    }),
  }),
}))
afterEach(() => {
  vi.unstubAllGlobals()
  state.cleanups = []
  state.cancels = []
  state.pdfCleanups = 0
  state.pageRenders = []
  state.pending = false
})

function pageDocument() {
  const doc = document.implementation.createHTMLDocument('page')
  doc.body.innerHTML = '<div id="canvas"></div><div class="textLayer"></div>'
  return doc
}
function urls() {
  vi.stubGlobal('URL', Object.assign(class {}, { createObjectURL: () => 'blob:page', revokeObjectURL: vi.fn() }))
}

it('releases the previous PDF bitmap and decoded page when turning, and the final one on close', async () => {
  urls()
  const painted = vi.fn()
  const book = await makePdf('test.pdf', { onPagePainted: painted })
  const first = await book.sections[0]!.load()
  const doc1 = pageDocument()
  first.onZoom({ doc: doc1, scale: 1 })
  await vi.waitFor(() => expect(painted).toHaveBeenCalledOnce())
  const canvas = doc1.querySelector('canvas')!
  expect(canvas.width).toBeGreaterThan(0)
  const second = await book.sections[1]!.load()
  const doc2 = pageDocument()
  second.onZoom({ doc: doc2, scale: 1 })
  expect(canvas.width).toBe(0)
  expect(canvas.height).toBe(0)
  await vi.waitFor(() => expect(state.cleanups).toContain(1))
  await vi.waitFor(() => expect(painted).toHaveBeenCalledTimes(2))
  await vi.waitFor(() => expect(state.pdfCleanups).toBeGreaterThan(0))
  await book.destroy()
  expect(doc2.querySelector('canvas')!.width).toBe(0)
  await vi.waitFor(() => expect(state.cleanups).toContain(2))
})

it('cancels a page still rendering on close and never redraws marks afterwards', async () => {
  urls()
  state.pending = true
  const painted = vi.fn()
  const book = await makePdf('test.pdf', { onPagePainted: painted })
  const page = await book.sections[0]!.load()
  const doc = pageDocument()
  page.onZoom({ doc, scale: 1 })
  await book.destroy()
  await vi.waitFor(() => expect(state.cleanups).toContain(1))
  expect(state.cancels).toEqual([1])
  expect(painted).not.toHaveBeenCalled()
  page.onZoom({ doc, scale: 2 })
  expect(painted).not.toHaveBeenCalled()
})

it('cleans up page and document worker cache when getCover runs standalone', async () => {
  urls()
  const book = await makePdf('test.pdf')
  HTMLCanvasElement.prototype.toBlob = function (cb) {
    cb(new Blob(['cover-blob']))
  }
  const cover = await book.getCover()
  expect(cover).toBeInstanceOf(Blob)
  expect(state.cleanups).toContain(1)
  expect(state.pdfCleanups).toBeGreaterThan(0)
  await book.destroy()
})

it('reuses the active page 1 canvas in getCover without issuing a duplicate render', async () => {
  urls()
  HTMLCanvasElement.prototype.getContext = (() => ({
    drawImage: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toBlob = function (cb) {
    cb(new Blob(['cover-from-dom']))
  }
  const book = await makePdf('test.pdf')
  const first = await book.sections[0]!.load()
  const doc = pageDocument()
  first.onZoom({ doc, scale: 1 })
  await vi.waitFor(() => expect(doc.querySelector('canvas')).toBeTruthy())
  const initialRenders = state.pageRenders.length

  const cover = await book.getCover()
  expect(cover).toBeInstanceOf(Blob)
  // Reused the existing DOM canvas, so no additional page.render call was made
  expect(state.pageRenders.length).toBe(initialRenders)
  await book.destroy()
})
