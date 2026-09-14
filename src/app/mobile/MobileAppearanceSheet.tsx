import { useSyncExternalStore } from 'react'
import { Sun, Check } from 'lucide-react'
import { KERNEL_SETTINGS, type SettingsStore } from '../../kernel'
import { readingStep, stepIndexForSize, READING_STEPS, ICON } from '../../kernel/core/metrics'
import type { Theme } from '../../kernel/core/uiTypes'
import styles from './Reader.module.css'
import { uiText, useUiLanguage } from '../../kernel/ui/i18n'

export interface MobileAppearanceSheetProps {
  readonly settings: SettingsStore
}

interface ThemeSpec {
  readonly id: Theme
  readonly zh: string
  readonly en: string
  readonly bg: string
  readonly ink: string
}

const THEMES: readonly ThemeSpec[] = [
  { id: 'carta', zh: '纯白', en: 'White', bg: '#FFFFFF', ink: '#17191B' },
  { id: 'sepia', zh: '暖黄', en: 'Sepia', bg: '#F8F0E1', ink: '#2B2117' },
  { id: 'sage', zh: '淡绿', en: 'Sage', bg: '#DDE6D8', ink: '#1B2419' },
  { id: 'slate', zh: '浅灰', en: 'Slate', bg: '#DFE1DE', ink: '#1C2022' },
  { id: 'night', zh: '夜间', en: 'Night', bg: '#16191C', ink: '#E9EAE8' },
]

