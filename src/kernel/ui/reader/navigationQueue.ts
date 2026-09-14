/** Keep asynchronous page loads in reading order, including fixed-layout PDFs. */
export function navigationQueue(isLive: () => boolean, onError: (error: unknown) => void) {
  const pending: Array<() => unknown> = []
  let running = false

  const drain = () => {
    if (running) return
    if (!isLive()) {
      pending.length = 0
      return
    }
    const action = pending.shift()
    if (!action) return
    running = true
    void (async () => {
      try {
        await action()
      } catch (error) {
        if (isLive()) onError(error)
      } finally {
        running = false
        drain()
      }
    })()
  }

  return (action: () => unknown, replacePending = false) => {
    if (!isLive()) return
    // A contents/progress jump replaces queued turns, but waits for the page
    // already loading so that an older render cannot overwrite the destination.
    if (replacePending) pending.length = 0
    pending.push(action)
    drain()
  }
}
