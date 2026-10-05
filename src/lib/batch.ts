/**
 * Conversione batch di più file, con:
 * - struttura di output `namespace/pagina.txt` (nomi normalizzati per DokuWiki);
 * - risoluzione dei wikilink tra note dello stesso batch (`ns:pagina`);
 * - elenco dei link irrisolti;
 * - inclusione degli allegati in `media/` e riscrittura dei riferimenti;
 * - generazione di `LEGGIMI.txt` + report.
 *
 * Tutto in memoria, nel browser. Le funzioni di costruzione del piano sono pure
 * e testabili senza `fflate`.
 */

import { zipSync, strToU8, type Zippable } from 'fflate'
import { mdToDoku } from '../converters/mdToDoku'
import { dokuToMd } from '../converters/dokuToMd'
import {
  joinNamespace,
  normalizePageName,
  type ConversionResult,
  type Direction,
  type Options,
} from '../converters/types'

export interface BatchFile {
  name: string
  content: string
}

/** Allegato binario (immagine, PDF, ...) caricato insieme ai file. */
export interface BatchAttachment {
  name: string
  data: Uint8Array
}

export interface BatchItem {
  name: string
  /** Percorso di output nello ZIP (es. `guide/pagina.txt`). */
  outputPath: string
  result: ConversionResult
  /** Link verso note non presenti nel batch. */
  unresolved: string[]
}

export interface BatchReport {
  items: BatchItem[]
  /** Allegati inclusi nello ZIP. */
  attachments: string[]
  /** Allegati referenziati ma non caricati. */
  missingAttachments: string[]
}

/** Nome file DokuWiki normalizzato (senza estensione), dai filename del batch. */
export function pageNameFromFile(name: string): string {
  return normalizePageName(name.replace(/\.[^.]+$/, '').replace(/[/\\]/g, ':'))
}

/** Percorso di output per un file del batch. */
export function outputPathFor(name: string, direction: Direction, namespace: string): string {
  const page = pageNameFromFile(name) || 'documento'
  const ext = direction === 'md-to-doku' ? 'txt' : 'md'
  const fileName = `${page}.${ext}`
  return namespace ? `${namespace.replace(/:+$/, '')}/${fileName}` : fileName
}

/** Estensioni considerate allegati (media) nel batch. */
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|ogv|mov|ogg|mp3|wav|flac|m4a|pdf)$/i

/** Trova i riferimenti ad allegati in un contenuto Markdown. */
export function findAttachments(content: string): string[] {
  const out = new Set<string>()
  const re = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const target = (m[1] ?? m[2] ?? '').trim()
    if (!target || /^https?:/i.test(target)) continue
    if (MEDIA_EXT_RE.test(target)) out.add(target)
  }
  return [...out]
}

/** Nome normalizzato di un allegato come deve apparire in DokuWiki. */
export function mediaName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name
  return normalizePageName(base).replace(/^_+/, '') || base
}

interface PlanOptions {
  namespace: string
  mediaNamespace: string
}

/** Riscrive i riferimenti agli allegati presenti nel batch verso il namespace media. */
function rewriteAttachmentRefs(
  content: string,
  available: Map<string, string>,
  mediaNs: string,
): string {
  return content.replace(
    /!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]|!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (full, wikiTarget: string | undefined, wikiAlias: string | undefined, mdAlt, mdSrc: string | undefined) => {
      const target = (wikiTarget ?? mdSrc ?? '').trim()
      if (!target || /^https?:/i.test(target)) return full
      const norm = available.get(normalizePageName(target.split('/').pop() ?? target))
      if (!norm) return full
      const nsTarget = joinNamespace(mediaNs, norm)
      if (wikiTarget !== undefined) {
        return wikiAlias ? `![[${nsTarget}|${wikiAlias}]]` : `![[${nsTarget}]]`
      }
      return `![${mdAlt ?? ''}](${nsTarget})`
    },
  )
}

