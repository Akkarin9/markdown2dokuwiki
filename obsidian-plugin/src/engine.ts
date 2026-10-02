/**
 * Punto di accesso al motore di conversione, condiviso con la webapp.
 *
 * Esbuild bundla direttamente i sorgenti in `../../src`, così plugin e webapp
 * usano esattamente lo stesso codice (nessuna copia da sincronizzare).
 */

export { mdToDoku } from '../../src/converters/mdToDoku'
export { dokuToMd } from '../../src/converters/dokuToMd'
export {
  DEFAULT_OPTIONS,
  normalizePageName,
  normalizePath,
  type CalloutStyle,
  type CodeInListsStrategy,
  type FrontmatterHandling,
  type HighlightStyle,
  type InternalLinkStyle,
  type Options,
  type TagHandling,
} from '../../src/converters/types'
