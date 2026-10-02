/**
 * Plugin Obsidian "Markdown ⇄ DokuWiki".
 *
 * Riusa il motore della webapp (`../src`) bundlato da esbuild. Offre:
 *  - conversione della nota corrente / della selezione in DokuWiki;
 *  - import di un documento DokuWiki incollato → nuova nota Markdown;
 *  - esportazione di una cartella intera in `namespace/pagina.txt`;
 *  - pannello laterale con i pulsanti dei comandi;
 *  - pannello impostazioni con le stesse opzioni della webapp.
 */

import { Notice, Plugin, TFile, TFolder, type Editor, type WorkspaceLeaf } from 'obsidian'
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
import { Md2DokuView, VIEW_TYPE_MD2DOKU } from './src/sidebar-view'

export default class Md2DokuPlugin extends Plugin {
  settings: Md2DokuSettings = DEFAULT_SETTINGS
  private openViews = new Set<{ refresh: () => void }>()

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new Md2DokuSettingTab(this.app, this))

    // ---------------------------------------------------------- Vista laterale
    this.registerView(VIEW_TYPE_MD2DOKU, (leaf: WorkspaceLeaf) => new Md2DokuView(leaf, this))
    this.addRibbonIcon('repeat', 'Markdown ⇄ DokuWiki', () => void this.activateView())
    this.addCommand({
      id: 'open-sidebar',
      name: 'Apri il pannello laterale',
      callback: () => void this.activateView(),
    })

    // Aggiorna il pannello quando cambia la nota attiva.
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.refreshOpenViews()),
    )

    // ------------------------------------------------ Nota corrente → DokuWiki
    this.addCommand({
      id: 'convert-note-to-doku',
      name: 'Converti la nota corrente in DokuWiki',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== 'md') return false
        if (!checking) void this.runConvertNote()
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
      callback: () => this.openImportModal(),
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
        if (!checking) void this.runFolderExport()
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

  registerOpenView(view: { refresh: () => void }): void {
    this.openViews.add(view)
  }

  unregisterOpenView(view: { refresh: () => void }): void {
    this.openViews.delete(view)
  }

  // ------------------------------------------------------------ API per la vista

  /** Apre (o rivela) la vista laterale nello spazio di destra. */
  async activateView(): Promise<void> {
    const { workspace } = this.app
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_MD2DOKU)[0]
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true)
      await leaf.setViewState({ type: VIEW_TYPE_MD2DOKU, active: true })
    }
    workspace.revealLeaf(leaf)
  }

  /** La nota markdown attiva, se c'è. */
  activeMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile()
    return file && file.extension === 'md' ? file : null
  }

  /** La cartella della nota attiva (o la radice). */
  activeFolder(): TFolder | null {
    const file = this.app.workspace.getActiveFile()
    if (file?.parent instanceof TFolder) return file.parent
    const root = this.app.vault.getRoot()
    return root instanceof TFolder ? root : null
  }

  /** Apre la scheda impostazioni del plugin. */
  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } })
      .setting
    setting?.open()
    setting?.openTabById(this.manifest.id)
  }

  /** Cambia ciclicamente la destinazione dell'output (appunti → file → entrambe). */
  async cycleOutputAction(): Promise<void> {
    const order = ['clipboard', 'file', 'both'] as const
    const idx = order.indexOf(this.settings.outputAction)
    this.settings.outputAction = order[(idx + 1) % order.length]
    await this.saveSettings()
    this.refreshOpenViews()
  }

  // ---------------------------------------------------- azioni (comandi + vista)

  /** Converte la nota Markdown attiva in DokuWiki. */
  async runConvertNote(): Promise<void> {
    const file = this.activeMarkdownFile()
    if (!file) {
      new Notice('Nessuna nota Markdown attiva')
      return
    }
    await this.convertActiveFile(file)
  }

  /** Converte la selezione nell'editor attivo (Markdown → DokuWiki). */
  async runConvertSelectionToDoku(): Promise<void> {
    const editor = this.activeEditor()
    if (!editor) return void new Notice('Nessun editor attivo')
    await this.convertSelection(editor)
  }

  /** Converte la selezione nell'editor attivo (DokuWiki → Markdown). */
  async runConvertSelectionFromDoku(): Promise<void> {
    const editor = this.activeEditor()
    if (!editor) return void new Notice('Nessun editor attivo')
    await this.convertSelectionFromDoku(editor)
  }

  /** Esporta in DokuWiki la cartella della nota attiva. */
  async runFolderExport(): Promise<void> {
    const folder = this.activeFolder()
    if (!folder) {
      new Notice('Nessuna cartella attiva')
      return
    }
    try {
      await exportFolder(this.app, folder, this.settings)
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Esportazione non riuscita')
    }
  }

  openImportModal(): void {
    new ImportDokuModal(this.app, this).open()
  }

  private activeEditor(): Editor | null {
    return this.app.workspace.activeEditor?.editor ?? null
  }

  /** Crea una nuova nota Markdown dal testo DokuWiki importato. */
  async createImportedNote(markdown: string, pageName: string): Promise<TFile> {
    const file = await createMarkdownNote(this.app, markdown, pageName)
    await this.app.workspace.getLeaf(false).openFile(file)
    new Notice(`Nota importata: ${file.path}`)
    return file
  }

  // ------------------------------------------------------------------ privati

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
}
