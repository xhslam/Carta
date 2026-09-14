import { expect, it } from 'vitest'
import { contentId } from './marks'

it('retains the SHA-256 book identity across chunk boundaries', async () => {
  const bytes = Uint8Array.from({ length: 700000 }, (_, i) => i % 251)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await new Blob([`${bytes.length}:`, bytes]).arrayBuffer()))
  const expected = 'book:' + Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  expect(await contentId(new Blob([bytes]))).toBe(expected)
})
