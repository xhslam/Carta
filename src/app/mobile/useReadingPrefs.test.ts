// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createSettingsStore, KERNEL_SETTINGS } from '../../kernel'
import { useReadingPrefs, useThemePrefs } from './useReadingPrefs'

describe('useReadingPrefs and useThemePrefs stability', () => {
  it('does not produce a new reference when unrelated settings (like CLOCK_FLOOR) change', () => {
    const store = createSettingsStore({ storage: null })

    const { result: readingResult } = renderHook(() => useReadingPrefs(store))
    const { result: themeResult } = renderHook(() => useThemePrefs(store))

    const initialReading = readingResult.current
    const initialTheme = themeResult.current

    // Simulate clock floor write, which happens on every library/sync/marks write
    act(() => {
      store.set({ key: 'sync.clockFloor', fallback: 0 } as any, 12345678)
    })

    expect(readingResult.current).toBe(initialReading)
    expect(themeResult.current).toBe(initialTheme)
    expect(readingResult.current.spacing).toBe(initialReading.spacing)
    expect(readingResult.current.readingStyle).toBe(initialReading.readingStyle)
  })

  it('updates reference when relevant reading settings change', () => {
    const store = createSettingsStore({ storage: null })

    const { result } = renderHook(() => useReadingPrefs(store))
    const initial = result.current

    act(() => {
      store.set(KERNEL_SETTINGS.theme, 'sepia')
    })

    expect(result.current).not.toBe(initial)
    expect(result.current.storedTheme).toBe('sepia')
    // Spacing was not modified, so its nested object reference should be preserved
    expect(result.current.spacing).toBe(initial.spacing)
  })

  it('preserves spacing reference when an identical spacing object is set', () => {
    const store = createSettingsStore({ storage: null })

    const { result } = renderHook(() => useReadingPrefs(store))
    const initialSpacing = result.current.spacing

    act(() => {
      store.set(KERNEL_SETTINGS.spacing, { ...initialSpacing })
    })

    // Spacing has same values, so reference must remain stable
    expect(result.current.spacing).toBe(initialSpacing)
  })
})