export function MobileAppearanceSheet({ settings }: MobileAppearanceSheetProps) {
  const language = useUiLanguage()
  useSyncExternalStore(settings.subscribe, settings.getSnapshot)

  const currentTheme = settings.get(KERNEL_SETTINGS.theme)
  const themeFollowsOs = settings.get(KERNEL_SETTINGS.themeFollowsOs)
  const currentStep = stepIndexForSize(settings.get(KERNEL_SETTINGS.textSize))
  const currentTypeface = settings.get(KERNEL_SETTINGS.typeface)
  const currentSpacing = settings.get(KERNEL_SETTINGS.spacing)
  const currentLayout = settings.get(KERNEL_SETTINGS.pageLayout)
  const currentBrightness = settings.get(KERNEL_SETTINGS.brightness)

  const maxStep = READING_STEPS.length - 1

  const setStep = (next: number) => {
    const clamped = Math.max(0, Math.min(maxStep, next))
    settings.set(KERNEL_SETTINGS.textSize, readingStep(clamped).size)
  }

  const setLineSpacing = (lineIdx: number) => {
    settings.set(KERNEL_SETTINGS.spacing, { ...currentSpacing, line: lineIdx })
  }

  return (
    <div className={styles.toolBody}>
      <div className={styles.appearanceCard}>
        {/* ── Brightness ────────────────────────────────────────────────────── */}
        <div className={styles.settingSection}>
          <span className={styles.sectionHeader}>{uiText(language, '亮度调节', 'Brightness')}</span>
          <div className={styles.brightnessRow}>
            <Sun size={16} strokeWidth={ICON.stroke} style={{ opacity: 0.5 }} />
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              value={currentBrightness}
              aria-label={uiText(language, '屏幕亮度', 'Screen brightness')}
              className={styles.scrubberInput}
              onChange={(e) => settings.set(KERNEL_SETTINGS.brightness, Number(e.target.value))}
            />
            <Sun size={24} strokeWidth={ICON.stroke} />
          </div>
        </div>

        {/* ── Themes ────────────────────────────────────────────────────────── */}
        <div className={styles.settingSection}>
          <span className={styles.sectionHeader}>{uiText(language, '阅读底色', 'Reading theme')}</span>
          <div className={styles.themeSwatches} role="radiogroup" aria-label={uiText(language, '阅读底色', 'Reading theme')}>
            {THEMES.map((theme) => {
              const isSelected = currentTheme === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`${styles.themeSwatch} ${isSelected ? styles.themeSwatchActive : ''}`}
                  onClick={() => {
                    settings.set(KERNEL_SETTINGS.theme, theme.id)
                    settings.set(KERNEL_SETTINGS.themeFollowsOs, false)
                  }}
                >
                  <span className={styles.swatchCircle} style={{ background: theme.bg }}>
                    {isSelected && <Check size={14} color={theme.ink} strokeWidth={3} />}
                  </span>
                  <span className={styles.swatchLabel}>{uiText(language, theme.zh, theme.en)}</span>
                </button>
              )
            })}
          </div>

          <div className={styles.followOsRow}>
            <span>{uiText(language, '跟随系统深色模式', 'Follow system dark mode')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={themeFollowsOs}
              aria-label={uiText(language, '跟随系统主题', 'Follow system theme')}
              className={styles.toggleSwitch}
              onClick={() => settings.set(KERNEL_SETTINGS.themeFollowsOs, !themeFollowsOs)}
            >
              <span className={styles.toggleHandle} />
            </button>
          </div>
        </div>

        {/* ── Font Size ─────────────────────────────────────────────────────── */}
        <div className={styles.settingSection}>
          <span className={styles.sectionHeader}>{uiText(language, '字号大小', 'Text size')}</span>
          <div className={styles.stepperRow}>
            <button
              type="button"
              className={styles.stepperBtn}
              aria-label={uiText(language, '减小字号', 'Decrease font size')}
              disabled={currentStep <= 0}
              onClick={() => setStep(currentStep - 1)}
            >
              A-
            </button>
            <span className={styles.stepperLabel}>{readingStep(currentStep).size} px</span>
            <button
              type="button"
              className={styles.stepperBtn}
              aria-label={uiText(language, '增大字号', 'Increase font size')}
              disabled={currentStep >= maxStep}
              onClick={() => setStep(currentStep + 1)}
            >
              A+
            </button>
          </div>
        </div>

        {/* ── Typeface ──────────────────────────────────────────────────────── */}
        <div className={styles.settingSection}>
          <span className={styles.sectionHeader}>{uiText(language, '字体风格', 'Typeface')}</span>
          <div className={styles.chipsGrid} role="radiogroup" aria-label={uiText(language, '字体风格', 'Typeface')}>
            <button
              type="button"
              role="radio"
              aria-checked={currentTypeface === 'literata'}
              className={`${styles.chipBtn} ${currentTypeface === 'literata' ? styles.chipBtnActive : ''}`}
              onClick={() => settings.set(KERNEL_SETTINGS.typeface, 'literata')}
            >
              {uiText(language, '衬线体', 'Serif')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentTypeface === 'instrument'}
              className={`${styles.chipBtn} ${currentTypeface === 'instrument' ? styles.chipBtnActive : ''}`}
              onClick={() => settings.set(KERNEL_SETTINGS.typeface, 'instrument')}
            >
              {uiText(language, '无衬线', 'Sans serif')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentTypeface === 'plex'}
              className={`${styles.chipBtn} ${currentTypeface === 'plex' ? styles.chipBtnActive : ''}`}
              onClick={() => settings.set(KERNEL_SETTINGS.typeface, 'plex')}
            >
              {uiText(language, '等宽体', 'Monospace')}
            </button>
          </div>
        </div>

        {/* ── Line Spacing ──────────────────────────────────────────────────── */}
        <div className={styles.settingSection}>
          <span className={styles.sectionHeader}>{uiText(language, '行间距', 'Line spacing')}</span>
          <div className={styles.chipsGrid} role="radiogroup" aria-label={uiText(language, '行间距', 'Line spacing')}>
            <button
              type="button"
              role="radio"
              aria-checked={currentSpacing.line === 0}
              className={`${styles.chipBtn} ${currentSpacing.line === 0 ? styles.chipBtnActive : ''}`}
              onClick={() => setLineSpacing(0)}
            >
              {uiText(language, '紧凑', 'Compact')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentSpacing.line === 1}
              className={`${styles.chipBtn} ${currentSpacing.line === 1 ? styles.chipBtnActive : ''}`}
              onClick={() => setLineSpacing(1)}
            >
              {uiText(language, '适中', 'Comfortable')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentSpacing.line === 2}
              className={`${styles.chipBtn} ${currentSpacing.line === 2 ? styles.chipBtnActive : ''}`}
              onClick={() => setLineSpacing(2)}
            >
              {uiText(language, '宽松', 'Spacious')}
            </button>
          </div>
        </div>

        {/* ── Reading Layout ────────────────────────────────────────────────── */}
        <div className={styles.settingSection}>
          <span className={styles.sectionHeader}>{uiText(language, '翻页方式', 'Page flow')}</span>
          <div className={styles.chipsGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <button
              type="button"
              role="radio"
              aria-checked={currentLayout === 'paginated'}
              className={`${styles.chipBtn} ${currentLayout === 'paginated' ? styles.chipBtnActive : ''}`}
              onClick={() => {
                try {
                  localStorage.setItem('carta.mobile.pageLayoutInitialized', '1')
                } catch {}
                settings.set(KERNEL_SETTINGS.pageLayout, 'paginated')
              }}
            >
              {uiText(language, '📖 左右翻页', '📖 Paginated')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentLayout === 'scrolled'}
              className={`${styles.chipBtn} ${currentLayout === 'scrolled' ? styles.chipBtnActive : ''}`}
              onClick={() => {
                try {
                  localStorage.setItem('carta.mobile.pageLayoutInitialized', '1')
                } catch {}
                settings.set(KERNEL_SETTINGS.pageLayout, 'scrolled')
              }}
            >
              {uiText(language, '📜 上下滚动', '📜 Scrolling')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
