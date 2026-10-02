/**
 * Motore di conversione Markdown (con estensioni Obsidian) -> DokuWiki.
 *
 * Approccio: il documento viene prima segmentato in `block` a livello di riga
 * (frontmatter, blocchi di codice, tabelle, liste, citazioni, heading, ...).
 * I blocchi di codice vengono ESTRATTI e sostituiti da un placeholder: nessuna
 * regola successiva li tocca. Ogni blocco di testo viene poi convertito con le
 * regole `inline` protette. Funzione pura.
 */

import {
  DEFAULT_OPTIONS,
  joinNamespace,
  normalizePageName,
  normalizePath,
  type ConversionContext,
  type ConversionResult,
  type ConversionWarning,
  type Options,
} from './types'
import { convertInline, isSegmentPlaceholder, segmentPlaceholder, type InlineRule } from './inline'

// ---------------------------------------------------------------------------
// Tipi interni
// ---------------------------------------------------------------------------

interface CodeSegment {
  content: string
  lang: string
}

type BlockType =
  | 'code'
  | 'heading'
  | 'hr'
  | 'list'
  | 'table'
  | 'quote'
  | 'paragraph'

interface Block {
  type: BlockType
  /** Indice 1-based della prima riga nel sorgente. */
  line: number
  /** Righe grezze del blocco (per le liste può contenere un placeholder di segmento). */
  lines: string[]
  /** Solo per `code`: indice del segmento estratto. */
  segmentIndex?: number
}

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/
const HEADING_RE = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/
const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:\s*(.*)$/
const FRONTMATTER_DELIM = /^---\s*$/
/** Blocco matematico Obsidian: riga di soli `$$`. */
const MATH_DELIM_RE = /^\s*\$\$\s*$/

/** Linguaggi di blocco gestiti da plugin Obsidian senza equivalente diretto. */
const OBSIDIAN_BLOCK_LANGS: Record<string, 'degraded' | 'unsupported'> = {
  mermaid: 'degraded',
  dataview: 'unsupported',
  dataviewjs: 'unsupported',
  tasks: 'unsupported',
  math: 'degraded',
  tex: 'degraded',
  latex: 'degraded',
}

/** Tag HTML con equivalente diretto in DokuWiki: non generano avvisi. */
const KNOWN_HTML = new Set(['sub', 'sup', 'del', 'code', 'nowiki', 'br', 'u'])

// ---------------------------------------------------------------------------
// Pre-pass: frontmatter
// ---------------------------------------------------------------------------

function handleFrontmatter(
  lines: string[],
  options: Options,
  prefix: string[],
  warnings: ConversionWarning[],
): string[] {
  if (lines.length < 2 || !FRONTMATTER_DELIM.test(lines[0])) return lines
  const closing = lines.findIndex((line, i) => i > 0 && FRONTMATTER_DELIM.test(line))
  if (closing < 0) {
    warnings.push({
      line: 1,
      kind: 'degraded',
      message: 'Frontmatter YAML aperto ma mai chiuso: lasciato invariato.',
    })
    return lines
  }
  const yaml = lines.slice(1, closing)
  switch (options.frontmatter) {
    case 'remove':
      break
    case 'keep':
      prefix.push('---', ...yaml, '---')
      break
    case 'comment':
    default:
      // DokuWiki non ha commenti multi-riga affidabili: una riga per commento.
      for (const line of yaml) prefix.push(line ? `%% ${line} %%` : '%% %%')
      // `%%...%%` e' sia il commento DokuWiki sia quello Obsidian: rileggendo
      // l'output con `removeObsidianComments` attivo il frontmatter sparirebbe.
      if (options.removeObsidianComments) {
        warnings.push({
          line: 1,
          kind: 'collision',
          message:
            'Frontmatter reso come commenti `%%...%%`: sono anche commenti Obsidian, quindi verranno rimossi in una conversione di ritorno.',
        })
      }
      break
  }
  return lines.slice(closing + 1)
}

