import { useCallback, useRef, useSyncExternalStore } from 'react'
import {
  KERNEL_SETTINGS,
  type Align,
  type MarkTint,
  type PageLayout,
  type ReadingStyle,
  type SettingsStore,
  type SpacingIndices,
  type Theme,
  type Typeface,
} from '../../kernel'

export interface ReadingPrefs {
  readonly storedTheme: Theme
  readonly themeFollowsOs: boolean
  readonly typeface: Typeface
  readonly textSize: number
  readonly spacing: SpacingIndices
  readonly align: Align
  readonly readingStyle: ReadingStyle
  readonly pageLayout: PageLayout
  readonly brightness: number
  readonly contrast: number
  readonly markTint: MarkTint
}

function sameSpacing(a: SpacingIndices, b: SpacingIndices): boolean {
  return (
    a.line === b.line &&
    a.paragraph === b.paragraph &&
    a.letter === b.letter &&
    a.word === b.word
  )
}

function sameReadingStyle(a: ReadingStyle, b: ReadingStyle): boolean {
  return (
    a.separation === b.separation &&
    a.flourish === b.flourish &&
    a.headingScale === b.headingScale &&
    a.blockquote === b.blockquote &&
    a.codeFace === b.codeFace &&
    a.codeWrap === b.codeWrap &&
    a.figureWidth === b.figureWidth &&
    a.figureFrame === b.figureFrame &&
    a.figureScalesWithText === b.figureScalesWithText &&
    a.figureHeight === b.figureHeight &&
    a.wideTables === b.wideTables &&
    a.noteSize === b.noteSize &&
    a.cjkSpacing === b.cjkSpacing &&
    a.minimumSize === b.minimumSize &&
    a.fidelity === b.fidelity
  )
}

export function useReadingPrefs(settings: SettingsStore): ReadingPrefs {
  const cached = useRef<ReadingPrefs | null>(null)

  const getSnapshot = useCallback((): ReadingPrefs => {
    const storedTheme = settings.get(KERNEL_SETTINGS.theme)
    const themeFollowsOs = settings.get(KERNEL_SETTINGS.themeFollowsOs)
    const typeface = settings.get(KERNEL_SETTINGS.typeface)
    const textSize = settings.get(KERNEL_SETTINGS.textSize)
    const rawSpacing = settings.get(KERNEL_SETTINGS.spacing)
    const align = settings.get(KERNEL_SETTINGS.align)
    const rawStyle = settings.get(KERNEL_SETTINGS.readingStyle)
    const pageLayout = settings.get(KERNEL_SETTINGS.pageLayout)
    const brightness = settings.get(KERNEL_SETTINGS.brightness)
    const contrast = settings.get(KERNEL_SETTINGS.contrast)
    const markTint = settings.get(KERNEL_SETTINGS.markTint)

    const prev = cached.current
    if (prev) {
      const spacing = sameSpacing(prev.spacing, rawSpacing) ? prev.spacing : rawSpacing
      const readingStyle = sameReadingStyle(prev.readingStyle, rawStyle) ? prev.readingStyle : rawStyle

      if (
        prev.storedTheme === storedTheme &&
        prev.themeFollowsOs === themeFollowsOs &&
        prev.typeface === typeface &&
        prev.textSize === textSize &&
        prev.spacing === spacing &&
        prev.align === align &&
        prev.readingStyle === readingStyle &&
        prev.pageLayout === pageLayout &&
        prev.brightness === brightness &&
        prev.contrast === contrast &&
        prev.markTint === markTint
      ) {
        return prev
      }

      const next: ReadingPrefs = {
        storedTheme,
        themeFollowsOs,
        typeface,
        textSize,
        spacing,
        align,
        readingStyle,
        pageLayout,
        brightness,
        contrast,
        markTint,
      }
      cached.current = next
      return next
    }

    const initial: ReadingPrefs = {
      storedTheme,
      themeFollowsOs,
      typeface,
      textSize,
      spacing: rawSpacing,
      align,
      readingStyle: rawStyle,
      pageLayout,
      brightness,
      contrast,
      markTint,
    }
    cached.current = initial
    return initial
  }, [settings])

  return useSyncExternalStore(settings.subscribe, getSnapshot, getSnapshot)
}

export interface ThemePrefs {
  readonly theme: Theme
  readonly themeFollowsOs: boolean
  readonly brightness: number
  readonly contrast: number
}

export function useThemePrefs(settings: SettingsStore): ThemePrefs {
  const cached = useRef<ThemePrefs | null>(null)

  const getSnapshot = useCallback((): ThemePrefs => {
    const theme = settings.get(KERNEL_SETTINGS.theme)
    const themeFollowsOs = settings.get(KERNEL_SETTINGS.themeFollowsOs)
    const brightness = settings.get(KERNEL_SETTINGS.brightness)
    const contrast = settings.get(KERNEL_SETTINGS.contrast)

    const prev = cached.current
    if (
      prev &&
      prev.theme === theme &&
      prev.themeFollowsOs === themeFollowsOs &&
      prev.brightness === brightness &&
      prev.contrast === contrast
    ) {
      return prev
    }

    const next: ThemePrefs = { theme, themeFollowsOs, brightness, contrast }
    cached.current = next
    return next
  }, [settings])

  return useSyncExternalStore(settings.subscribe, getSnapshot, getSnapshot)
}
