import { describe, expect, it, vi } from 'vitest'
import { navigationQueue } from './navigationQueue'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('navigationQueue', () => {
  it('finishes each PDF load before starting the next, preserving rapid forward/back input', async () => {
    const first = deferred()
    const calls: string[] = []
    const enqueue = navigationQueue(() => true, vi.fn())
    enqueue(() => { calls.push('next'); return first.promise })
    enqueue(() => { calls.push('next') })
    enqueue(() => { calls.push('prev') })
    expect(calls).toEqual(['next'])
    first.resolve()
    await vi.waitFor(() => expect(calls).toEqual(['next', 'next', 'prev']))
  })

  it('a contents jump supersedes pending turns without racing the in-flight page', async () => {
    const first = deferred()
    const calls: string[] = []
    const enqueue = navigationQueue(() => true, vi.fn())
    enqueue(() => first.promise)
    enqueue(() => calls.push('obsolete turn'))
    enqueue(() => calls.push('chapter 12'), true)
    expect(calls).toEqual([])
    first.resolve()
    await vi.waitFor(() => expect(calls).toEqual(['chapter 12']))
  })

  it('discards queued work after the book closes', async () => {
    let live = true
    const first = deferred()
    const turn = vi.fn()
    const enqueue = navigationQueue(() => live, vi.fn())
    enqueue(() => first.promise)
    enqueue(turn)
    live = false
    first.resolve()
    await first.promise
    enqueue(turn)
    expect(turn).not.toHaveBeenCalled()
  })

  it('reports a failed page load and still allows the next navigation', async () => {
    const error = new Error('page unavailable')
    const report = vi.fn()
    const turn = vi.fn()
    const enqueue = navigationQueue(() => true, report)
    enqueue(() => Promise.reject(error))
    enqueue(turn)
    await vi.waitFor(() => expect(turn).toHaveBeenCalledOnce())
    expect(report).toHaveBeenCalledWith(error)
  })
})
