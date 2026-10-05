/**
 * Piccoli modali di input. Obsidian non espone un `prompt()` (che del resto non
 * esiste su mobile), quindi li costruiamo con `Modal`.
 */

import { App, Modal, Setting } from 'obsidian'

class PromptModal extends Modal {
  private settled = false

  constructor(
    app: App,
    private heading: string,
    private placeholder: string,
    private initial: string,
    private multiline: boolean,
    private cta: string,
    private resolve: (value: string | null) => void,
  ) {
    super(app)
  }

  onOpen(): void {
    this.titleEl.setText(this.heading)
    const field = this.multiline
      ? this.contentEl.createEl('textarea', {
          cls: 'md2doku-textarea',
          attr: { rows: '8', placeholder: this.placeholder },
        })
      : this.contentEl.createEl('input', {
          cls: 'md2doku-input',
          attr: { type: 'text', placeholder: this.placeholder },
        })
    field.value = this.initial
    window.setTimeout(() => field.focus(), 0)

    field.addEventListener('keydown', (event: Event) => {
      const key = event as KeyboardEvent
      if (key.key !== 'Enter') return
      if (this.multiline && !(key.metaKey || key.ctrlKey)) return
      event.preventDefault()
      this.finish(field.value)
    })

    new Setting(this.contentEl)
      .addButton((btn) => btn.setButtonText(this.cta).setCta().onClick(() => this.finish(field.value)))
      .addButton((btn) => btn.setButtonText('Annulla').onClick(() => this.finish(null)))
  }

  onClose(): void {
    this.contentEl.empty()
    if (!this.settled) {
      this.settled = true
      this.resolve(null)
    }
  }

  private finish(value: string | null): void {
    if (this.settled) return
    this.settled = true
    this.resolve(value === null ? null : value.trim() || null)
    this.close()
  }
}

/** Chiede una riga di testo; `null` se annullato. */
export function promptText(app: App, title: string, placeholder = '', initial = ''): Promise<string | null> {
  return new Promise((resolve) => new PromptModal(app, title, placeholder, initial, false, 'OK', resolve).open())
}

/** Chiede un testo multi-riga; `null` se annullato. */
export function promptMultiline(app: App, title: string, placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => new PromptModal(app, title, placeholder, '', true, 'Applica', resolve).open())
}

class ConfirmModal extends Modal {
  private settled = false

  constructor(
    app: App,
    private heading: string,
    private lines: string[],
    private cta: string,
    private resolve: (value: boolean) => void,
  ) {
    super(app)
  }

  onOpen(): void {
    this.titleEl.setText(this.heading)
    for (const line of this.lines) this.contentEl.createEl('p', { text: line })
    new Setting(this.contentEl)
      .addButton((btn) => btn.setButtonText(this.cta).setCta().onClick(() => this.finish(true)))
      .addButton((btn) => btn.setButtonText('Annulla').onClick(() => this.finish(false)))
  }

  onClose(): void {
    this.contentEl.empty()
    if (!this.settled) {
      this.settled = true
      this.resolve(false)
    }
  }

  private finish(value: boolean): void {
    if (this.settled) return
    this.settled = true
    this.resolve(value)
    this.close()
  }
}

/** Chiede una conferma con un elenco di righe; `false` se annullato. */
export function confirmAction(app: App, title: string, lines: string[], cta = 'OK'): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, title, lines, cta, resolve).open())
}
