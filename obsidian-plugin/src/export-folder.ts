/**
 * Esportazione di una cartella del vault in DokuWiki.
 *
 * Riusa `buildBatchPlan` del motore condiviso: nomi pagina normalizzati,
 * struttura `namespace/pagina.txt` (riprodotta come sottocartelle reali),
 * risoluzione dei wikilink tra note della cartella e report. Gli allegati
 * referenziati (`![[img.png]]` o `![](img.png)`) vengono copiati in `media/`.
 */

import { Notice, TFile, TFolder, type App } from 'obsidian'
import {
  buildBatchPlan,
  findAttachments,
  mediaName,
  renderReadme,
  type BatchAttachment,
} from '../../src/lib/batch'
import type { Md2DokuSettings } from './settings'
import { engineOptions } from './operations'
import { ensureFolder, writeBinaryFile, writeTextFile } from './vault-utils'

export interface ExportResult {
  converted: number
  attachments: number
  outputFolder: string
}

/** Esporta tutti i `.md` di una cartella (ricorsivamente) in `<cartella>/dokuwiki-out`. */
export async function exportFolder(app: App, folder: TFolder, settings: Md2DokuSettings): Promise<ExportResult> {
  const markdownFiles = collectMarkdown(folder)
  if (markdownFiles.length === 0) {
    throw new Error('Nessun file Markdown nella cartella')
  }

  const contents = await Promise.all(markdownFiles.map((file) => app.vault.read(file)))
  const files = markdownFiles.map((file, index) => ({ name: file.name, content: contents[index] }))

  const attachments = await collectAttachments(app, markdownFiles, contents)

  const report = buildBatchPlan(files, 'md-to-doku', engineOptions(settings), attachments, {
    namespace: settings.linkNamespace,
    mediaNamespace: settings.mediaNamespace,
  })

  const outFolder = joinPath(folder.path === '/' ? '' : folder.path, 'dokuwiki-out')
  await ensureFolder(app, outFolder)

  // Un file per nota, nella sua sottocartella di namespace (`ns/pagina.txt`).
  for (const item of report.items) {
    await writeTextFile(app, joinPath(outFolder, item.outputPath), item.result.output)
  }

  // Gli allegati referenziati finiscono in `media/`.
  for (const attachment of attachments) {
    await writeBinaryFile(app, joinPath(joinPath(outFolder, 'media'), mediaName(attachment.name)), attachment.data)
  }

  await writeTextFile(app, joinPath(outFolder, 'LEGGIMI.txt'), renderReadme(report, 'md-to-doku', settings.linkNamespace))

  const warnings = report.items.reduce((sum, item) => sum + item.result.warnings.length, 0)
  new Notice(
    `Esportati ${report.items.length} file in ${outFolder}/` +
      (attachments.length > 0 ? ` (+${attachments.length} allegati)` : '') +
      (warnings > 0 ? ` — ${warnings} avvisi` : ''),
  )
  return { converted: report.items.length, attachments: attachments.length, outputFolder: outFolder }
}

/** Raccoglie ricorsivamente i file `.md` di una cartella. */
function collectMarkdown(folder: TFolder): TFile[] {
  const out: TFile[] = []
  for (const entry of folder.children) {
    if (entry instanceof TFolder) out.push(...collectMarkdown(entry))
    else if (entry instanceof TFile && entry.extension === 'md') out.push(entry)
  }
  return out
}

/** Carica dal vault gli allegati referenziati dalle note, risolvendo i wikilink. */
async function collectAttachments(app: App, files: TFile[], contents: string[]): Promise<BatchAttachment[]> {
  const out = new Map<string, BatchAttachment>()
  for (let i = 0; i < files.length; i += 1) {
    for (const reference of findAttachments(contents[i])) {
      if (out.has(reference)) continue
      const target = app.metadataCache.getFirstLinkpathDest(reference, files[i].path)
      if (!target) continue
      const data = new Uint8Array(await app.vault.readBinary(target))
      out.set(reference, { name: target.name, data })
    }
  }
  return [...out.values()]
}

/** Unisce due segmenti di percorso senza doppi slash. */
function joinPath(a: string, b: string): string {
  return a ? `${a.replace(/\/+$/, '')}/${b}` : b
}
