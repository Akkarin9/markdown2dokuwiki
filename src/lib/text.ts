/** Righe e caratteri di un testo. */
export function countText(text: string): { lines: number; chars: number } {
  if (text === '') return { lines: 0, chars: 0 }
  return { lines: text.split('\n').length, chars: text.length }
}

/** Slug per il nome del file scaricato. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Deriva un nome file sensato dal contenuto: prima scelta il `title` del
 * frontmatter, poi il primo heading, infine un fallback.
 */
export function deriveFileName(source: string, direction: 'md-to-doku' | 'doku-to-md'): string {
  const ext = direction === 'md-to-doku' ? 'txt' : 'md'

  const frontmatterTitle = /^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$[\s\S]*?^---\s*$/m.exec(source)
  if (frontmatterTitle) {
    const slug = slugify(frontmatterTitle[1].replace(/^["']|["']$/g, ''))
    if (slug) return `${slug}.${ext}`
  }

  // Heading Markdown (`# X`) oppure DokuWiki (`====== X ======`).
  const heading =
    /^#{1,6}\s+(.+?)\s*$/m.exec(source) ?? /^\s*={2,6}\s+(.+?)\s*=+\s*$/m.exec(source)
  if (heading) {
    const slug = slugify(heading[1])
    if (slug) return `${slug}.${ext}`
  }

  return direction === 'md-to-doku' ? 'converted.txt' : 'converted.md'
}
