/**
 * Entry point pubblico del motore di conversione, riusabile come libreria.
 *
 *   import { mdToDoku, dokuToMd, DEFAULT_OPTIONS } from 'markdown2dokuwiki'
 *
 * Tutte le funzioni sono pure e non toccano il DOM: funzionano in browser,
 * in Node e in un eventuale plugin Obsidian.
 */

export { mdToDoku } from './converters/mdToDoku'
export { dokuToMd } from './converters/dokuToMd'
export { convertInline, type InlineRule } from './converters/inline'
export {
  DEFAULT_OPTIONS,
  joinNamespace,
  normalizePageName,
  normalizePath,
  type CalloutStyle,
  type CodeInListsStrategy,
  type ConversionContext,
  type ConversionResult,
  type ConversionWarning,
  type Direction,
  type FrontmatterHandling,
  type HighlightStyle,
  type InternalLinkStyle,
  type Options,
  type TagHandling,
  type WarningKind,
} from './converters/types'
export { convertBatchToZip, buildBatchPlan, renderReadme, type BatchAttachment } from './lib/batch'
export { detectFormat } from './lib/detect'
export { detectPlugins } from './lib/plugins'
export { diffLines, diffStats } from './lib/diff'
