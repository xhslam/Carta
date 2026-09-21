import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MIGRATED_KEYS } from './fileStore'
import { PAINT_HINT_KEY } from './paintHint'

const html = readFileSync(new URL('../../../index.mobile.html', import.meta.url), 'utf8')

describe('the first frame’s colour', () => {
  it('leaves the mobile launch frame to the native launch screen', () => {
    /* Mobile is covered by the native launch screen, so an inline paint-hint
       script would add CSP surface without preventing a visible flash. */
    expect(html).not.toContain(PAINT_HINT_KEY)
    expect(html).toContain('/src/main.mobile.tsx')
  })

  it('leaves the charset inside the first 1024 bytes', () => {
    /* The spec's limit, and this test exists because the hint was briefly put
       ABOVE the charset: its comment alone pushed the declaration past 1024
       bytes, where a browser is entitled to have guessed an encoding already.
       Nothing failed — the page rendered — which is exactly why it needs an
       assertion rather than a memory. */
    const at = html.indexOf('charset')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(Buffer.byteLength(html.slice(0, at), 'utf8')).toBeLessThan(1024)
  })

  it('does not reuse a key the localStorage migration reads', () => {
    /* `MIGRATED_KEYS` are localStorage names too, and the migration carries
       whatever it finds under them into the file store. A colour arriving where
       a library was expected is the same class of collision `carta.library.v1`
       already produced once. */
    expect(MIGRATED_KEYS as readonly string[]).not.toContain(PAINT_HINT_KEY)
  })
})
