/**
 * Motore di conversione DokuWiki -> Markdown (con estensioni Obsidian).
 *
 * Speculare a `mdToDoku.ts`: il documento viene segmentato in `block` a livello
 * di riga; i blocchi `<code>`/`<file>`, `<WRAP>` e i tag del plugin `note` sono
 * estratti in segmenti e resi a parte, cosi' nessuna regola inline li tocca.
 * Funzione pura.
 */

import {
  DEFAULT_OPTIONS,
  type ConversionResult,
  type ConversionWarning,
  type Options,
} from './types'
import { convertInline, isSegmentPlaceholder, segmentPlaceholder, type InlineRule } from './inline'

// ---------------------------------------------------------------------------
// Tipi interni
// ---------------------------------------------------------------------------

interface CodeSegment {
  lang: string
  content: string
  /** Nome file opzionale (`<code lang file.ext>`), non rappresentabile in MD. */
  fileName?: string
}

interface CalloutSegment {
  type: string
  title: string
  body: string[]
}

type BlockType = 'code' | 'heading' | 'hr' | 'list' | 'table' | 'quote' | 'callout' | 'paragraph'

interface Block {
  type: BlockType
  /** Indice 1-based della prima riga nel sorgente. */
  line: number
  lines: string[]
  segmentIndex?: number
  calloutIndex?: number
  /** Livello di annidamento per le citazioni. */
  quoteDepth?: number
}

const CODE_OPEN_RE = /^\s*<(code|file)\b([^>]*)>/i
const CODE_CLOSE_RE = /^\s*<\/(code|file)>\s*$/i
const CALLOUT_OPEN_RE = /^\s*<(WRAP|note|tip|warning|important|alert|danger)\b([^>]*)>/i
/** `<wrap hi>` e `<wrap code>` non sono callout: sono evidenziazione/codice. */
const WRAP_SPECIAL_RE = /^\s*<wrap\s+(hi|code)\b([^>]*)>/i
const HEADING_RE = /^(\s*)(={2,6})\s+(.*?)\s*=*\s*$/
const HR_RE = /^\s*-{4,}\s*$/
const LIST_RE = /^(\s*)([*-])\s+(.*)$/
const QUOTE_RE = /^\s*(>+)\s?(.*)$/
const TABLE_ROW_RE = /^\s*[|^]/
const INDENTED_RE = /^\s{2,}\S/
const KNOWN_HTML = new Set(['sub', 'sup', 'del', 'code', 'nowiki', 'br', 'u', 'fc', 'mark'])

/** Tag del plugin `note` -> tipo callout Obsidian. */
const NOTE_TAG_TO_TYPE: Record<string, string> = {
  note: 'note',
  tip: 'tip',
  warning: 'warning',
  important: 'important',
  alert: 'warning',
  danger: 'danger',
}

/** Classe del plugin `wrap` -> tipo callout Obsidian. */
const WRAP_CLASS_TO_TYPE: Record<string, string> = {
  note: 'note',
  info: 'info',
  tip: 'tip',
  warning: 'warning',
  danger: 'danger',
  important: 'important',
  alert: 'warning',
}

// ---------------------------------------------------------------------------
// Segmentazione in blocchi
// ---------------------------------------------------------------------------

function isCalloutClose(line: string, tag: string): boolean {
  return new RegExp(`^\\s*</${tag}>\\s*$`, 'i').test(line)
}

