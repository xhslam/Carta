import { describe, expect, it } from 'vitest'
import { pdfPixelRatio, PDF_CANVAS_EDGE, PDF_CANVAS_PIXELS } from './pdfRenderBudget'

describe('PDF bitmap memory budget', () => {
  it('keeps normal phone pages sharp', () => {
    expect(pdfPixelRatio(612, 792, 0.6, 3)).toBe(2)
  })
  it.each([[20000, 30000, 4], [100, 100000, 1], [612, 792, 20]])(
    'bounds oversized and zoomed pages (%s × %s, zoom %s)', (width, height, zoom) => {
      const ratio = pdfPixelRatio(width, height, zoom, 3)
      const w = width * zoom * ratio
      const h = height * zoom * ratio
      expect(w * h).toBeLessThanOrEqual(PDF_CANVAS_PIXELS + 0.001)
      expect(Math.max(w, h)).toBeLessThanOrEqual(PDF_CANVAS_EDGE + 0.001)
      // Bitmap scaling is inverted in CSS, preserving the requested page size.
      expect(w / ratio).toBeCloseTo(width * zoom)
    },
  )
  it('rejects malformed dimensions before canvas allocation', () => {
    for (const width of [0, -1, Infinity, NaN]) expect(() => pdfPixelRatio(width, 792, 1, 2)).toThrow()
  })
})
