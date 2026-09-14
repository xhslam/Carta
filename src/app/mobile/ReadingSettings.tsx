import { useMemo, useSyncExternalStore } from 'react'
import { Settings, offeredFaces, presentFaces } from '../../kernel/ui/mobile'
import { readingStep, stepIndexForSize } from '../../kernel/core/metrics'
import { KERNEL_SETTINGS, type SettingsSection, type SettingsStore } from '../../kernel'
import type { UiLanguage } from '../../kernel/ui/i18n'
import styles from '../shell/shell.module.css'

/**
 * THE READING PANEL, wired to this device's own settings store.
 *
 * The same shape as the browser client's `app/web/ReadingSettings.tsx`, over a
 * different table: that one reads `WEB_SETTINGS` — a browser's own, smaller
 * set — and this one reads `KERNEL_SETTINGS`, because a native shell holds the
 * real store the launch built and every kernel setting is genuinely available
 * to it.
 *
 * Not shared with that file for exactly that reason. The two differ in which
 * table they name and in whether a composition can contribute sections, and a
 * single component taking a table as a parameter would be a seam that exists
 * only to have one file — while making the settings a phone actually offers
 * depend on a value passed in from somewhere else.
 */
export interface ReadingSettingsProps {
  readonly settings: SettingsStore
  /** What the composed capabilities contribute — see `sections` on `Settings`. */
  readonly sections: readonly SettingsSection[]
  readonly language: UiLanguage
  readonly onLanguage: (language: UiLanguage) => void
}

export function ReadingSettings({ settings, sections, language, onLanguage }: ReadingSettingsProps) {
  useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  /* ⚠️ **THE PERSISTENCE FLAG NEEDS ITS OWN SUBSCRIPTION.** The snapshot above
   * is unchanged by a REFUSED write — `set` updates the values and publishes
   * before the storage is asked — so subscribing to it alone shows the "not
   * being saved" notice one change late. The browser client carries the same
   * note, and `App.tsx` is where it was first written down. */
  const persistent = useSyncExternalStore(
    settings.subscribe,
    () => settings.persistent,
    () => settings.persistent,
  )
  /* Probed once — it measures text, and which faces a device has cannot change
     while it is running. */
  const faces = useMemo(() => offeredFaces(presentFaces()), [])

  const themeFollowsOs = settings.get(KERNEL_SETTINGS.themeFollowsOs)

  return <>
    <Settings
      theme={settings.get(KERNEL_SETTINGS.theme)}
      themeFollowsOs={themeFollowsOs}
      pageLayout={settings.get(KERNEL_SETTINGS.pageLayout)}
      onPageLayout={(next) => settings.set(KERNEL_SETTINGS.pageLayout, next)}
      typeface={settings.get(KERNEL_SETTINGS.typeface)}
      stepIdx={stepIndexForSize(settings.get(KERNEL_SETTINGS.textSize))}
      spacing={settings.get(KERNEL_SETTINGS.spacing)}
      align={settings.get(KERNEL_SETTINGS.align)}
      style={settings.get(KERNEL_SETTINGS.readingStyle)}
      offered={faces}
      sections={sections}
      persistent={persistent}
      onTheme={(next) => {
        settings.set(KERNEL_SETTINGS.theme, next)
        /* AN EXPLICIT PICK TURNS OFF OS FOLLOWING — `state.ts` states the rule
           for the desktop, and without it the chosen theme is overridden on the
           next render and the control does nothing you can see. */
        settings.set(KERNEL_SETTINGS.themeFollowsOs, false)
      }}
      /* ⚠️ **TAKES THE VALUE IT IS GIVEN.** This read
         `() => set(themeFollowsOs, !themeFollowsOs)`, ignoring the argument and
         negating a value captured at render. `Settings` declares
         `onFollowOs: (follows: boolean) => void` and passes the toggle's own
         next state, so the two agreed only for as long as the captured value
         and the control's state agreed — and the callback was a lie about its
         own signature either way. Both wrappers had it; both are fixed. */
      onFollowOs={(next) => settings.set(KERNEL_SETTINGS.themeFollowsOs, next)}
      onTypeface={(next) => settings.set(KERNEL_SETTINGS.typeface, next)}
      onStepIdx={(next) => settings.set(KERNEL_SETTINGS.textSize, readingStep(next).size)}
      onSpacing={(key, idx) =>
        settings.set(KERNEL_SETTINGS.spacing, { ...settings.get(KERNEL_SETTINGS.spacing), [key]: idx })
      }
      brightness={settings.get(KERNEL_SETTINGS.brightness)}
      onBrightness={(idx) => settings.set(KERNEL_SETTINGS.brightness, idx)}
      contrast={settings.get(KERNEL_SETTINGS.contrast)}
      onContrast={(idx) => settings.set(KERNEL_SETTINGS.contrast, idx)}
      onAlign={(next) => settings.set(KERNEL_SETTINGS.align, next)}
      onStyle={(key, value) =>
        settings.set(KERNEL_SETTINGS.readingStyle, { ...settings.get(KERNEL_SETTINGS.readingStyle), [key]: value })
      }
    />
    <section className={styles.languageSection} aria-labelledby="interface-language-title">
      <div>
        <h2 id="interface-language-title" className={styles.languageTitle}>
          {language === 'zh' ? '界面语言' : 'Interface language'}
        </h2>
        <p className={styles.languageHint}>
          {language === 'zh' ? '切换后立即应用，并在下次启动时保留。' : 'Applies immediately and is kept for the next launch.'}
        </p>
      </div>
      <div className={styles.languageChoices} role="radiogroup" aria-label={language === 'zh' ? '界面语言' : 'Interface language'}>
        <button type="button" role="radio" aria-checked={language === 'zh'} onClick={() => onLanguage('zh')}>
          中文
        </button>
        <button type="button" role="radio" aria-checked={language === 'en'} onClick={() => onLanguage('en')}>
          English
        </button>
      </div>
    </section>
  </>
}
