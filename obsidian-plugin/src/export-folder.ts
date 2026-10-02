/**
 * Esportazione di una cartella del vault in DokuWiki.
 *
 * Riusa `buildBatchPlan` del motore condiviso: nomi pagina normalizzati,
 * struttura `namespace/pagina.txt`, risoluzione dei wikilink tra note della
 * cartella e report. Gli allegati restano nel vault (i riferimenti sono
 * normalizzati dal motore).
 */

import { Notice, TFile, TFolder, type App } from 'obsidian'
import { buildBatchPlan, renderReadme } from '../../src/lib/batch'
import type { Md2DokuSettings } from './settings'
import { engineOptions } from './operations'
import { ensureFolder, writeTextFile } from './vault-utils'

export interface ExportResult {
  converted: number
  outputFolder: string
}

/** Esporta tutti i `.md` di una cartella (ricorsivamente) in `<cartella>/dokuwiki-out`. */
export async function exportFolder(app: App, folder: TFolder, settings: Md2DokuSettings): Promise<ExportResult> {
  const markdownFiles = collectMarkdown(folder)
  if (markdownFiles.length === 0) {
    throw new Error('Nessun file Markdown nella cartella')
  }

  const contents = await Promise.all(
    markdownFiles.map(async (file) => ({ name: file.name, content: await app.vault.read(file) })),
  )

  const report = buildBatchPlan(contents, 'md-to-doku', engineOptions(settings), [], {
    namespace: settings.linkNamespace,
    mediaNamespace: settings.mediaNamespace,
  })

  const outFolder = joinPath(folder.path === '/' ? '' : folder.path, 'dokuwiki-out')
  await ensureFolder(app, outFolder)

  for (const item of report.items) {
    // Il nome file è l'ultimo segmento del percorso di output; gli eventuali
    // namespace restano nei nomi pagina e nel report.
    const fileName = item.outputPath.split('/').pop() ?? item.outputPath
    await writeTextFile(app, joinPath(outFolder, fileName), item.result.output)
  }

  await writeTextFile(app, joinPath(outFolder, 'LEGGIMI.txt'), renderReadme(report, 'md-to-doku', settings.linkNamespace))

  const notes = report.items.reduce((sum, item) => sum + item.result.warnings.length, 0)
  new Notice(`Esportati ${report.items.length} file in ${outFolder}/ (${notes} avvisi)`)
  return { converted: report.items.length, outputFolder: outFolder }
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

/** Unisce due segmenti di percorso senza doppi slash. */
function joinPath(a: string, b: string): string {
  return a ? `${a.replace(/\/+$/, '')}/${b}` : b
}
