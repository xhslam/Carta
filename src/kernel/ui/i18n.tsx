import { createContext, useContext, type ReactNode } from 'react'

export type UiLanguage = 'zh' | 'en'

const UiLanguageContext = createContext<UiLanguage>('en')

export function UiLanguageProvider({
  language,
  children,
}: {
  readonly language: UiLanguage
  readonly children: ReactNode
}) {
  return <UiLanguageContext.Provider value={language}>{children}</UiLanguageContext.Provider>
}

export function useUiLanguage(): UiLanguage {
  return useContext(UiLanguageContext)
}

export function uiText(language: UiLanguage, zh: string, en: string): string {
  return language === 'zh' ? zh : en
}
