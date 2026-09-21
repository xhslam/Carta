/**
 * The class names a capability draws with — the public half of
 * `ui/styles/capability.css`.
 *
 * A capability contributes React to the kernel's panes, but it may import the
 * kernel only through `src/kernel/index.ts` (`kernel-public-entry-only`), and
 * the kernel's own controls are a CSS Module whose names are hashed at build
 * time. So there was no way to ask for a Carta button from the other side of
 * the boundary, and both capabilities that shipped drew in the browser's
 * default chrome.
 *
 * STRINGS, which is what makes this work at all: a global class name is data,
 * so it crosses the boundary as data. The React-free public entry re-exports
 * this module and stays React-free AND stylesheet-free; the stylesheet ships
 * with the UI entry, beside `tokens.css` and `global.css`, which is where
 * every other stylesheet in the app lives.
 *
 * The names are NOT free-form. `capabilityUi.test.ts` reads the stylesheet and
 * holds these two in step in both directions — a name here that no rule
 * defines renders silently unstyled (the failure this replaced), and a rule
 * there that nothing exports is a control no capability can reach.
 *
 * @example
 * import { CAPABILITY_UI as ui } from '../../kernel'
 *
 * <div className={ui.row}>
 *   <span className={ui.grow}>This device</span>
 *   <span className={ui.value}>shelf · 8e20a13e…</span>
 * </div>
 */
export const CAPABILITY_UI = Object.freeze({
  /** The root of a contributed pane or settings section: a vertical stack. */
  section: 'carta-cap-section',
  /** One line of a section — a label, and a value or a control. */
  row: 'carta-cap-row',
  /** The half of a row that takes the slack and truncates. */
  grow: 'carta-cap-grow',
  /** A row's quiet right-hand side. */
  value: 'carta-cap-value',
  /** A wrapping sentence under a row, explaining the control above it. */
  hint: 'carta-cap-hint',
  /**
   * A recovery phrase, numbered, laid out to be written down.
   *
   * ⚠️ **NOT `code`.** That one is `user-select: all` so a pairing link can be
   * taken in a click; a phrase rendered in it means one stray click selects the
   * reader's root key. See the stylesheet.
   */
  phrase: 'carta-cap-phrase',
  /** A row of buttons offered together. */
  actions: 'carta-cap-actions',
  /**
   * An action. The DEFAULT IS QUIET — see the stylesheet: nearly everything a
   * capability offers is secondary, and a pane of filled accent buttons reads
   * as a form rather than as settings.
   */
  button: 'carta-cap-button',
  /** With `button`: the one action a surface is actually for. */
  buttonPrimary: 'carta-cap-button-primary',
  /** With `button`: destructive. Coloured, not filled. */
  buttonDanger: 'carta-cap-button-danger',
  /** A text field. Takes the row's slack. */
  field: 'carta-cap-field',
  /** With `field`: holds a number, sized to the number. */
  fieldNarrow: 'carta-cap-field-narrow',
  /**
   * A multi-line field — a paragraph the reader edits.
   *
   * ⚠️ **NOT `field` ON A `<textarea>`.** That one is a fixed-height pill, so it
   * shows one line of whatever it is given and rounds the ends off the first and
   * last. This is the kernel's own note editor's shape. See the stylesheet.
   */
  textarea: 'carta-cap-textarea',
  /** A checkbox, in the reader's accent. */
  toggle: 'carta-cap-toggle',
  /** A long unbreakable string meant to be selected rather than read. */
  code: 'carta-cap-code',
  /** A picture and its caption — a pairing QR, say. */
  figure: 'carta-cap-figure',
  /**
   * A QR the theme reaches. Wraps an INLINE `<svg>`, never an `<img>`: a data
   * URI is opaque to CSS, so the renderer's white card and black modules
   * survive every theme. See `.carta-cap-qr` in `capability.css`.
   */
  qr: 'carta-cap-qr',
} as const)

/** One of the kernel's capability class names. */
export type CapabilityUiClass = (typeof CAPABILITY_UI)[keyof typeof CAPABILITY_UI]
