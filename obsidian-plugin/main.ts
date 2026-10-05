/**
 * Plugin Obsidian "Markdown ⇄ DokuWiki".
 *
 * Riusa il motore condiviso (`../src`) bundlato da esbuild. Offre:
 *  - conversione della nota corrente / della selezione in DokuWiki;
 *  - import di un documento DokuWiki incollato → nuova nota Markdown;
 *  - esportazione di una cartella intera in `namespace/pagina.txt` + `media/`;
 *  - pannello laterale con i pulsanti dei comandi;
 *  - menù contestuale dell'editor e barra di stato;
 *  - pannello impostazioni con opzioni, profili e rilevamento plugin.
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
import { WarningsModal } from './src/warnings-modal'
import { exportFolder } from './src/export-folder'
import { checkForUpdates } from './src/updater'
import { Md2DokuView, VIEW_TYPE_MD2DOKU } from './src/sidebar-view'
import { makeDefaultProfile } from '../src/lib/profiles'
import type { ConversionWarning } from './src/engine'

export default class Md2DokuPlugin extends Plugin {
  settings: Md2DokuSettings = DEFAULT_SETTINGS
  private openViews = new Set<{ refresh: () => void }>()
  private statusBarEl: HTMLElement | null = null

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

    // Aggiorna pannello e barra di stato quando cambia la nota attiva.
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.refreshOpenViews()
        this.updateStatusBar()
      }),
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

    // ------------------------------------------------------------ Aggiornamenti
    this.addCommand({
      id: 'check-updates',
      name: 'Cerca aggiornamenti del plugin',
      callback: () => void checkForUpdates(this.app, this),
    })

    // ------------------------------------------------- Menù contestuale editor
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        if (editor.getSelection().trim() === '') return
        menu.addItem((item) =>
          item
            .setTitle('Converti la selezione in DokuWiki')
            .setIcon('repeat')
            .onClick(() => void this.convertSelection(editor)),
        )
        menu.addItem((item) =>
          item
            .setTitle('Converti la selezione da DokuWiki in Markdown')
            .setIcon('repeat')
            .onClick(() => void this.convertSelectionFromDoku(editor)),
        )
      }),
    )

    // ------------------------------------------------------- Barra di stato
    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('md2doku-status')
    this.statusBarEl.addEventListener('click', () => void this.runConvertNote())
    this.updateStatusBar()

    // -------------------------- Aggiornamento automatico del file al salvataggio
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!this.settings.convertOnSave) return
        if (file instanceof TFile && file.extension === 'md') void this.autoUpdateSibling(file)
      }),
    )
  }

  onunload(): void {
    this.openViews.clear()
  }

  // ------------------------------------------------------------------ settings

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<Md2DokuSettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) }
    if (!Array.isArray(this.settings.profiles) || this.settings.profiles.length === 0) {
      this.settings.profiles = [makeDefaultProfile()]
    }
    if (!this.settings.profiles.some((p) => p.id === this.settings.activeProfileId)) {
      this.settings.activeProfileId = this.settings.profiles[0].id
    }
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
    try {
      const markdown = await this.app.vault.read(file)
      const { output, warnings } = convertMarkdownToDoku(markdown, this.settings, file.name)

      const action = this.settings.outputAction
      if (action === 'clipboard' || action === 'both') {
        await copyToClipboard(output, warnings.length > 0 ? `Copiato (${warnings.length} avvisi)` : 'Copiato negli appunti')
      }
      if (action === 'file' || action === 'both') {
        const written = await writeSibling(this.app, file.path, output, this.settings.outputExtension)
        new Notice(`Scritto ${written.path}`)
      }
      this.notifyWarnings(file, warnings)
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Conversione non riuscita')
    }
  }

  private async convertSelection(editor: Editor): Promise<void> {
    try {
      const selection = editor.getSelection()
      if (selection.trim() === '') {
        new Notice('Nessuna selezione')
        return
      }
      const { output, warnings } = convertMarkdownToDoku(selection, this.settings)
      editor.replaceSelection(output)
      new Notice(warnings.length > 0 ? `Convertito (${warnings.length} avvisi)` : 'Selezione convertita')
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Conversione non riuscita')
    }
  }

  private async convertSelectionFromDoku(editor: Editor): Promise<void> {
    try {
      const selection = editor.getSelection()
      if (selection.trim() === '') {
        new Notice('Nessuna selezione')
        return
      }
      const { output, warnings } = convertDokuToMarkdown(selection, this.settings)
      editor.replaceSelection(output)
      new Notice(warnings.length > 0 ? `Importato (${warnings.length} avvisi)` : 'Selezione importata')
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Conversione non riuscita')
    }
  }

  /** Riscrive in silenzio il file DokuWiki accanto a una nota appena salvata. */
  private async autoUpdateSibling(file: TFile): Promise<void> {
    try {
      const markdown = await this.app.vault.read(file)
      const { output } = convertMarkdownToDoku(markdown, this.settings, file.name)
      await writeSibling(this.app, file.path, output, this.settings.outputExtension)
    } catch (error) {
      console.error('[md2doku] aggiornamento automatico non riuscito', error)
    }
  }

  /** Avviso cliccabile che apre l'elenco completo degli avvisi. */
  private notifyWarnings(file: TFile | null, warnings: ConversionWarning[]): void {
    if (warnings.length === 0) return
    const notice = new Notice(`${warnings.length} avvisi — clicca per i dettagli`, 6000)
    notice.noticeEl.addClass('md2doku-clickable-notice')
    notice.noticeEl.addEventListener('click', () => {
      notice.hide()
      new WarningsModal(this.app, file, warnings).open()
    })
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl) return
    const file = this.activeMarkdownFile()
    this.statusBarEl.setText(file ? `⇄ DokuWiki: ${file.basename}` : '⇄ DokuWiki')
    this.statusBarEl.setAttribute('aria-label', 'Converti la nota corrente in DokuWiki')
  }
}
