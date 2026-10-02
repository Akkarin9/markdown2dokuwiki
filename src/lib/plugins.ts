/**
 * Rilevamento dei plugin DokuWiki in uso a partire da un frammento di pagina
 * incollato. Serve a precompilare un profilo: se nel testo compaiono `<WRAP>`,
 * `<note>`, `{{page>...}}` ecc., l'app deduce il plugin e imposta lo stile
 * callout/transclusione corrispondente.
 *
 * Euristica, senza rete: cerca solo i marcatori noti.
 */

import type { CalloutStyle, HighlightStyle, Options } from '../converters/types'

export interface PluginDetection {
  /** Id interni dei plugin riconosciuti. */
  detected: Array<'wrap' | 'note' | 'include' | 'tag' | 'mark'>
  /** Suggerimenti per le opzioni, da applicare al profilo. */
  suggestion: Partial<Options>
  /** Descrizione leggibile per l'utente. */
  notes: string[]
}

interface Probe {
  id: PluginDetection['detected'][number]
  re: RegExp
  note: string
  apply: (s: Partial<Options>) => void
}

const PROBES: Probe[] = [
  {
    id: 'wrap',
    re: /<\s*\/?\s*WRAP\b/i,
    note: 'Plugin WRAP trovato: stile callout impostato su <WRAP>.',
    apply: (s) => {
      s.calloutStyle = 'wrap' satisfies CalloutStyle
    },
  },
  {
    id: 'note',
    re: /<\s*\/?\s*(note|tip|warning|important|alert|danger)\b[^>]*>/i,
    note: 'Plugin note trovato: stile callout impostato su <note>.',
    apply: (s) => {
      if (!s.calloutStyle) s.calloutStyle = 'note' satisfies CalloutStyle
    },
  },
  {
    id: 'include',
    re: /\{\{\s*page\s*>/i,
    note: 'Plugin include trovato: transclusioni abilitate ({{page>...}}).',
    apply: (s) => {
      s.includeTransclusion = true
    },
  },
  {
    id: 'tag',
    re: /\{\{\s*tag\s*>/i,
    note: 'Plugin tag trovato: i tag verranno resi come riga {{tag>...}}.',
    apply: (s) => {
      s.tags = 'note'
    },
  },
  {
    id: 'mark',
    re: /<mark>|<wrap\s+hi>/i,
    note: 'Evidenziazione tramite <mark>/<wrap hi> trovata: stile highlight aggiornato.',
    apply: (s) => {
      s.highlightStyle = 'mark' satisfies HighlightStyle
    },
  },
]

/** Analizza un frammento e propone aggiornamenti alle opzioni. */
export function detectPlugins(fragment: string): PluginDetection {
  const detected: PluginDetection['detected'] = []
  const suggestion: Partial<Options> = {}
  const notes: string[] = []

  for (const probe of PROBES) {
    if (probe.re.test(fragment)) {
      detected.push(probe.id)
      probe.apply(suggestion)
      notes.push(probe.note)
    }
  }

  return { detected, suggestion, notes }
}
