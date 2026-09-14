import { useCallback, useState } from 'react'
import type { UiLanguage } from '../../kernel/ui/i18n'

export const UI_LANGUAGE_STORAGE_KEY = 'carta.ui.language.v1'

function initialLanguage(): UiLanguage {
  try {
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    // An unavailable store must not prevent the interface from opening.
  }
  return 'zh'
}

export function useUiLanguagePreference(): readonly [UiLanguage, (language: UiLanguage) => void] {
  const [language, setLanguageState] = useState<UiLanguage>(initialLanguage)
  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next)
    try {
      localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, next)
    } catch {
      // The choice still applies for this session when persistence is unavailable.
    }
  }, [])
  return [language, setLanguage]
}
