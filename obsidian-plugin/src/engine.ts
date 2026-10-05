/**
 * Punto di accesso al motore di conversione condiviso.
 *
 * Esbuild bundla direttamente i sorgenti in `../../src`, così il plugin usa
 * esattamente lo stesso codice del motore (nessuna copia da sincronizzare).
 */

export { mdToDoku } from '../../src/converters/mdToDoku'
export { dokuToMd } from '../../src/converters/dokuToMd'
export {
  DEFAULT_OPTIONS,
  normalizePageName,
  normalizePath,
  type CalloutStyle,
  type CodeInListsStrategy,
  type ConversionWarning,
  type FrontmatterHandling,
  type HighlightStyle,
  type InternalLinkStyle,
  type Options,
  type TagHandling,
} from '../../src/converters/types'