function collectBlocks(
  lines: string[],
  codeSegments: CodeSegment[],
  calloutSegments: CalloutSegment[],
  warnings: ConversionWarning[],
): Block[] {
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const lineNo = i + 1

    if (line.trim() === '') {
      i += 1
      continue
    }

    // Blocco <code>/<file>.
    const codeOpen = CODE_OPEN_RE.exec(line)
    if (codeOpen) {
      const tag = codeOpen[1].toLowerCase()
      const attrs = codeOpen[2].trim().split(/\s+/).filter(Boolean)
      const lang = attrs[0] && attrs[0] !== '-' ? attrs[0] : ''
      const fileName = attrs[1]
      if (fileName) {
        warnings.push({
          line: lineNo,
          kind: 'degraded',
          message: `Nome file "${fileName}" nel blocco <${tag}>: non rappresentabile in Markdown.`,
        })
      }
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !CODE_CLOSE_RE.test(lines[j])) {
        body.push(lines[j])
        j += 1
      }
      if (j >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: 'degraded',
          message: `Blocco <${tag}> non chiuso: chiuso automaticamente a fine documento.`,
        })
      }
      const segmentIndex = codeSegments.length
      codeSegments.push({ lang, content: body.join('\n'), fileName })
      blocks.push({ type: 'code', line: lineNo, lines: body, segmentIndex })
      i = j < lines.length ? j + 1 : j
      continue
    }

    // Blocco `<wrap hi>` (evidenziazione): non è un callout, lo trattiamo
    // come paragrafo con la regola inline che riconosce `<wrap hi>`.
    // Blocco `<wrap hi>` (evidenziazione su più righe): lo riduciamo a una
    // singola riga così la regola inline `<wrap hi>...</wrap>` lo riconosce.
    if (/^\s*<wrap\s+hi>\s*$/i.test(line)) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !/^\s*<\/wrap>\s*$/i.test(lines[j])) {
        body.push(lines[j].trim())
        j += 1
      }
      blocks.push({ type: 'paragraph', line: lineNo, lines: [`<wrap hi>${body.join(' ')}</wrap>`] })
      i = j < lines.length ? j + 1 : j
      continue
    }

    // Blocco `<wrap code>`: codice dentro una lista, reso come fence.
    const wrapSpecial = WRAP_SPECIAL_RE.exec(line)
    if (wrapSpecial && /^code$/i.test(wrapSpecial[1])) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !/^\s*<\/wrap>\s*$/i.test(lines[j])) {
        body.push(lines[j])
        j += 1
      }
      const segmentIndex = codeSegments.length
      codeSegments.push({ lang: '', content: body.join('\n') })
      blocks.push({ type: 'code', line: lineNo, lines: body, segmentIndex })
      i = j < lines.length ? j + 1 : j
      continue
    }

    // Blocco callout (<WRAP>, plugin note).
    const calloutOpen = CALLOUT_OPEN_RE.exec(line)
    // `<wrap hi>` è evidenziazione, non un callout: la gestisce la regola inline.
    if (calloutOpen && !wrapSpecial) {
      const tag = calloutOpen[1]
      const isWrap = /^wrap$/i.test(tag)
      const attrs = calloutOpen[2].trim()
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !isCalloutClose(lines[j], tag)) {
        body.push(lines[j])
        j += 1
      }
      if (j >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: 'degraded',
          message: `Blocco <${tag}> non chiuso: chiuso automaticamente a fine documento.`,
        })
      }

      let type: string
      let title = ''
      if (isWrap) {
        const parts = attrs.split(/\s+/).filter(Boolean)
        type = WRAP_CLASS_TO_TYPE[(parts[0] ?? '').toLowerCase()] ?? 'note'
        title = parts.slice(1).join(' ')
      } else {
        type = NOTE_TAG_TO_TYPE[tag.toLowerCase()] ?? 'note'
        title = attrs
      }

      // Il plugin `note` spesso mette il titolo come prima riga `**Titolo**`.
      if (!title && body.length > 0) {
        const m = /^\*\*(.+?)\*\*$/.exec(body[0].trim())
        if (m) {
          title = m[1]
          body.shift()
          if (body[0] !== undefined && body[0].trim() === '') body.shift()
        }
      }

      const calloutIndex = calloutSegments.length
      calloutSegments.push({ type, title, body })
      blocks.push({ type: 'callout', line: lineNo, lines: body, calloutIndex })
      i = j < lines.length ? j + 1 : j
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', line: lineNo, lines: [line] })
      i += 1
      continue
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr', line: lineNo, lines: [line] })
      i += 1
      continue
    }

    if (TABLE_ROW_RE.test(line)) {
      const rows: string[] = []
      let j = i
      while (j < lines.length && TABLE_ROW_RE.test(lines[j]) && lines[j].trim() !== '') {
        rows.push(lines[j])
        j += 1
      }
      blocks.push({ type: 'table', line: lineNo, lines: rows })
      i = j
      continue
    }

    if (LIST_RE.test(line)) {
      const rows: string[] = []
      let j = i
      while (j < lines.length) {
        const candidate = lines[j]
        // Riga vuota: la lista prosegue solo se la riga seguente appartiene
        // ancora alla lista (voce, continuazione indentata o `<code>` indentato).
        if (candidate.trim() === '') {
          let k = j
          while (k < lines.length && lines[k].trim() === '') k += 1
          if (k >= lines.length) break
          const next = lines[k]
          const continues =
            LIST_RE.test(next) || INDENTED_RE.test(next) || CODE_OPEN_RE.test(next)
          if (!continues) break
          for (let b = j; b < k; b += 1) rows.push('')
          j = k
          continue
        }
        if (LIST_RE.test(candidate)) {
          rows.push(candidate)
          j += 1
          continue
        }
        // Blocco <code> indentato dentro una voce di lista: estratto in un
        // segmento, reso con una fence indentata nello stesso punto.
        const codeOpen = CODE_OPEN_RE.exec(candidate)
        if (codeOpen && INDENTED_RE.test(candidate)) {
          const attrs = codeOpen[2].trim().split(/\s+/).filter(Boolean)
          const lang = attrs[0] && attrs[0] !== '-' ? attrs[0] : ''
          const body: string[] = []
          let k = j + 1
          while (k < lines.length && !CODE_CLOSE_RE.test(lines[k])) {
            body.push(lines[k].replace(/^\s{2}/, ''))
            k += 1
          }
          const segmentIndex = codeSegments.length
          codeSegments.push({ lang, content: body.join('\n') })
          rows.push(segmentPlaceholder(segmentIndex))
          j = k < lines.length ? k + 1 : k
          continue
        }
        // Continuazione indentata di un item (non un blocco di codice se il
        // contesto e' gia' una lista).
        if (INDENTED_RE.test(candidate)) {
          rows.push(candidate)
          j += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', line: lineNo, lines: rows })
      i = j
      continue
    }

    // Blocco di codice indentato (2+ spazi), valido solo dopo una riga vuota.
    const previousBlank = i === 0 || lines[i - 1].trim() === ''
    if (INDENTED_RE.test(line) && previousBlank) {
      const body: string[] = []
      let j = i
      while (j < lines.length && INDENTED_RE.test(lines[j])) {
        body.push(lines[j].replace(/^ {2}/, ''))
        j += 1
      }
      warnings.push({
        line: lineNo,
        kind: 'collision',
        message:
          'Blocco indentato di 2+ spazi: in DokuWiki e\' un blocco di codice, ma un\'indentazione identica puo\' anche essere la continuazione di una lista.',
      })
      const segmentIndex = codeSegments.length
      codeSegments.push({ lang: '', content: body.join('\n') })
      blocks.push({ type: 'code', line: lineNo, lines: body, segmentIndex })
      i = j
      continue
    }

    const quote = QUOTE_RE.exec(line)
    if (quote) {
      const depth = quote[1].length
      const rows: string[] = []
      let j = i
      while (j < lines.length && QUOTE_RE.test(lines[j])) {
        rows.push(lines[j])
        j += 1
      }
      blocks.push({ type: 'quote', line: lineNo, lines: rows, quoteDepth: depth })
      i = j
      continue
    }

    const para: string[] = [line]
    let j = i + 1
    while (j < lines.length) {
      const candidate = lines[j]
      if (
        candidate.trim() === '' ||
        CODE_OPEN_RE.test(candidate) ||
        CALLOUT_OPEN_RE.test(candidate) ||
        HEADING_RE.test(candidate) ||
        (HR_RE.test(candidate) && !LIST_RE.test(candidate)) ||
        (LIST_RE.test(candidate) && !INDENTED_RE.test(candidate)) ||
        TABLE_ROW_RE.test(candidate) ||
        QUOTE_RE.test(candidate)
      ) {
        break
      }
      para.push(candidate)
      j += 1
    }
    blocks.push({ type: 'paragraph', line: lineNo, lines: para })
    i = j
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Regole inline Doku -> MD
// ---------------------------------------------------------------------------

function buildInlineRules(
  options: Options,
  footnotes: string[],
  warnings: ConversionWarning[],
  line: number,
  externalLink: (url: string, text: string) => string,
  internalLink: (target: string, text: string) => string,
): InlineRule[] {
  return [
    // Blocchi "no formatting" di DokuWiki: contenuto protetto e preservato.
    {
      pattern: /%%[\s\S]*?%%/g,
      replace: (m) => {
        warnings.push({
          line,
          kind: 'info',
          message: 'Testo `%%...%%`: in Obsidian e\' un commento, in DokuWiki disattiva la formattazione.',
        })
        return m[0]
      },
    },
    // <nowiki>: mostra il contenuto letterale.
    {
      pattern: /<nowiki>([\s\S]*?)<\/nowiki>/gi,
      replace: (m) => m[1],
    },
    // <code> inline (raro): codice racchiuso tra apici inversi.
    {
      pattern: /<code>([\s\S]*?)<\/code>/gi,
      replace: (m) => '`' + m[1] + '`',
    },
    // Codice inline: ''x'' -> `x`
    { pattern: /''([^']+?)''/g, replace: (m) => '`' + m[1] + '`' },
    // Footnote inline: ((testo)) -> [^n] (definizioni accodate a fine documento).
    {
      pattern: /\(\((?=\S)([\s\S]+?)(?<=\S)\)\)/g,
      replace: (m) => {
        footnotes.push(m[1].trim())
        return `[^${footnotes.length}]`
      },
    },
    // Riga di tag del plugin tag: {{tag>a b}} -> #a #b. DEVE precedere la
    // regola media, altrimenti verrebbe interpretata come un'immagine.
    {
      pattern: /\{\{tag>([^}]*)\}\}/gi,
      replace: (m) => {
        if (options.tags !== 'note') return ''
        const tags = m[1].trim().split(/\s+/).filter(Boolean)
        warnings.push({
          line,
          kind: 'info',
          message: 'Riga `{{tag>...}}` convertita in tag Obsidian: era generata dal plugin tag di DokuWiki.',
        })
        return tags.map((t) => `#${t}`).join(' ')
      },
    },
    // Transclusione del plugin include: {{page>ns:pagina}} -> ![[ns/pagina]].
    // DEVE precedere la regola media.
    {
      pattern: /\{\{page>([^{}]+?)\}\}/gi,
      replace: (m) => {
        const target = m[1].trim()
        warnings.push({
          line,
          kind: 'info',
          message: `Transclusione {{page>${target}}}: resa come embed Obsidian ![[${target}]].`,
        })
        return `![[${target}]]`
      },
    },
    // Media: {{file}}, {{file|alt}}, {{file?WxH}}, {{file?W|alt}}
    {
      pattern: /\{\{([^{}]*?)\}\}/g,
      replace: (m) => renderMedia(m[1], warnings, line),
    },
    // Link: [[target|testo]] oppure [[target]]
    {
      pattern: /\[\[([^\]]+?)\]\]/g,
      replace: (m) => {
        const raw = m[1]
        const bar = raw.indexOf('|')
        const target = (bar >= 0 ? raw.slice(0, bar) : raw).trim()
        const text = bar >= 0 ? raw.slice(bar + 1).trim() : target
        if (/^(https?|ftp|mailto|tel|file):/i.test(target) || /^www\./i.test(target) || target.includes('>')) {
          if (target.includes('>')) {
            warnings.push({
              line,
              kind: 'degraded',
              message: `Interwiki link [[${target}]]: reso come link Markdown generico.`,
            })
          }
          return externalLink(target, text)
        }
        return internalLink(target, text)
      },
    },
    // Barrato
    { pattern: /<del>([\s\S]*?)<\/del>/gi, replace: (m) => `~~${m[1]}~~` },
    // Highlight: `<fc ...>` (nativo), `<mark>` e il plugin `<wrap hi>`.
    { pattern: /<fc\s+[^>]+>([\s\S]*?)<\/fc>/gi, replace: (m) => `==${m[1]}==` },
    { pattern: /<mark>([\s\S]*?)<\/mark>/gi, replace: (m) => `==${m[1]}==` },
    { pattern: /<wrap\s+hi>([\s\S]*?)<\/wrap>/gi, replace: (m) => `==${m[1]}==` },
    // Macro di controllo: rimosse.
    {
      pattern: /~~(NOTOC|NOCACHE)~~/gi,
      replace: (m) => {
        warnings.push({ line, kind: 'info', message: `Macro DokuWiki ${m[0]} rimossa.` })
        return ''
      },
    },
    // Grassetto prima del corsivo.
    { pattern: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, replace: (m) => `**${m[1]}**` },
    // Corsivo //x// (escluso lo `//` interno a un URL: protetto da un `:` o
    // da un carattere di parola prima).
    { pattern: /(?<![:\w])\/\/(?=\S)([^/\n]+?)(?<=\S)\/\//g, replace: (m) => `*${m[1]}*` },
    // Sottolineato __x__: nessun equivalente Markdown.
    {
      pattern: /__(?=\S)([\s\S]+?)(?<=\S)__/g,
      replace: (m) => {
        warnings.push({
          line,
          kind: 'degraded',
          message: 'Sottolineato `__x__`: reso come HTML `<u>`, non supportato da Markdown puro.',
        })
        return `<u>${m[1]}</u>`
      },
    },
    // Interruzione di riga forzata \\ -> backslash di fine riga.
    { pattern: /[ \t]*\\\\[ \t]*/g, replace: () => '\\' },
  ]
}

function renderMedia(inner: string, warnings: ConversionWarning[], line: number): string {
  const bar = inner.indexOf('|')
  const targetRaw = (bar >= 0 ? inner.slice(0, bar) : inner).trim()
  const alias = bar >= 0 ? inner.slice(bar + 1).trim() : ''
  const q = targetRaw.indexOf('?')
  const file = (q >= 0 ? targetRaw.slice(0, q) : targetRaw).trim()
  const query = q >= 0 ? targetRaw.slice(q + 1).trim() : ''
  const external = /^(https?|ftp):/i.test(file)

  if (query) {
    // Dimensione/allineamento: conservata come embed Obsidian `![[file|W]]`.
    warnings.push({
      line,
      kind: 'info',
      message: `Dimensione immagine "?${query}" preservata come embed Obsidian.`,
    })
    return `![[${file}|${query}]]`
  }
  if (external || alias) {
    return `![${alias || file}](${file})`
  }
  return `![[${file}]]`
}

// ---------------------------------------------------------------------------
// Rendering dei blocchi
// ---------------------------------------------------------------------------

/** Sceglie una fence abbastanza lunga da non chiudersi sul contenuto. */
function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function renderCode(segment: CodeSegment): string {
  const fence = fenceFor(segment.content)
  return `${fence}${segment.lang}\n${segment.content}\n${fence}`
}

function renderHeading(line: string, lineNo: number, warnings: ConversionWarning[]): string {
  const m = HEADING_RE.exec(line)
  if (!m) return line
  const count = m[2].length
  const level = Math.min(5, Math.max(1, 7 - count))
  if (count < 2) {
    warnings.push({ line: lineNo, kind: 'degraded', message: 'Heading DokuWiki con meno di due `=`: normalizzato.' })
  }
  return `${'#'.repeat(level)} ${m[3].trim()}`
}

/** Divide una riga di tabella DokuWiki conservando le celle vuote (colspan/rowspan). */
function splitDokuRow(row: string): string[] {
  const body = row.trim().replace(/^[|^]/, '').replace(/[|^]\s*$/, '')
  return body.split(/[|^]/)
}

/** Rileva l'allineamento di una cella DokuWiki dalle spaziature. */
function detectAlign(cell: string): 'left' | 'right' | 'center' | null {
  const leading = /^\s{2,}/.test(cell)
  const trailing = /\s{2,}$/.test(cell)
  if (leading && trailing) return 'center'
  if (leading) return 'right'
  if (trailing) return 'left'
  return null
}

function renderTable(block: Block, options: Options, footnotes: string[], warnings: ConversionWarning[], ext: (u: string, t: string) => string, int: (t: string, x: string) => string): string {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, ext, int)
  const convert = (text: string): string => convertInline(text, rules).trim()

  const first = block.lines[0].trim()
  const hasHeader = first.startsWith('^')

  const normalizeRow = (row: string): { cells: string[]; aligns: Array<'left' | 'right' | 'center' | null> } => {
    const raw = splitDokuRow(row)
    const cells: string[] = []
    const aligns: Array<'left' | 'right' | 'center' | null> = []
    for (const cell of raw) {
      const text = cell.trim()
      if (text === '') {
        // Cella vuota = colspan (cella precedente estesa).
        if (cells.length > 0) {
          warnings.push({
            line: block.line,
            kind: 'degraded',
            message: 'Cella unita orizzontalmente (colspan `||`): degradata in celle vuote in Markdown.',
          })
          cells.push('')
          aligns.push(null)
        }
        continue
      }
      if (text === ':::') {
        warnings.push({
          line: block.line,
          kind: 'degraded',
          message: 'Cella unita verticalmente (rowspan `:::`): degradata in cella vuota in Markdown.',
        })
        cells.push('')
        aligns.push(null)
        continue
      }
      cells.push(convert(text))
      aligns.push(detectAlign(cell))
    }
    return { cells, aligns }
  }

  const header = normalizeRow(block.lines[0])
  const bodyRows = block.lines.slice(1).map(normalizeRow)

  // La tabella DokuWiki non ha una riga separatore: la costruiamo dagli
  // allineamenti rilevati sulla prima riga.
  const columnCount = Math.max(header.cells.length, ...bodyRows.map((r) => r.cells.length), 1)
  const aligns = Array.from({ length: columnCount }, (_, idx) => header.aligns[idx] ?? bodyRows.find((r) => r.aligns[idx])?.aligns[idx] ?? null)

  const pad = (cells: string[]): string[] =>
    Array.from({ length: columnCount }, (_, idx) => cells[idx] ?? '')

  const renderRow = (cells: string[]): string => `| ${pad(cells).join(' | ')} |`
  const separator = `| ${aligns
    .map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'))
    .join(' | ')} |`

  const out: string[] = []
  if (hasHeader) {
    out.push(renderRow(header.cells), separator)
  } else {
    // Nessun header in DokuWiki: ne sintetizziamo uno vuoto per Markdown.
    out.push(renderRow(Array(columnCount).fill('')), separator)
    out.push(renderRow(header.cells))
  }
  for (const row of bodyRows) out.push(renderRow(row.cells))
  return out.join('\n')
}

function renderList(block: Block, options: Options, footnotes: string[], warnings: ConversionWarning[], ext: (u: string, t: string) => string, int: (t: string, x: string) => string, codeSegments: CodeSegment[]): string {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, ext, int)
  const out: string[] = []
  for (const raw of block.lines) {
    // Riga vuota di separazione.
    if (raw.trim() === '') {
      out.push('')
      continue
    }
    // Placeholder: blocco di codice indentato dentro una voce di lista.
    const ph = isSegmentPlaceholder(raw)
    if (ph !== null) {
      const segment = codeSegments[ph]
      const fence = fenceFor(segment.content)
      const indent = '   '
      const block = `${fence}${segment.lang}\n${segment.content}\n${fence}`
      out.push(
        block
          .split('\n')
          .map((l) => (l === '' ? l : indent + l))
          .join('\n'),
      )
      continue
    }
    const m = LIST_RE.exec(raw)
    if (!m) {
      out.push(`  ${convertInline(raw.trim(), rules)}`)
      continue
    }
    const indentLen = m[1].replace(/\t/g, '  ').length
    const depth = Math.max(0, Math.floor(indentLen / 2) - 1)
    const ordered = m[2] === '-'
    let content = m[3]
    // Task DokuWiki (☐/☑) -> checkbox Obsidian.
    const task = /^([☐☑])\s+(.*)$/.exec(content.trim())
    if (task) content = `[${task[1] === '☑' ? 'x' : ' '}] ${task[2]}`
    const marker = ordered ? '1.' : '-'
    out.push(`${'  '.repeat(depth)}${marker} ${convertInline(content, rules)}`)
  }
  return out.join('\n')
}

function renderCallout(segment: CalloutSegment, options: Options, footnotes: string[], warnings: ConversionWarning[], line: number, ext: (u: string, t: string) => string, int: (t: string, x: string) => string): string {
  const rules = buildInlineRules(options, footnotes, warnings, line, ext, int)
  const body = segment.body.map((l) => (l.trim() === '' ? '>' : `> ${convertInline(l, rules)}`))
  const head = `> [!${segment.type}]${segment.title ? ` ${segment.title}` : ''}`
  return [head, ...body].join('\n')
}

function renderQuote(block: Block, options: Options, footnotes: string[], warnings: ConversionWarning[], ext: (u: string, t: string) => string, int: (t: string, x: string) => string): string {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, ext, int)
  return block.lines
    .map((raw) => {
      const m = QUOTE_RE.exec(raw)
      if (!m) return `> ${convertInline(raw, rules)}`
      const prefix = '> '.repeat(m[1].length)
      return m[2].trim() === '' ? prefix.trimEnd() : `${prefix}${convertInline(m[2], rules)}`
    })
    .join('\n')
}

function cleanLine(text: string): string {
  return text.replace(/[ \t]+$/, '')
}

function renderParagraph(block: Block, options: Options, footnotes: string[], warnings: ConversionWarning[], ext: (u: string, t: string) => string, int: (t: string, x: string) => string): string {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, ext, int)
  return block.lines.map((l) => cleanLine(convertInline(l, rules))).join('\n')
}

