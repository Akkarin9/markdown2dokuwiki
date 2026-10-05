/**
 * Elenco degli avvisi di conversione. Se è nota la nota di origine, ogni riga è
 * cliccabile e porta il cursore sulla riga corrispondente nell'editor.
 */

import { App, MarkdownView, Modal, type TFile } from 'obsidian'
import type { ConversionWarning } from './engine'

export class WarningsModal extends Modal {
  constructor(
    app: App,
    private file: TFile | null,
    private warnings: ConversionWarning[],
  ) {
    super(app)
  }

  onOpen(): void {
    this.titleEl.setText(`Avvisi di conversione (${this.warnings.length})`)
    if (this.file) {
      this.contentEl.createEl('p', {
        cls: 'md2doku-hint',
        text: `Nota: ${this.file.basename}. Clicca un avviso per andare alla riga.`,
      })
    }

    const list = this.contentEl.createEl('div', { cls: 'md2doku-warning-list' })
    for (const warning of this.warnings) {
      const row = list.createEl('div', { cls: `md2doku-warning-row md2doku-warning-${warning.kind}` })
      row.createSpan({ cls: 'md2doku-warning-line', text: `riga ${warning.line}` })
      row.createSpan({ text: ` [${warning.kind}] ${warning.message}` })
      if (this.file) {
        row.addClass('md2doku-warning-clickable')
        row.addEventListener('click', () => void this.gotoLine(warning.line))
      }
    }
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private async gotoLine(line: number): Promise<void> {
    const file = this.file
    if (!file) return
    this.close()
    const leaf = this.app.workspace.getLeaf(false)
    await leaf.openFile(file)
    const view = leaf.view
    if (view instanceof MarkdownView) {
      const pos = { line: Math.max(0, line - 1), ch: 0 }
      view.editor.setCursor(pos)
      view.editor.scrollIntoView({ from: pos, to: pos }, true)
    }
  }
}
