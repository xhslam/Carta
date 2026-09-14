// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { setImmersiveReading, useImmersiveMode } from './useImmersiveMode'

describe('useImmersiveMode', () => {
  afterEach(() => {
    delete (window as unknown as { CartaAndroidBridge?: unknown }).CartaAndroidBridge
  })

  it('safely no-ops when bridge is absent', () => {
    expect(() => setImmersiveReading(true)).not.toThrow()
    expect(() => setImmersiveReading(false)).not.toThrow()
  })

  it('calls bridge.setImmersiveReading when present', () => {
    const mockFn = vi.fn()
    ;(window as unknown as { CartaAndroidBridge: { setImmersiveReading: typeof mockFn } }).CartaAndroidBridge = {
      setImmersiveReading: mockFn,
    }

    setImmersiveReading(true)
    expect(mockFn).toHaveBeenCalledWith(true)

    setImmersiveReading(false)
    expect(mockFn).toHaveBeenCalledWith(false)
  })

  it('activates immersive mode on mount and restores on unmount', () => {
    const mockFn = vi.fn()
    ;(window as unknown as { CartaAndroidBridge: { setImmersiveReading: typeof mockFn } }).CartaAndroidBridge = {
      setImmersiveReading: mockFn,
    }

    const { unmount } = renderHook(() => useImmersiveMode(true))
    expect(mockFn).toHaveBeenCalledWith(true)

    unmount()
    expect(mockFn).toHaveBeenCalledWith(false)
  })
  it('restores fullscreen on focus and visibility return, and removes listeners on exit', () => {
    const bridge = { setImmersiveReading: vi.fn() }
    Object.assign(window, { CartaAndroidBridge: bridge })
    const { unmount } = renderHook(() => useImmersiveMode(true))
    bridge.setImmersiveReading.mockClear()
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(bridge.setImmersiveReading.mock.calls).toEqual([[true], [true]])
    unmount()
    bridge.setImmersiveReading.mockClear()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(bridge.setImmersiveReading).not.toHaveBeenCalled()
  })

})