// ---------------------------------------------------------------------------
// Avvisi per HTML non supportato
// ---------------------------------------------------------------------------

function scanUnsupportedHtml(blocks: Block[], warnings: ConversionWarning[]): void {
  const tagRe = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g
  for (const block of blocks) {
    if (block.type === 'code' || block.type === 'callout') continue
    for (let i = 0; i < block.lines.length; i += 1) {
      const line = block.lines[i]
      let m: RegExpExecArray | null
      tagRe.lastIndex = 0
      while ((m = tagRe.exec(line)) !== null) {
        if (!KNOWN_HTML.has(m[1].toLowerCase())) {
          warnings.push({
            line: block.line + i,
            kind: 'unsupported',
            message: `Tag HTML <${m[1]}> senza equivalente Markdown: lasciato invariato.`,
          })
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

export function dokuToMd(input: string, options: Partial<Options> = {}): ConversionResult {
  const opts: Options = { ...DEFAULT_OPTIONS, ...options }
  const warnings: ConversionWarning[] = []

  const rawLines = input.replace(/\r\n?/g, '\n').split('\n')
  const codeSegments: CodeSegment[] = []
  const calloutSegments: CalloutSegment[] = []
  const footnotes: string[] = []

  const blocks = collectBlocks(rawLines, codeSegments, calloutSegments, warnings)
  scanUnsupportedHtml(blocks, warnings)

  // I link interni conservano il namespace (scelta esplicita dell'utente).
  const externalLink = (url: string, text: string): string => `[${text || url}](${url})`
  const internalLink = (target: string, text: string): string => {
    // I namespace DokuWiki (`:`) tornano a essere cartelle Obsidian (`/`),
    // cosi' md -> doku -> md e' stabile.
    const plain = opts.preserveFolders ? target.replace(/:/g, '/') : target.replace(/:/g, '')
    if (opts.internalLinks === 'wikilink') {
      return text && text !== target ? `[[${plain}|${text}]]` : `[[${plain}]]`
    }
    return `[${text || target}](${target})`
  }

  const outBlocks: string[] = []
  for (const block of blocks) {
    let rendered = ''
    switch (block.type) {
      case 'code':
        rendered = renderCode(codeSegments[block.segmentIndex ?? 0])
        break
      case 'heading':
        rendered = renderHeading(block.lines[0], block.line, warnings)
        break
      case 'hr':
        rendered = '---'
        break
      case 'table':
        rendered = renderTable(block, opts, footnotes, warnings, externalLink, internalLink)
        break
      case 'list':
        rendered = renderList(block, opts, footnotes, warnings, externalLink, internalLink, codeSegments)
        break
      case 'callout':
        rendered = renderCallout(
          calloutSegments[block.calloutIndex ?? 0],
          opts,
          footnotes,
          warnings,
          block.line,
          externalLink,
          internalLink,
        )
        break
      case 'quote':
        rendered = renderQuote(block, opts, footnotes, warnings, externalLink, internalLink)
        break
      case 'paragraph':
      default:
        rendered = renderParagraph(block, opts, footnotes, warnings, externalLink, internalLink)
        break
    }
    // Un blocco puo' svuotarsi (es. riga {{tag>}} rimossa): non emettere
    // righe vuote extra.
    if (rendered !== '') outBlocks.push(rendered)
  }

  // Definizioni footnote in coda (DokuWiki le ha inline).
  if (footnotes.length > 0) {
    outBlocks.push(footnotes.map((text, idx) => `[^${idx + 1}]: ${text}`).join('\n'))
  }

  const joined = outBlocks.join('\n\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/, '')
  const output = joined ? `${joined}\n` : ''
  warnings.sort((a, b) => a.line - b.line)
  return { output, warnings }
}
