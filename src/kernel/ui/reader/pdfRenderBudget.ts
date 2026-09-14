/** One visible bitmap is at most 16 MiB, even for oversized PDF media boxes. */
export const PDF_CANVAS_PIXELS = 4 * 1024 * 1024
export const PDF_CANVAS_EDGE = 4096

export function pdfPixelRatio(width: number, height: number, zoom: number, deviceRatio: number): number {
  if (![width, height, zoom, deviceRatio].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error('The PDF page has invalid dimensions or scale.')
  }
  const w = width * zoom
  const h = height * zoom
  return Math.min(deviceRatio, 2, PDF_CANVAS_EDGE / w, PDF_CANVAS_EDGE / h, Math.sqrt(PDF_CANVAS_PIXELS / (w * h)))
}
