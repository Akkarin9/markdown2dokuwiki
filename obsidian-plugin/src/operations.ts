/**
 * Operazioni di conversione usate dai comandi del plugin.
 *
 * Funzioni isolate dall'istanza del plugin dove possibile, così restano facili
 * da testare e riusare.
 */

import { Notice, TFile, type App } from 'obsidian'
import { dokuToMd, mdToDoku, normalizePageName, type Options } from './engine'
import type { Md2DokuSettings } from './settings'

/** Estrae solo le opzioni del motore dalle impostazioni del plugin. */
export function engineOptions(settings: Md2DokuSettings): Options {
  return {
    linkNamespace: settings.linkNamespace,
    mediaNamespace: settings.mediaNamespace,
    calloutStyle: settings.calloutStyle,
    frontmatter: settings.frontmatter,
    tags: settings.tags,
    removeObsidianComments: settings.removeObsidianComments,
    convertHighlight: settings.convertHighlight,
    highlightStyle: settings.highlightStyle,
    convertTasks: settings.convertTasks,
    internalLinks: settings.internalLinks,
    preserveFolders: settings.preserveFolders,
    preserveLineBreaks: settings.preserveLineBreaks,
    codeInLists: settings.codeInLists,
    includeTransclusion: settings.includeTransclusion,
    cleanupRelated: settings.cleanupRelated,
    cleanupWhitespace: settings.cleanupWhitespace,
    h1FromFileName: settings.h1FromFileName,
  }
}

export interface ConversionOutcome {
  output: string
  warnings: number
}

/** Converte una nota Markdown in DokuWiki. */
export function convertMarkdownToDoku(markdown: string, settings: Md2DokuSettings, fileName?: string): ConversionOutcome {
  const result = mdToDoku(markdown, engineOptions(settings), fileName ? { fileName } : {})
  return { output: result.output, warnings: result.warnings.length }
}

/** Converte un documento DokuWiki in Markdown. */
export function convertDokuToMarkdown(doku: string, settings: Md2DokuSettings): ConversionOutcome {
  const result = dokuToMd(doku, engineOptions(settings))
  return { output: result.output, warnings: result.warnings.length }
}

/** Copia negli appunti con un avviso non invasivo. */
export async function copyToClipboard(text: string, message = 'Copiato negli appunti'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    new Notice(message)
  } catch {
    new Notice('Copia non riuscita')
  }
}

/** Percorso del file DokuWiki di output accanto alla nota originale. */
export function dokuSiblingPath(notePath: string, extension: string): string {
  const base = notePath.replace(/\.[^./\\]+$/, '')
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return `${base}${ext}`
}

/** Scrive il file di output, creando le cartelle necessarie. */
export async function writeSibling(app: App, notePath: string, output: string, extension: string): Promise<TFile> {
  const target = dokuSiblingPath(notePath, extension)
  await ensureParentFolder(app, target)
  const existing = app.vault.getAbstractFileByPath(target)
  if (existing instanceof TFile) {
    await app.vault.modify(existing, output)
    return existing
  }
  return app.vault.create(target, output)
}

/** Crea una nuova nota Markdown dall'import di DokuWiki. */
export async function createMarkdownNote(app: App, markdown: string, pageName: string): Promise<TFile> {
  const base = `import-${normalizePageName(pageName) || 'dokuwiki'}`
  let path = `${base}.md`
  let counter = 1
  while (app.vault.getAbstractFileByPath(path)) {
    path = `${base}-${counter}.md`
    counter += 1
  }
  return app.vault.create(path, markdown)
}

async function ensureParentFolder(app: App, path: string): Promise<void> {
  const parts = path.split('/')
  parts.pop()
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current)
    }
  }
}
