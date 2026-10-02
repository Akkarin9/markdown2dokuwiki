/**
 * Piccole utilità per lavorare con il vault di Obsidian in modo *asincrono e
 * sicuro* (crea le cartelle padre prima di scrivere, aggiorna se esistente).
 */

import { TFile, type App } from 'obsidian'

/** Crea la cartella (e le antenate) se non esiste. */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  if (!folderPath || app.vault.getAbstractFileByPath(folderPath)) return
  const parts = folderPath.split('/')
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current)
    }
  }
}

/** Scrive un file di testo, creando le cartelle necessarie e riusando l'esistente. */
export async function writeTextFile(app: App, path: string, content: string): Promise<TFile> {
  const dir = path.split('/').slice(0, -1).join('/')
  if (dir) await ensureFolder(app, dir)

  const existing = app.vault.getAbstractFileByPath(path)
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content)
    return existing
  }
  return app.vault.create(path, content)
}
