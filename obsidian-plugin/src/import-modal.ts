/**
 * Modale "Importa da DokuWiki": si incolla un documento DokuWiki e si crea una
 * nuova nota Markdown (o si copia negli appunti). Anteprima live della
 * conversione + conteggio degli avvisi.
 */

import { App, Modal, Notice, Setting } from 'obsidian'
import type Md2DokuPlugin from '../main'
import { convertDokuToMarkdown, copyToClipboard } from './operations'

export class ImportDokuModal extends Modal {
  private plugin: Md2DokuPlugin
  private input = ''
  private previewEl!: HTMLElement
  private warningEl!: HTMLElement

  constructor(app: App, plugin: Md2DokuPlugin) {
    super(app)
    this.plugin = plugin
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.addClass('md2doku-import-modal')
    this.titleEl.setText('Importa da DokuWiki')

    contentEl.createEl('p', {
      cls: 'md2doku-hint',
      text: 'Incolla un documento DokuWiki: verrà convertito in Markdown e salvato come nuova nota.',
    })

    const inputEl = contentEl.createEl('textarea', {
      cls: 'md2doku-textarea',
      attr: { placeholder: '====== Titolo ======\n\nTesto con **grassetto** e //corsivo//…', rows: '10' },
    })
    inputEl.addEventListener('input', () => {
      this.input = inputEl.value
      this.updatePreview()
    })

    this.warningEl = contentEl.createEl('div', { cls: 'md2doku-warnings' })

    contentEl.createEl('h4', { text: 'Anteprima' })
    this.previewEl = contentEl.createEl('pre', { cls: 'md2doku-preview' })

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Crea nota')
          .setCta()
          .onClick(() => void this.createNote()),
      )
      .addButton((btn) =>
        btn.setButtonText('Copia Markdown').onClick(() => void copyToClipboard(this.previewEl.textContent ?? '')),
      )
      .addButton((btn) => btn.setButtonText('Chiudi').onClick(() => this.close()))

    this.updatePreview()
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private updatePreview(): void {
    if (this.input.trim() === '') {
      this.previewEl.setText('L\'anteprima appare qui')
      this.warningEl.setText('')
      return
    }
    const { output, warnings } = convertDokuToMarkdown(this.input, this.plugin.settings)
    this.previewEl.setText(output)
    this.warningEl.setText(warnings > 0 ? `⚠ ${warnings} avvisi di conversione` : '✓ nessun avviso')
  }

  private async createNote(): Promise<void> {
    if (this.input.trim() === '') {
      new Notice('Incolla prima un documento DokuWiki')
      return
    }
    const { output } = convertDokuToMarkdown(this.input, this.plugin.settings)
    const pageName = firstDokuHeading(this.input) || 'dokuwiki'
    await this.plugin.createImportedNote(output, pageName)
    this.close()
  }
}

/** Titolo dalla prima heading DokuWiki, se presente. */
function firstDokuHeading(text: string): string | null {
  const m = /^\s*={2,6}\s+(.+?)\s*=+\s*$/m.exec(text)
  return m ? m[1].trim() : null
}
