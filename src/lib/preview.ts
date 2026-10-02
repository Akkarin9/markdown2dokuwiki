/**
 * Rendering di anteprima (non fedele al 100%, serve solo a "vedere" il risultato).
 * Markdown usa markdown-it; DokuWiki un renderer semplificato che copre i
 * costrutti supportati dal convertitore.
 */

import MarkdownIt from 'markdown-it'

// `html: false`: il contenuto incollato non deve poter iniettare markup attivo.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

/** Escape HTML per il ramo DokuWiki (che non ha sanitizzazione). */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Inline DokuWiki -> HTML. */
function dokuInline(text: string): string {
  let out = esc(text)
  // Protegge i letterali, poi applica la formattazione.
  out = out.replace(/''([^']+?)''/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\/\/([^/\n]+?)\/\//g, '<em>$1</em>')
  out = out.replace(/__([^_]+?)__/g, '<u>$1</u>')
  out = out.replace(/&lt;del&gt;(.*?)&lt;\/del&gt;/g, '<del>$1</del>')
  out = out.replace(/&lt;fc[^&]*?&gt;(.*?)&lt;\/fc&gt;/g, '<mark>$1</mark>')
  out = out.replace(/\[\[([^\]|]+?)\|([^\]]+?)\]\]/g, '<a href="#">$2</a>')
  out = out.replace(/\[\[([^\]]+?)\]\]/g, '<a href="#">$1</a>')
  out = out.replace(/\{\{([^{}|?]+?)(?:\?[^}|]+)?(?:\|([^}]+))?\}\}/g, '<img alt="$2" src="#" class="doku-media" />')
  out = out.replace(/\(\(([^)]+?)\)\)/g, '<sup class="doku-footnote">[$1]</sup>')
  out = out.replace(/~~[A-Z]+~~/g, '')
  return out
}

const D_CODE_OPEN = /^\s*<(code|file)\b([^>]*)>/i
const D_CODE_CLOSE = /^\s*<\/(code|file)>\s*$/i
const D_HEADING = /^(\s*)(={2,6})\s+(.*?)\s*=*\s*$/
const D_HR = /^\s*-{4,}\s*$/
const D_LIST = /^(\s*)([*-])\s+(.*)$/
const D_TABLE = /^\s*[|^]/
const D_QUOTE = /^\s*(>+)\s?(.*)$/

/** Converte DokuWiki in HTML approssimando la resa reale. */
export function renderDoku(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const parts: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }

    const codeOpen = D_CODE_OPEN.exec(line)
    if (codeOpen) {
      const lang = (codeOpen[2].trim().split(/\s+/)[0] ?? '').replace(/^-$/, '')
      const body: string[] = []
      i += 1
      while (i < lines.length && !D_CODE_CLOSE.test(lines[i])) {
        body.push(esc(lines[i]))
        i += 1
      }
      i += 1
      parts.push(`<pre class="doku-code">${lang ? `<span class="doku-lang">${esc(lang)}</span>` : ''}${body.join('\n')}</pre>`)
      continue
    }

    const heading = D_HEADING.exec(line)
    if (heading) {
      const level = Math.min(5, Math.max(1, 7 - heading[2].length))
      parts.push(`<h${level}>${dokuInline(heading[3])}</h${level}>`)
      i += 1
      continue
    }

    if (D_HR.test(line)) {
      parts.push('<hr />')
      i += 1
      continue
    }

    if (D_TABLE.test(line) && line.trim() !== '') {
      const rows: string[] = []
      while (i < lines.length && D_TABLE.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(lines[i])
        i += 1
      }
      parts.push(renderDokuTable(rows))
      continue
    }

    if (D_LIST.test(line)) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        const m = D_LIST.exec(lines[i])
        if (!m) break
        const depth = Math.max(0, Math.floor(m[1].replace(/\t/g, '  ').length / 2) - 1)
        const cls = m[2] === '-' ? 'doku-ol' : 'doku-ul'
        items.push(`<li class="doku-li" style="margin-left:${depth * 18}px">${dokuInline(m[3])}</li><span data-kind="${cls}"></span>`)
        i += 1
      }
      parts.push(`<ul class="doku-list">${items.join('')}</ul>`)
      continue
    }

    const quote = D_QUOTE.exec(line)
    if (quote) {
      const body: string[] = []
      while (i < lines.length && D_QUOTE.test(lines[i])) {
        const m = D_QUOTE.exec(lines[i])!
        body.push(dokuInline(m[2]))
        i += 1
      }
      parts.push(`<blockquote>${body.join('<br />')}</blockquote>`)
      continue
    }

    // Paragrafo.
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !D_CODE_OPEN.test(lines[i]) &&
      !D_HEADING.test(lines[i]) &&
      !D_HR.test(lines[i]) &&
      !D_LIST.test(lines[i]) &&
      !D_TABLE.test(lines[i]) &&
      !D_QUOTE.test(lines[i])
    ) {
      para.push(dokuInline(lines[i]))
      i += 1
    }
    parts.push(`<p>${para.join('<br />')}</p>`)
  }

  return parts.join('\n')
}

function renderDokuTable(rows: string[]): string {
  const parse = (row: string): { header: boolean; cells: string[] } => {
    const header = row.trim().startsWith('^')
    const body = row.trim().replace(/^[|^]/, '').replace(/[|^]\s*$/, '')
    return { header, cells: body.split(/[|^]/).map((c) => c.trim()) }
  }
  const out: string[] = ['<table class="doku-table">']
  for (const row of rows) {
    const { header, cells } = parse(row)
    const tag = header ? 'th' : 'td'
    out.push(`<tr>${cells.map((c) => `<${tag}>${dokuInline(c)}</${tag}>`).join('')}</tr>`)
  }
  out.push('</table>')
  return out.join('')
}

/** Anteprima Markdown (Obsidian) in HTML. */
export function renderMarkdown(source: string): string {
  return md.render(source)
}
