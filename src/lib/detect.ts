/**
 * Rilevamento euristico del formato di un testo incollato.
 * Serva solo ad ASSISTERE la scelta dell'utente: la direzione resta manuale.
 */

import type { Direction } from '../converters/types'

export interface DetectionResult {
  direction: Direction
  confidence: 'alta' | 'bassa'
}

/** Segnali che appartengono tipicamente alla sintassi DokuWiki. */
const DOKU_MARKERS: Array<{ re: RegExp; weight: number }> = [
  { re: /^=+\s.*\s=+$/m, weight: 3 }, // heading ========
  { re: /\(\([^)]+\)\)/, weight: 2 }, // footnote
  { re: /<\/?(code|file)\b[^>]*>/i, weight: 3 },
  { re: /^\s*[*-]\s/m, weight: 1 }, // lista (condivisa con MD: peso basso)
  { re: /\{\{[^{}]+\}\}/, weight: 1 }, // media
  { re: /'[^']+''/, weight: 1 }, // monospazio
  { re: /\/\/[^/\n]+\/\//, weight: 2 }, // corsivo
  { re: /<-{2,}|-{4,}\s*$/m, weight: 2 }, // hr / frecce
  { re: /<WRAP\b|<note>|<tip>|<warning>/i, weight: 3 },
  { re: /~~[A-Z]+~~/, weight: 2 }, // macro di controllo
]

/** Segnali che appartengono tipicamente al Markdown / Obsidian. */
const MD_MARKERS: Array<{ re: RegExp; weight: number }> = [
  { re: /^#{1,6}\s+\S/m, weight: 3 }, // heading
  { re: /^\s*```/m, weight: 3 }, // code fence
  { re: /\[[^\]]+\]\((?:https?:|\/|\.?\/)/, weight: 2 }, // link/immagine MD
  { re: /!?\[\[[^\]]+\]\]/, weight: 3 }, // wikilink/embed Obsidian
  { re: /^>\s*\[!/m, weight: 3 }, // callout Obsidian
  { re: /%%[^%]*%%/, weight: 1 }, // commento
  { re: /==[^=\n]+==/, weight: 2 }, // highlight Obsidian
  { re: /^\s*[-*]\s+\[[ xX]\]\s/m, weight: 3 }, // task
  { re: /^\|.*\|.*\|/m, weight: 2 }, // tabella con pipe
  { re: /\*\*[^*\n]+\*\*/, weight: 1 }, // grassetto
]

function score(text: string, markers: Array<{ re: RegExp; weight: number }>): number {
  return markers.reduce((total, { re, weight }) => total + (re.test(text) ? weight : 0), 0)
}

export function detectFormat(text: string): DetectionResult | null {
  if (text.trim().length === 0) return null
  const dokuScore = score(text, DOKU_MARKERS)
  const mdScore = score(text, MD_MARKERS)
  if (dokuScore === mdScore) return null
  const diff = Math.abs(dokuScore - mdScore)
  return {
    direction: dokuScore > mdScore ? 'doku-to-md' : 'md-to-doku',
    confidence: diff >= 3 ? 'alta' : 'bassa',
  }
}