/** Estrae le definizioni `[^label]: testo` e le neutralizza nel corpo. */
function extractFootnotes(lines: string[]): { defs: Map<string, string>; body: string[] } {
  const defs = new Map<string, string>()
  const body = lines.map((line) => {
    const m = FOOTNOTE_DEF_RE.exec(line)
    if (!m) return line
    defs.set(m[1].trim(), m[2].trim())
    // Sostituita da stringa vuota: preserva gli indici di riga per gli avvisi.
    return ''
  })
  return { defs, body }
}

// ---------------------------------------------------------------------------
// Segmentazione in blocchi
// ---------------------------------------------------------------------------

function collectBlocks(lines: string[], segments: CodeSegment[], warnings: ConversionWarning[]): Block[] {
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const lineNo = i + 1

    if (line.trim() === '') {
      i += 1
      continue
    }

    // Blocco di codice recintato.
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[2][0]
      const closingRe = new RegExp(`^\\s{0,3}${marker === '`' ? '`' : '~'}{${fence[2].length},}\\s*$`)
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !closingRe.test(lines[j])) {
        body.push(lines[j])
        j += 1
      }
      if (j >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: 'degraded',
          message: 'Blocco di codice recintato non chiuso: chiuso automaticamente a fine documento.',
        })
      }
      const segmentIndex = segments.length
      segments.push({ content: body.join('\n'), lang: fence[3] || '' })
      blocks.push({ type: 'code', line: lineNo, lines: body, segmentIndex })
      i = j < lines.length ? j + 1 : j
      continue
    }

    // Blocco matematico Obsidian (`$$ ... $$`): nessun equivalente diretto.
    if (MATH_DELIM_RE.test(line)) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !MATH_DELIM_RE.test(lines[j])) {
        body.push(lines[j])
        j += 1
      }
      if (j >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: 'degraded',
          message: 'Blocco matematico `$$` non chiuso: chiuso automaticamente a fine documento.',
        })
      }
      warnings.push({
        line: lineNo,
        kind: 'degraded',
        message: 'Blocco matematico `$$`: reso come `<code math>` (DokuWiki non renderizza LaTeX senza plugin).',
      })
      const segmentIndex = segments.length
      segments.push({ content: body.join('\n'), lang: 'math' })
      blocks.push({ type: 'code', line: lineNo, lines: body, segmentIndex })
      i = j < lines.length ? j + 1 : j
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', line: lineNo, lines: [line] })
      i += 1
      continue
    }

    if (HR_RE.test(line) && !LIST_RE.test(line)) {
      blocks.push({ type: 'hr', line: lineNo, lines: [line] })
      i += 1
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      const rows: string[] = [line, lines[i + 1]]
      let j = i + 2
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
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
        // Riga vuota: la lista prosegue solo se la riga successiva è ancora
        // parte della lista (voce, continuazione indentata o fence indentata).
        if (candidate.trim() === '') {
          let k = j
          while (k < lines.length && lines[k].trim() === '') k += 1
          if (k >= lines.length) break
          const next = lines[k]
          const nextFence = /^(\s+)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.test(next)
          const continues = nextFence || LIST_RE.test(next) || /^\s{2,}\S/.test(next)
          if (!continues) break
          for (let b = j; b < k; b += 1) rows.push('')
          j = k
          continue
        }
        // Fence di codice indentata dentro una voce di lista: estratta in un
        // segmento, sostituita da un placeholder che il renderer colloca.
        const indentedFence = /^(\s+)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.exec(candidate)
        if (indentedFence) {
          const marker = indentedFence[2][0]
          const closingRe = new RegExp(`^\\s{0,3}${marker === '`' ? '`' : '~'}{${indentedFence[2].length},}\\s*$`)
          const body: string[] = []
          let k = j + 1
          while (k < lines.length && !closingRe.test(lines[k])) {
            body.push(lines[k].replace(/^\s{1,4}/, ''))
            k += 1
          }
          const segmentIndex = segments.length
          segments.push({ content: body.join('\n'), lang: indentedFence[3] || '' })
          rows.push(segmentPlaceholder(segmentIndex))
          j = k < lines.length ? k + 1 : k
          continue
        }
        if (LIST_RE.test(candidate)) {
          rows.push(candidate)
          j += 1
          continue
        }
        if (/^\s{2,}\S/.test(candidate) && !HEADING_RE.test(candidate)) {
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

    if (QUOTE_RE.test(line)) {
      const rows: string[] = []
      let j = i
      // Una riga vuota separa due citazioni distinte (come in CommonMark).
      while (j < lines.length && QUOTE_RE.test(lines[j])) {
        rows.push(lines[j])
        j += 1
      }
      blocks.push({ type: 'quote', line: lineNo, lines: rows })
      i = j
      continue
    }

    const para: string[] = [line]
    let j = i + 1
    while (j < lines.length) {
      const candidate = lines[j]
      if (
        candidate.trim() === '' ||
        FENCE_RE.test(candidate) ||
        MATH_DELIM_RE.test(candidate) ||
        HEADING_RE.test(candidate) ||
        QUOTE_RE.test(candidate) ||
        LIST_RE.test(candidate) ||
        (HR_RE.test(candidate) && !LIST_RE.test(candidate)) ||
        (candidate.includes('|') && TABLE_SEPARATOR_RE.test(lines[j + 1] ?? ''))
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
// Regole inline MD -> Doku
// ---------------------------------------------------------------------------

const MEDIA_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|ogv|mov|ogg|mp3|wav|flac|m4a|pdf)$/i

function buildInlineRules(
  options: Options,
  footnotes: Map<string, string>,
  warnings: ConversionWarning[],
  line: number,
  tagSet: Set<string>,
): InlineRule[] {
  const mediaFile = (name: string): string =>
    joinNamespace(options.mediaNamespace, normalizePageName(name.trim().replace(/\s+/g, '_')))

  const rules: InlineRule[] = [
    // Commenti Obsidian: rimossi (default) oppure protetti cosi' le regole
    // successive non ne toccano il contenuto.
    options.removeObsidianComments
      ? { pattern: /%%[\s\S]*?%%/g, replace: () => '' }
      : { pattern: /%%[\s\S]*?%%/g, replace: (m) => m[0] },
    // Embed Obsidian: ![[img.png]], ![[img.png|300]], ![[img.png|didascalia]].
    // `![[...]]` in Obsidian puo' essere un'immagine/allegato O una transclusione
    // di nota; li distinguiamo per estensione.
    {
      pattern: /!\[\[([^\]|]+?)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g,
      replace: (m) => {
        const raw = m[1].trim()
        const anchor = m[2] ? normalizePath(m[2], options.preserveFolders) : ''
        const alias = (m[3] ?? '').trim()
        if (!MEDIA_EXT_RE.test(raw)) {
          // Transclusione di una nota.
          const page = joinNamespace(options.linkNamespace, normalizePath(raw, options.preserveFolders))
          if (options.includeTransclusion) {
            warnings.push({
              line,
              kind: 'degraded',
              message: `Embed di nota ![[${raw}]]: reso con il plugin include {{page>${page}}}.`,
            })
            return `{{page>${page}}}`
          }
          // Nessun equivalente diretto in DokuWiki.
          warnings.push({
            line,
            kind: 'degraded',
            message: `Embed di nota ![[${raw}]]: reso come link alla pagina (nessun equivalente di transclusione).`,
          })
          const target = page + (anchor ? `#${anchor}` : '')
          return alias ? `[[${target}|${alias}]]` : `[[${target}]]`
        }
        const target = mediaFile(raw)
        if (!alias) return `{{${target}}}`
        if (/^\d+(x\d+)?$/.test(alias)) return `{{${target}?${alias}}}`
        return `{{${target}|${alias}}}`
      },
    },
    // Wikilink Obsidian: [[Pagina]], [[Pagina|alias]], [[Pagina#Sezione]].
    // Le `/` di Obsidian sono cartelle -> namespace DokuWiki.
    {
      pattern: /\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g,
      replace: (m) => {
        const rawPage = m[1].trim()
        const page = normalizePath(m[1], options.preserveFolders)
        const anchor = m[2] ? normalizePageName(m[2]) : ''
        let alias = m[3]?.trim()
        const target = joinNamespace(options.linkNamespace, page) + (anchor ? `#${anchor}` : '')
        // Senza alias esplicito, un link con ancora mostra "Pagina > Sezione".
        if (!alias && anchor) alias = `${rawPage} > ${m[2]!.trim()}`
        return alias ? `[[${target}|${alias}]]` : `[[${target}]]`
      },
    },
    // Immagine Markdown: ![alt](src "titolo")
    {
      pattern: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      replace: (m) => `{{${m[2]}${m[1].trim() ? `|${m[1].trim()}` : ''}}}`,
    },
    // Link Markdown: [testo](url "titolo")
    {
      pattern: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      replace: (m) => `[[${m[2]}|${m[1]}]]`,
    },
    // Footnote: [^label] -> ((testo)) se definito, altrimenti degrada.
    {
      pattern: /\[\^([^\]]+)\]/g,
      replace: (m) => {
        const label = m[1].trim()
        const text = footnotes.get(label)
        if (text === undefined) {
          warnings.push({
            line,
            kind: 'degraded',
            message: `Riferimento a footnote [^${label}] senza definizione: lasciato invariato.`,
          })
          return m[0]
        }
        return `((${text}))`
      },
    },
    // Codice inline: `x` -> ''x''  (DokuWiki usa apici doppi, non backtick)
    { pattern: /`([^`]+)`/g, replace: (m) => `''${m[1]}''` },
    // Barrato: ~~x~~ -> <del>x</del>
    { pattern: /~~(?=\S)(.+?)(?<=\S)~~/g, replace: (m) => `<del>${m[1]}</del>` },
  ]

  if (options.convertHighlight) {
    // Richiede esattamente due `=`: cosi' non intercetta le sequenze `======`
    // degli heading DokuWiki (idempotenza sui round-trip).
    const highlight = (inner: string): string => {
      switch (options.highlightStyle) {
        case 'wrap':
          return `<wrap hi>${inner}</wrap>`
        case 'mark':
          return `<mark>${inner}</mark>`
        case 'bold':
          return `**${inner}**`
        case 'fc':
        default:
          return `<fc #ffff00>${inner}</fc>`
      }
    }
    rules.push({
      pattern: /(?<!=)==(?=\S)([^=\n]+?)(?<=\S)==(?!=)/g,
      replace: (m) => highlight(m[1]),
    })
  }

  // Grassetto+corsivo, poi grassetto, poi corsivo: l'ordine conta perche'
  // altrimenti il corsivo consumerebbe un asterisco del grassetto.
  rules.push(
    { pattern: /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, replace: (m) => `**//${m[1]}//**` },
    { pattern: /___(?=\S)(.+?)(?<=\S)___/g, replace: (m) => `**//${m[1]}//**` },
    { pattern: /\*\*(?=\S)(.+?)(?<=\S)\*\*/g, replace: (m) => `**${m[1]}**` },
    { pattern: /__(?=\S)(.+?)(?<=\S)__/g, replace: (m) => `**${m[1]}**` },
    { pattern: /(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, replace: (m) => `//${m[1]}//` },
    { pattern: /(?<![_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![_\w])/g, replace: (m) => `//${m[1]}//` },
  )

  // Tag Obsidian: sempre rimossi dal corpo; con `tags: 'note'` vengono anche
  // raccolti per essere riemessi come `{{tag>...}}` in coda al documento.
  rules.push({
    pattern: /(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu,
    replace: (m) => {
      if (options.tags === 'note') tagSet.add(m[2])
      return ''
    },
  })

  return rules
}

// ---------------------------------------------------------------------------
// Rendering dei blocchi
// ---------------------------------------------------------------------------

function renderCode(
  segment: CodeSegment,
  lineNo: number,
  warnings: ConversionWarning[],
): string {
  const lang = segment.lang.toLowerCase()
  const kind = OBSIDIAN_BLOCK_LANGS[lang]
  // `math`/`tex`/`latex` sono già segnalati dal pre-pass dei blocchi `$$`.
  if (kind && lang !== 'math' && lang !== 'tex' && lang !== 'latex') {
    warnings.push({
      line: lineNo,
      kind,
      message: `Blocco \`${segment.lang}\`: plugin Obsidian senza equivalente DokuWiki, reso come <code>.`,
    })
  }
  const open = segment.lang ? `<code ${segment.lang}>` : '<code>'
  return `${open}\n${segment.content}\n</code>`
}

function renderHeading(text: string, lineNo: number, warnings: ConversionWarning[]): string {
  const m = HEADING_RE.exec(text)
  if (!m) return text
  let level = m[1].length
  const title = m[2].trim()
  if (level >= 6) {
    level = 5
    warnings.push({
      line: lineNo,
      kind: 'unsupported',
      message: 'Heading H6 non supportato da DokuWiki (max 5 livelli): convertito in H5.',
    })
  }
  // DokuWiki: H1 = sei `=`, poi decresce. Livello 1 -> 6, livello 5 -> 2.
  const eq = '='.repeat(7 - level)
  return `${eq} ${title} ${eq}`
}

/** Divide una riga di tabella Markdown in celle. */
function splitRow(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let k = 0; k < trimmed.length; k += 1) {
    const ch = trimmed[k]
    if (ch === '\\' && trimmed[k + 1] === '|') {
      current += '|'
      k += 1
    } else if (ch === '|') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function parseAlignments(separator: string): Array<'left' | 'right' | 'center' | null> {
  return splitRow(separator).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

/** Allinea una cella DokuWiki tramite spazi (>=2 spazi dal lato opposto al testo). */
function dokuCell(cell: string, align: 'left' | 'right' | 'center' | null): string {
  if (align === 'right') return `  ${cell} `
  if (align === 'center') return `  ${cell}  `
  return ` ${cell} `
}

/** Rimuove gli spazi finali da una riga di testo (mai applicato al codice). */
function cleanLine(text: string): string {
  return text.replace(/[ \t]+$/, '')
}

function renderTable(
  block: Block,
  options: Options,
  footnotes: Map<string, string>,
  warnings: ConversionWarning[],
  tagSet: Set<string>,
): string {
  const [headerRow, separator, ...bodyRows] = block.lines
  const aligns = parseAlignments(separator)
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet)
  const convert = (text: string): string => {
    // Celle multi-riga (`<br>`): DokuWiki non le supporta nelle celle.
    if (/<br\s*\/?>/i.test(text)) {
      warnings.push({
        line: block.line,
        kind: 'degraded',
        message: 'Cella multi-riga (`<br>`): DokuWiki non supporta le righe nelle celle, resa su una sola riga.',
      })
    }
    return convertInline(text, rules)
  }
  const render = (cells: string[], isHeader: boolean): string => {
    const sep = isHeader ? '^' : '|'
    const body = cells.map((cell, idx) => dokuCell(convert(cell), aligns[idx] ?? null)).join(sep)
    return `${sep}${body}${sep}`
  }
  const out = [render(splitRow(headerRow), true)]
  for (const row of bodyRows) out.push(render(splitRow(row), false))
  return out.join('\n')
}

function renderList(
  block: Block,
  options: Options,
  footnotes: Map<string, string>,
  warnings: ConversionWarning[],
  tagSet: Set<string>,
  segments: CodeSegment[],
): string {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet)
  const out: string[] = []
  let pendingLevel = 0
  for (const raw of block.lines) {
    // Riga vuota all'interno della sequenza (es. prima di un blocco di codice).
    if (raw.trim() === '') {
      out.push('')
      continue
    }
    // Riga placeholder: contiene un blocco di codice estratto da una lista.
    const ph = isSegmentPlaceholder(raw)
    if (ph !== null) {
      const segment = segments[ph]
      const open = segment.lang ? `<code ${segment.lang}>` : '<code>'
      const codeBlock = `${open}\n${segment.content}\n</code>`
      if (options.codeInLists === 'break') {
        warnings.push({
          line: block.line,
          kind: 'degraded',
          message: 'Blocco di codice dentro una lista: emesso a colonna 0, la lista ripartirà da 1 in DokuWiki.',
        })
        out.push(codeBlock)
      } else if (options.codeInLists === 'wrap') {
        const cls = segment.lang ? `code ${segment.lang}` : 'code'
        out.push(`<WRAP ${cls}>\n${segment.content}\n</WRAP>`)
      } else {
        // `indent`: 2 spazi per livello, così il blocco resta dentro la voce.
        const indent = '  '.repeat(Math.max(0, pendingLevel))
        const indented = codeBlock
          .split('\n')
          .map((l) => (l === '' ? l : indent + l))
          .join('\n')
        out.push(indented)
      }
      continue
    }
    const m = LIST_RE.exec(raw)
    if (!m) {
      out.push(`  ${convertInline(raw.trim(), rules)}`)
      continue
    }
    const indent = m[1].replace(/\t/g, '  ').length
    const level = Math.floor(indent / 2) + 1
    pendingLevel = level
    const ordered = /\d/.test(m[2])
    const marker = ordered ? '-' : '*'
    let content = m[3]
    const task = /^\[([ xX])\]\s+(.*)$/.exec(content)
    if (task && options.convertTasks) {
      content = `${task[1].toLowerCase() === 'x' ? '☑' : '☐'} ${task[2]}`
    }
    out.push(cleanLine(`${'  '.repeat(level)}${marker} ${convertInline(content, rules)}`))
  }
  return out.join('\n')
}

// `> [!note]`, `> [!note]+` (espanso), `> [!note]-` (pieghevole).
const CALLOUT_RE = /^\[!([\w-]+)\]([+-])?(?:\s+(.*))?$/

const CALLOUT_LABEL: Record<string, string> = {
  note: 'Nota',
  info: 'Info',
  tip: 'Suggerimento',
  hint: 'Suggerimento',
  warning: 'Attenzione',
  caution: 'Attenzione',
  danger: 'Pericolo',
  error: 'Errore',
  important: 'Importante',
  success: 'Fatto',
  question: 'Domanda',
  example: 'Esempio',
  quote: 'Citazione',
}

/** Tag del plugin `note` corrispondente a un tipo callout Obsidian. */
const NOTE_PLUGIN_TAG: Record<string, string> = {
  note: 'note',
  info: 'note',
  tip: 'tip',
  hint: 'tip',
  success: 'tip',
  warning: 'warning',
  caution: 'warning',
  danger: 'important',
  error: 'important',
  important: 'important',
}

/** Classi del plugin `wrap` corrispondente a un tipo callout Obsidian. */
const WRAP_CLASS: Record<string, string> = {
  note: 'note',
  info: 'info',
  tip: 'tip',
  hint: 'tip',
  success: 'tip',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
  error: 'danger',
  important: 'important',
}

function renderCallout(
  type: string,
  title: string,
  body: string[],
  options: Options,
  footnotes: Map<string, string>,
  warnings: ConversionWarning[],
  line: number,
  tagSet: Set<string>,
): string {
  const key = type.toLowerCase()
  const rules = buildInlineRules(options, footnotes, warnings, line, tagSet)
  const renderBody = (): string => body.map((l) => (l.trim() === '' ? '' : convertInline(l, rules))).join('\n')
  const label = title.trim() || CALLOUT_LABEL[key] || type

  switch (options.calloutStyle) {
    case 'wrap': {
      const cls = WRAP_CLASS[key] ?? 'note'
      return `<WRAP ${cls} ${label}>\n${renderBody()}\n</WRAP>`
    }
    case 'note': {
      const tag = NOTE_PLUGIN_TAG[key] ?? 'note'
      return `<${tag} ${label}>\n${renderBody()}\n</${tag}>`
    }
    case 'html':
    default: {
      // Fallback senza plugin: citazione con etichetta in grassetto.
      warnings.push({
        line,
        kind: 'degraded',
        message: `Callout "${key}" reso come citazione: nessun plugin callout installato.`,
      })
      const head = `> **${label}**`
      const rest = body.map((l) => (l.trim() === '' ? '>' : `> ${convertInline(l, rules)}`)).join('\n')
      return rest ? `${head}\n${rest}` : head
    }
  }
}

function renderQuote(
  block: Block,
  options: Options,
  footnotes: Map<string, string>,
  warnings: ConversionWarning[],
  tagSet: Set<string>,
): string {
  const inner = block.lines.map((l) => QUOTE_RE.exec(l)?.[1] ?? l)
  const callout = CALLOUT_RE.exec(inner[0].trim())
  if (callout) {
    const fold = callout[2]
    if (fold) {
      warnings.push({
        line: block.line,
        kind: 'degraded',
        message: `Callout pieghevole (\`[!${callout[1]}]${fold}\`): DokuWiki non supporta il collasso, reso come callout normale.`,
      })
    }
    // Un callout annidato (righe `>>`) degrada: lo segnaliamo e lo lasciamo
    // come citazione interna.
    const nested = inner.slice(1).some((l) => /^\s*>/.test(l))
    if (nested) {
      warnings.push({
        line: block.line,
        kind: 'degraded',
        message: 'Callout annidato: reso come citazione interna al callout.',
      })
    }
    return renderCallout(callout[1], callout[3] ?? '', inner.slice(1), options, footnotes, warnings, block.line, tagSet)
  }
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet)
  return inner.map((l) => (l.trim() === '' ? '>' : cleanLine(`> ${convertInline(l, rules)}`))).join('\n')
}

function renderParagraph(
  block: Block,
  options: Options,
  footnotes: Map<string, string>,
  warnings: ConversionWarning[],
  tagSet: Set<string>,
): string {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet)
  const converted = block.lines.map((l) => {
    const cleaned = cleanLine(l)
    // Un `\` finale in Markdown è un'interruzione di riga forzata: la
    // normalizziamo a `\\` per non duplicarla (round-trip stabile).
    return cleaned.endsWith('\\') ? cleaned.slice(0, -1).replace(/[ \t]+$/, '') : cleaned
  }).map((l) => convertInline(l, rules))
  // DokuWiki fonde le righe consecutive di un paragrafo: per conservare gli a
  // capo singoli di Obsidian si forza `\\` a fine di ogni riga tranne l'ultima.
  if (options.preserveLineBreaks && converted.length > 1) {
    return converted.map((l, idx) => (idx < converted.length - 1 ? `${l} \\\\` : l)).join('\n')
  }
  return converted.join('\n')
}

// ---------------------------------------------------------------------------
// Avvisi per HTML non supportato
// ---------------------------------------------------------------------------

function scanUnsupportedHtml(blocks: Block[], warnings: ConversionWarning[]): void {
  const tagRe = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g
  for (const block of blocks) {
    if (block.type === 'code') continue
    for (let i = 0; i < block.lines.length; i += 1) {
      const line = block.lines[i]
      let m: RegExpExecArray | null
      tagRe.lastIndex = 0
      while ((m = tagRe.exec(line)) !== null) {
        if (!KNOWN_HTML.has(m[1].toLowerCase())) {
          warnings.push({
            line: block.line + i,
            kind: 'unsupported',
            message: `Tag HTML <${m[1]}> senza equivalente DokuWiki: lasciato invariato.`,
          })
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pulizia pre-conversione
// ---------------------------------------------------------------------------

/**
 * Rimuove le sezioni "Related"/backlink tipiche dei vault Obsidian e le righe
 * vuote multiple / spazi finali. Lavora fuori dai blocchi di codice.
 */
function preCleanup(lines: string[], options: Options): string[] {
  let out = lines
  if (options.cleanupRelated) {
    const filtered: string[] = []
    let skipping = false
    for (const line of lines) {
      if (/^\s*(#{1,6}\s*)?(related|correlati|backlinks?|link correlati)\s*:?\s*$/i.test(line)) {
        skipping = true
        continue
      }
      // Una sezione termina al prossimo heading.
      if (skipping && /^#{1,6}\s+\S/.test(line)) skipping = false
      if (!skipping) filtered.push(line)
    }
    out = filtered
  }
  if (options.cleanupWhitespace) {
    const cleaned: string[] = []
    let blanks = 0
    let inFence = false
    for (const line of out) {
      if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence
      if (inFence) {
        cleaned.push(line)
        continue
      }
      const trimmed = line.replace(/[ \t]+$/, '')
      if (trimmed === '') {
        blanks += 1
        if (blanks > 1) continue
      } else {
        blanks = 0
      }
      cleaned.push(trimmed)
    }
    out = cleaned
  }
  return out
}

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

export function mdToDoku(
  input: string,
  options: Partial<Options> = {},
  context: ConversionContext = {},
): ConversionResult {
  const opts: Options = { ...DEFAULT_OPTIONS, ...options }
  const warnings: ConversionWarning[] = []

  const normalized = input.replace(/\r\n?/g, '\n')
  const rawLines = preCleanup(normalized.split('\n'), opts)
  const { defs: footnotes, body: withoutDefs } = extractFootnotes(rawLines)

  const frontmatterComments: string[] = []
  const bodyLines = handleFrontmatter(withoutDefs, opts, frontmatterComments, warnings)

  const tagSet = new Set<string>()
  const segments: CodeSegment[] = []
  const blocks = collectBlocks(bodyLines, segments, warnings)
  scanUnsupportedHtml(blocks, warnings)

  const outBlocks: string[] = []

  // H1 dal nome file quando il documento non ha già un titolo.
  if (opts.h1FromFileName && context.fileName) {
    const hasH1 = blocks.some(
      (b) => b.type === 'heading' && HEADING_RE.exec(b.lines[0])?.[1].length === 1,
    )
    if (!hasH1) {
      const title = context.fileName.replace(/\.[^.]+$/, '')
      outBlocks.push(`====== ${title} ======`)
      warnings.push({
        line: 1,
        kind: 'info',
        message: `H1 aggiunto dal nome file "${title}".`,
      })
    }
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'code':
        outBlocks.push(renderCode(segments[block.segmentIndex ?? 0], block.line, warnings))
        break
      case 'heading':
        outBlocks.push(renderHeading(block.lines[0], block.line, warnings))
        break
      case 'hr':
        outBlocks.push('----')
        break
      case 'table':
        outBlocks.push(renderTable(block, opts, footnotes, warnings, tagSet))
        break
      case 'list':
        outBlocks.push(renderList(block, opts, footnotes, warnings, tagSet, segments))
        break
      case 'quote':
        outBlocks.push(renderQuote(block, opts, footnotes, warnings, tagSet))
        break
      case 'paragraph':
      default:
        outBlocks.push(renderParagraph(block, opts, footnotes, warnings, tagSet))
        break
    }
  }

  if (frontmatterComments.length > 0) outBlocks.unshift(frontmatterComments.join('\n'))

  if (tagSet.size > 0) {
    outBlocks.push(`{{tag>${[...tagSet].join(' ')}}}`)
    warnings.push({
      line: rawLines.length,
      kind: 'info',
      message: 'Tag Obsidian convertiti in `{{tag>...}}`: richiede il plugin tag di DokuWiki.',
    })
  }

  // NB: niente `trim()` a sinistra: rimuoverebbe l'indentazione della prima
  // riga quando il documento inizia con una lista.
  const joined = outBlocks.join('\n\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
  const output = joined ? `${joined}\n` : ''
  warnings.sort((a, b) => a.line - b.line)
  return { output, warnings }
}
