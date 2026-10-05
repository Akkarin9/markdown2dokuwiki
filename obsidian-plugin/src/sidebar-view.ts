/**
 * Vista laterale del plugin: pannello con i comandi a portata di click, così
 * non serve cercarli ogni volta nella Command Palette.
 */

import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian'
import type Md2DokuPlugin from '../main'
import { checkForUpdates } from './updater'

export const VIEW_TYPE_MD2DOKU = 'md2doku-sidebar'

interface Action {
  label: string
  icon: string
  disabled?: boolean
  onClick: () => void
}

export class Md2DokuView extends ItemView {
  private plugin: Md2DokuPlugin

  constructor(leaf: WorkspaceLeaf, plugin: Md2DokuPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return VIEW_TYPE_MD2DOKU
  }

  getDisplayText(): string {
    return 'Markdown ⇄ DokuWiki'
  }

  getIcon(): string {
    return 'repeat'
  }

  async onOpen(): Promise<void> {
    this.plugin.registerOpenView(this)
    this.refresh()
  }

  async onClose(): Promise<void> {
    this.plugin.unregisterOpenView(this)
  }

  /** Ridisegna il pannello (chiamato anche al cambio della nota attiva). */
  refresh(): void {
    const root = this.contentEl
    root.empty()
    root.addClass('md2doku-sidebar')

    const active = this.plugin.activeMarkdownFile()
    root.createEl('h4', { text: 'Markdown ⇄ DokuWiki', cls: 'md2doku-title' })
    root.createEl('p', {
      cls: 'md2doku-hint',
      text: active ? `Nota attiva: ${active.basename}` : 'Nessuna nota Markdown attiva',
    })

    this.renderActions(root, [
      {
        label: 'Converti la nota in DokuWiki',
        icon: 'repeat',
        disabled: !active,
        onClick: () => void this.plugin.runConvertNote(),
      },
      {
        label: 'Converti la selezione in DokuWiki',
        icon: 'text-cursor-input',
        onClick: () => void this.plugin.runConvertSelectionToDoku(),
      },
      {
        label: 'Converti la selezione da DokuWiki',
        icon: 'text-cursor-input',
        onClick: () => void this.plugin.runConvertSelectionFromDoku(),
      },
    ])

    root.createEl('h5', { text: 'Import' })
    this.renderActions(root, [
      {
        label: 'Importa da DokuWiki…',
        icon: 'clipboard-paste',
        onClick: () => this.plugin.openImportModal(),
      },
    ])

    const folder = this.plugin.activeFolder()
    root.createEl('h5', { text: 'Cartella' })
    root.createEl('p', { cls: 'md2doku-hint', text: `Destinazione: ${folder?.path || '/'}` })
    this.renderActions(root, [
      {
        label: 'Esporta la cartella in DokuWiki',
        icon: 'folder-output',
        disabled: !folder,
        onClick: () => void this.plugin.runFolderExport(),
      },
    ])

    root.createEl('h5', { text: 'Configurazione' })
    this.renderActions(root, [
      {
        label: 'Apri le impostazioni',
        icon: 'settings',
        onClick: () => this.plugin.openSettings(),
      },
      {
        label: 'Dove va il risultato',
        icon: 'clipboard',
        onClick: () => void this.plugin.cycleOutputAction(),
      },
      {
        label: 'Cerca aggiornamenti',
        icon: 'download',
        onClick: () => void checkForUpdates(this.app, this.plugin),
      },
    ])
    root.createEl('p', {
      cls: 'md2doku-hint',
      text: `Output: ${OUTPUT_LABELS[this.plugin.settings.outputAction]}`,
    })
  }

  private renderActions(root: HTMLElement, actions: Action[]): void {
    for (const action of actions) {
      const btn = root.createEl('button', { cls: 'md2doku-action' })
      btn.disabled = action.disabled ?? false
      const iconEl = btn.createSpan({ cls: 'md2doku-action-icon' })
      setIcon(iconEl, action.icon)
      btn.createSpan({ text: action.label })
      btn.addEventListener('click', () => {
        if (!(action.disabled ?? false)) action.onClick()
      })
    }
  }
}

export const OUTPUT_LABELS: Record<Md2DokuPlugin['settings']['outputAction'], string> = {
  clipboard: 'appunti',
  file: 'file accanto alla nota',
  both: 'appunti + file',
}