/** Costruisce il piano completo (senza ZIP), utile anche per l'anteprima e i test. */
export function buildBatchPlan(
  files: BatchFile[],
  direction: Direction,
  options: Options,
  attachments: BatchAttachment[] = [],
  planOptions: PlanOptions = { namespace: '', mediaNamespace: '' },
): BatchReport {
  const items: BatchItem[] = []
  const used = new Map<string, number>()

  // Nomi pagina presenti nel batch (per la risoluzione dei link interni).
  const knownPages = new Set(files.map((f) => pageNameFromFile(f.name)))
  const availableAttachments = new Map(
    attachments.map((a) => [normalizePageName(a.name.split(/[/\\]/).pop() ?? a.name), mediaName(a.name)]),
  )

  for (const file of files) {
    let content = file.content
    const referenced = direction === 'md-to-doku' ? findAttachments(content) : []
    // Riscrive i riferimenti agli allegati già presenti nel batch.
    if (referenced.length > 0) {
      content = rewriteAttachmentRefs(content, availableAttachments, planOptions.mediaNamespace)
    }

    const result =
      direction === 'md-to-doku'
        ? mdToDoku(content, options, { fileName: file.name })
        : dokuToMd(content, options)

    // Link interni verso note assenti dal batch.
    const unresolved: string[] = []
    if (direction === 'md-to-doku') {
      const re = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(file.content)) !== null) {
        const raw = m[1].trim()
        if (MEDIA_EXT_RE.test(raw)) continue
        const page = normalizePageName(raw.split('/').pop() ?? raw)
        if (!knownPages.has(page)) unresolved.push(raw)
      }
    }

    let target = outputPathFor(file.name, direction, planOptions.namespace)
    const seen = used.get(target) ?? 0
    used.set(target, seen + 1)
    if (seen > 0) {
      const dot = target.lastIndexOf('.')
      target = `${target.slice(0, dot)}-${seen}${target.slice(dot)}`
    }

    items.push({ name: file.name, outputPath: target, result, unresolved })
  }

  const allReferenced = direction === 'md-to-doku' ? files.flatMap((f) => findAttachments(f.content)) : []
  const missingAttachments = [
    ...new Set(
      allReferenced.filter((r) => !availableAttachments.has(normalizePageName(r.split('/').pop() ?? r))),
    ),
  ]

  return {
    items,
    attachments: attachments.map((a) => mediaName(a.name)),
    missingAttachments,
  }
}

/** Riepilogo testuale da includere come `LEGGIMI.txt`. */
export function renderReadme(report: BatchReport, direction: Direction, namespace: string): string {
  const lines: string[] = []
  lines.push(direction === 'md-to-doku' ? 'LEGGIMI — conversione da caricare su DokuWiki' : 'LEGGIMI — conversione verso Markdown')
  lines.push('='.repeat(50))
  lines.push('')
  if (namespace) lines.push(`Namespace di destinazione: ${namespace}`)
  lines.push(`File convertiti: ${report.items.length}`)
  lines.push('')

  lines.push('File:')
  for (const item of report.items) {
    lines.push(`  - ${item.outputPath}  (da ${item.name})`)
  }
  lines.push('')

  const withWarnings = report.items.filter((i) => i.result.warnings.length > 0)
  if (withWarnings.length > 0) {
    lines.push('Avvisi:')
    for (const item of withWarnings) {
      for (const w of item.result.warnings) {
        lines.push(`  - ${item.name} · riga ${w.line} [${w.kind}] ${w.message}`)
      }
    }
    lines.push('')
  }

  const unresolved = report.items.flatMap((i) => i.unresolved.map((u) => `${i.name} → ${u}`))
  if (unresolved.length > 0) {
    lines.push('Link verso note non incluse nel batch:')
    for (const u of unresolved) lines.push(`  - ${u}`)
    lines.push('')
  }

  if (report.attachments.length > 0) {
    lines.push('Allegati inclusi (cartella media/):')
    for (const a of report.attachments) lines.push(`  - media/${a}`)
    lines.push('')
  }
  if (report.missingAttachments.length > 0) {
    lines.push('Allegati referenziati ma NON caricati:')
    for (const a of report.missingAttachments) lines.push(`  - ${a}`)
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

/** Costruisce lo ZIP dal piano. */
export function zipFromPlan(report: BatchReport, readme: string, attachments: BatchAttachment[] = []): Blob {
  const zipData: Zippable = {}
  for (const item of report.items) {
    zipData[item.outputPath] = strToU8(item.result.output)
  }
  for (const attachment of attachments) {
    zipData[`media/${mediaName(attachment.name)}`] = attachment.data
  }
  zipData['LEGGIMI.txt'] = strToU8(readme)

  const notes = report.items
    .flatMap((item) => item.result.warnings.map((w) => `${item.name} · riga ${w.line} [${w.kind}] ${w.message}`))
    .join('\n')
  if (notes) zipData['NOTE-DI-CONVERSIONE.txt'] = strToU8(notes + '\n')

  return new Blob([zipSync(zipData) as unknown as BlobPart], { type: 'application/zip' })
}

/**
 * Converte più file e restituisce un Blob ZIP.
 * Deduplica i nomi per non sovrascrivere documenti omonimi.
 */
export function convertBatchToZip(
  files: Array<{ name: string; content: string }>,
  direction: Direction,
  options: Options,
  extra: { attachments?: BatchAttachment[]; namespace?: string; mediaNamespace?: string } = {},
): { blob: Blob; items: BatchItem[]; report: BatchReport } {
  const namespace = extra.namespace ?? options.linkNamespace
  const mediaNamespace = extra.mediaNamespace ?? options.mediaNamespace
  const report = buildBatchPlan(files, direction, options, extra.attachments ?? [], {
    namespace,
    mediaNamespace,
  })
  const readme = renderReadme(report, direction, namespace)
  const blob = zipFromPlan(report, readme, extra.attachments ?? [])
  return { blob, items: report.items, report }
}
