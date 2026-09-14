import styles from './Reader.module.css'

export interface MobileAmbientFooterProps {
  readonly chapterLabel: string
  readonly fraction: number
  readonly visible: boolean
}

export function MobileAmbientFooter({
  chapterLabel,
  fraction,
  visible,
}: MobileAmbientFooterProps) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100)

  return (
    <div className={styles.ambientFooter} data-visible={visible} aria-hidden={!visible}>
      <span className={styles.ambientChapter}>{chapterLabel}</span>
      <span className={styles.ambientProgress}>{pct}%</span>
    </div>
  )
}
