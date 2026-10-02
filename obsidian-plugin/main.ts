/**
 * Plugin Obsidian "Markdown ⇄ DokuWiki".
 *
 * Riusa il motore della webapp (`../../src`) bundlato da esbuild. Offre:
 *  - conversione della nota corrente / della selezione in DokuWiki;
 *  - import di un documento DokuWiki incollato → nuova nota Markdown;
 *  - esportazione di una cartella intera in `namespace/pagina.txt`;
 *  - pannello impostazioni con le stesse opzioni della webapp.
 */

import { Notice, Plugin, TFile, TFolder, type Editor } from 'obsidian'
import { DEFAULT_SETTINGS, Md2DokuSettingTab, type Md2DokuSettings } from './src/settings'
import {
  convertDokuToMarkdown,
  convertMarkdownToDoku,
  copyToClipboard,
  createMarkdownNote,
  writeSibling,
} from './src/operations'
import { ImportDokuModal } from './src/import-modal'
import { exportFolder } from './src/export-folder'

export default class Md2DokuPlugin extends Plugin {
  settings: Md2DokuSettings = DEFAULT_SETTINGS
  private openViews = new Set<{ refresh: () => void }>()

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new Md2DokuSettingTab(this.app, this))

    // ------------------------------------------------ Nota corrente → DokuWiki
    this.addCommand({
      id: 'convert-note-to-doku',
      name: 'Converti la nota corrente in DokuWiki',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== 'md') return false
        if (!checking) void this.convertActiveFile(file)
        return true
      },
    })

    // ------------------------------------------------ Selezione → DokuWiki
    this.addCommand({
      id: 'convert-selection-to-doku',
      name: 'Converti la selezione in DokuWiki',
      editorCallback: (editor) => void this.convertSelection(editor),
    })

    // ------------------------------------------------ Import DokuWiki
    this.addCommand({
      id: 'import-doku',
      name: 'Importa da DokuWiki (incolla un documento)',
      callback: () => new ImportDokuModal(this.app, this).open(),
    })

    // Converti la selezione DokuWiki → Markdown (utile in senso inverso).
    this.addCommand({
      id: 'convert-selection-from-doku',
      name: 'Converti la selezione da DokuWiki in Markdown',
      editorCallback: (editor) => void this.convertSelectionFromDoku(editor),
    })

    // ------------------------------------------------ Cartella → DokuWiki
    this.addCommand({
      id: 'export-folder-to-doku',
      name: 'Esporta la cartella corrente in DokuWiki',
      checkCallback: (checking) => {
        const folder = this.activeFolder()
        if (!folder) return false
        if (!checking) void this.runFolderExport(folder)
        return true
      },
    })
  }

  onunload(): void {
    this.openViews.clear()
  }

  // ------------------------------------------------------------------ settings

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<Md2DokuSettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  /** Usato dal pannello impostazioni per aggiornare le viste aperte. */
  refreshOpenViews(): void {
    for (const view of this.openViews) view.refresh()
  }

  /** Crea una nuova nota Markdown dal testo DokuWiki importato. */
  async createImportedNote(markdown: string, pageName: string): Promise<TFile> {
    const file = await createMarkdownNote(this.app, markdown, pageName)
    await this.app.workspace.getLeaf(false).openFile(file)
    new Notice(`Nota importata: ${file.path}`)
    return file
  }

  // ------------------------------------------------------------------ comandi

  private activeFolder(): TFolder | null {
    const file = this.app.workspace.getActiveFile()
    if (file?.parent instanceof TFolder) return file.parent
    return this.app.vault.getRoot()
  }

  private async convertActiveFile(file: TFile): Promise<void> {
    const markdown = await this.app.vault.read(file)
    const { output, warnings } = convertMarkdownToDoku(markdown, this.settings, file.name)

    const action = this.settings.outputAction
    if (action === 'clipboard' || action === 'both') {
      await copyToClipboard(output, warnings > 0 ? `Copiato (${warnings} avvisi)` : 'Copiato negli appunti')
    }
    if (action === 'file' || action === 'both') {
      const written = await writeSibling(this.app, file.path, output, this.settings.outputExtension)
      new Notice(`Scritto ${written.path}`)
    }
  }

  private async convertSelection(editor: Editor): Promise<void> {
    const selection = editor.getSelection()
    if (selection.trim() === '') {
      new Notice('Nessuna selezione')
      return
    }
    const { output, warnings } = convertMarkdownToDoku(selection, this.settings)
    editor.replaceSelection(output)
    new Notice(warnings > 0 ? `Convertito (${warnings} avvisi)` : 'Selezione convertita')
  }

  private async convertSelectionFromDoku(editor: Editor): Promise<void> {
    const selection = editor.getSelection()
    if (selection.trim() === '') {
      new Notice('Nessuna selezione')
      return
    }
    const { output, warnings } = convertDokuToMarkdown(selection, this.settings)
    editor.replaceSelection(output)
    new Notice(warnings > 0 ? `Importato (${warnings} avvisi)` : 'Selezione importata')
  }

  private async runFolderExport(folder: TFolder): Promise<void> {
    try {
      await exportFolder(this.app, folder, this.settings)
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Esportazione non riuscita')
    }
  }
}
