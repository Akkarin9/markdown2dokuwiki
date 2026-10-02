/**
 * Supporto CodeMirror 6 per DokuWiki: un linguaggio "Stream" semplificato
 * (non un parser completo) piu' uno stile di highlight condiviso con Markdown.
 */

import { LanguageSupport, StreamLanguage, type StreamParser } from '@codemirror/language'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

interface DokuState {
  inCodeBlock: boolean
}

/** Matcher inline (ancorati alla posizione corrente dello stream). */
const INLINE: Array<{ re: RegExp; token: string }> = [
  { re: /''[^']+''/, token: 'mono' },
  { re: /<code>[^<]*<\/code>/, token: 'mono' },
  { re: /<fc\b[^>]*>[^<]*<\/fc>/, token: 'mono' },
  { re: /\*\*[^*]+\*\*/, token: 'strong' },
  { re: /__[^_]+__/, token: 'emphasis' },
  { re: /\/\/[^/\n]+\/\//, token: 'emphasis' },
  { re: /<del>[^<]*<\/del>/, token: 'strike' },
  { re: /<\/?(sub|sup|nowiki)>/, token: 'keyword' },
  { re: /\[\[[^\]]*\]\]/, token: 'link' },
  { re: /\{\{[^}]*\}\}/, token: 'url' },
  { re: /\(\([^)]*\)\)/, token: 'meta' },
  { re: /<\/?[a-zA-Z][\w-]*[^>]*>/, token: 'keyword' },
  { re: /~~[A-Z]+~~/, token: 'comment' },
  { re: /#[\p{L}\p{N}][\p{L}\p{N}_/:.-]*/u, token: 'tag' },
]

/** Trova un matcher inline ANCORATO all'inizio di `rest` (indice 0). */
function matchInlineAnchored(rest: string): { length: number; token: string } | null {
  for (const { re, token } of INLINE) {
    const m = re.exec(rest)
    if (m && m.index === 0) return { length: m[0].length, token }
  }
  return null
}

const dokuParser: StreamParser<DokuState> = {
  name: 'dokuwiki',

  startState(): DokuState {
    return { inCodeBlock: false }
  },

  copyState(state: DokuState): DokuState {
    return { inCodeBlock: state.inCodeBlock }
  },

  token(stream, state): string | null {
    // Blocco di codice aperto su una riga precedente.
    if (state.inCodeBlock) {
      if (/^\s*<\/(code|file)>/.test(stream.string.slice(stream.pos))) state.inCodeBlock = false
      stream.skipToEnd()
      return 'mono'
    }

    if (stream.sol()) {
      const rest = stream.string.slice(stream.pos)

      const heading = /^\s*(={2,6})\s/.exec(rest)
      if (heading) {
        stream.skipToEnd()
        const level = Math.max(1, 7 - heading[1].length)
        return `heading${Math.min(6, level)}`
      }
      if (/^\s*-{4,}\s*$/.test(rest)) {
        stream.skipToEnd()
        return 'hr'
      }
      if (/^\s*%%/.test(rest)) {
        stream.skipToEnd()
        return 'comment'
      }
      const codeOpen = /^\s*<(code|file)\b[^>]*>/.exec(rest)
      if (codeOpen) {
        state.inCodeBlock = !new RegExp(`</${codeOpen[1]}>`).test(rest)
        stream.skipToEnd()
        return 'keyword'
      }
      // Marcatore di lista: colorato, poi si prosegue con l'inline.
      if (stream.match(/^\s*[*-]\s/)) return 'list'
      // Simboli delle attività (☐/☑) subito dopo il marcatore.
      if (stream.match(/^[☐☑]\s/)) return 'keyword'
      // Prefisso di citazione.
      if (stream.match(/^\s*>{1,}\s?/)) return 'quote'
      // Blocco callout `<WRAP ...>` / `<note ...>`.
      if (/^\s*<(WRAP|note|tip|warning|important|alert|danger)\b/i.test(rest)) {
        stream.skipToEnd()
        return 'keyword'
      }
    }

    if (stream.eol()) return null

    // Un matcher inline parte esattamente da qui.
    const hit = matchInlineAnchored(stream.string.slice(stream.pos))
    if (hit) {
      stream.pos += hit.length
      return hit.token
    }

    // Altrimenti consuma testo normale fino al prossimo matcher ancorato.
    const start = stream.pos
    while (!stream.eol()) {
      if (matchInlineAnchored(stream.string.slice(stream.pos))) break
      stream.next()
    }
    return stream.pos > start ? 'text' : null
  },
}

export function dokuwiki(): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(dokuParser))
}

/** Mappa i nomi dei token (Stream) sui tag di highlight. */
const dokuTokenTable = {
  heading1: t.heading1,
  heading2: t.heading2,
  heading3: t.heading3,
  heading4: t.heading4,
  heading5: t.heading5,
  heading6: t.heading6,
  strong: t.strong,
  emphasis: t.emphasis,
  strike: t.strikethrough,
  link: t.link,
  url: t.url,
  mono: t.monospace,
  comment: t.lineComment,
  hr: t.contentSeparator,
  list: t.list,
  quote: t.quote,
  tag: t.tagName,
  keyword: t.keyword,
  meta: t.meta,
}

// Applica la tabella dei token al parser.
;(dokuParser as unknown as { tokenTable?: Record<string, unknown> }).tokenTable = dokuTokenTable

/** Stile di highlight condiviso da editor Markdown e DokuWiki. */
export const sharedHighlightStyle = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], class: 'cm-heading' },
  { tag: t.heading1, class: 'cm-h1' },
  { tag: t.heading2, class: 'cm-h2' },
  { tag: t.heading3, class: 'cm-h3' },
  { tag: t.strong, class: 'cm-strong' },
  { tag: t.emphasis, class: 'cm-em' },
  { tag: t.strikethrough, class: 'cm-strike' },
  { tag: t.link, class: 'cm-link' },
  { tag: t.url, class: 'cm-url' },
  { tag: t.monospace, class: 'cm-mono' },
  { tag: t.lineComment, class: 'cm-comment' },
  { tag: t.blockComment, class: 'cm-comment' },
  { tag: t.contentSeparator, class: 'cm-hr' },
  { tag: t.list, class: 'cm-list' },
  { tag: t.quote, class: 'cm-quote' },
  { tag: t.tagName, class: 'cm-tag' },
  { tag: t.keyword, class: 'cm-keyword' },
  { tag: t.meta, class: 'cm-meta' },
  { tag: t.processingInstruction, class: 'cm-meta' },
])

export const sharedHighlighting: Extension = syntaxHighlighting(sharedHighlightStyle)
