/**
 * Impostazioni del plugin: corrispondono 1:1 alle `Options` del motore, più
 * alcune preferenze di comportamento dell'interfaccia (cosa fare con l'output).
 */

import { App, PluginSettingTab, Setting } from 'obsidian'
import type Md2DokuPlugin from '../main'
import { DEFAULT_OPTIONS, type CalloutStyle, type CodeInListsStrategy, type FrontmatterHandling, type HighlightStyle, type InternalLinkStyle, type Options, type TagHandling } from './engine'

/** Cosa fare dell'output della conversione della nota corrente. */
export type OutputAction = 'clipboard' | 'file' | 'both'

export interface Md2DokuSettings extends Options {
  /** Destinazione dell'output quando si converte la nota corrente. */
  outputAction: OutputAction
  /** Estensione dei file DokuWiki esportati (`.txt` di default). */
  outputExtension: string
}

export const DEFAULT_SETTINGS: Md2DokuSettings = {
  ...DEFAULT_OPTIONS,
  outputAction: 'clipboard',
  outputExtension: '.txt',
}

export class Md2DokuSettingTab extends PluginSettingTab {
  plugin: Md2DokuPlugin

  constructor(app: App, plugin: Md2DokuPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  private save(): void {
    void this.plugin.saveSettings()
    // Le opzioni cambiano la conversione: se il pannello import è aperto va ricalcolato.
    this.plugin.refreshOpenViews()
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'Markdown ⇄ DokuWiki' })

    // --------------------------------------------------------------- Destinazione
    new Setting(containerEl).setName('Output').setHeading()

    new Setting(containerEl)
      .setName('Dove mettere il risultato')
      .setDesc('Cosa fare quando converti la nota corrente.')
      .addDropdown((drop) =>
        drop
          .addOption('clipboard', 'Copia negli appunti')
          .addOption('file', 'Scrivi un file accanto alla nota')
          .addOption('both', 'Entrambe')
          .setValue(this.plugin.settings.outputAction)
          .onChange((value) => {
            this.plugin.settings.outputAction = value as OutputAction
            this.save()
          }),
      )

    new Setting(containerEl)
      .setName('Estensione dei file esportati')
      .addText((text) =>
        text
          .setPlaceholder('.txt')
          .setValue(this.plugin.settings.outputExtension)
          .onChange((value) => {
            this.plugin.settings.outputExtension = value.trim() || '.txt'
            this.save()
          }),
      )

    // --------------------------------------------------------------- Namespace
    new Setting(containerEl).setName('Namespace').setHeading()

    this.textField(
      'Namespace dei link',
      'Anteposto ai wikilink (vuoto = nessun namespace).',
      this.plugin.settings.linkNamespace,
      (v) => (this.plugin.settings.linkNamespace = v),
    )
    this.textField(
      'Namespace dei media',
      'Anteposto a immagini ed embed.',
      this.plugin.settings.mediaNamespace,
      (v) => (this.plugin.settings.mediaNamespace = v),
    )

    this.toggle(
      'Preserva le cartelle nei link',
      '[[Guida/Setup]] → [[guida:setup]].',
      this.plugin.settings.preserveFolders,
      (v) => (this.plugin.settings.preserveFolders = v),
    )

    // --------------------------------------------------------------- Callout e plugin
    new Setting(containerEl).setName('Callout e plugin').setHeading()

    new Setting(containerEl)
      .setName('Stile callout')
      .setDesc('Nessun plugin installato: usa «Citazione (HTML)».')
      .addDropdown((drop) =>
        drop
          .addOption('html', 'Citazione (HTML, nessun plugin)')
          .addOption('note', 'Plugin note <note>')
          .addOption('wrap', 'Plugin wrap <WRAP>')
          .setValue(this.plugin.settings.calloutStyle)
          .onChange((value) => {
            this.plugin.settings.calloutStyle = value as CalloutStyle
            this.save()
          }),
      )

    new Setting(containerEl)
      .setName('Stile evidenziazione')
      .setDesc('Come rendere ==x== in DokuWiki.')
      .addDropdown((drop) =>
        drop
          .addOption('fc', 'DokuWiki nativo <fc #ffff00>')
          .addOption('wrap', 'Plugin wrap <wrap hi>')
          .addOption('mark', 'HTML <mark>')
          .addOption('bold', 'Grassetto (nessun plugin)')
          .setValue(this.plugin.settings.highlightStyle)
          .onChange((value) => {
            this.plugin.settings.highlightStyle = value as HighlightStyle
            this.save()
          }),
      )

    this.toggle(
      'Converti ==evidenziato==',
      'Disattiva per lasciare ==x== invariato.',
      this.plugin.settings.convertHighlight,
      (v) => (this.plugin.settings.convertHighlight = v),
    )

    this.toggle(
      'Transclusione con plugin include',
      '![[Nota]] → {{page>ns:nota}} (richiede il plugin include).',
      this.plugin.settings.includeTransclusion,
      (v) => (this.plugin.settings.includeTransclusion = v),
    )

    new Setting(containerEl)
      .setName('Codice dentro le liste')
      .setDesc('DokuWiki: un <code> a colonna 0 interrompe la lista.')
      .addDropdown((drop) =>
        drop
          .addOption('indent', 'Indenta di 2 spazi per livello')
          .addOption('wrap', 'Avvolgi in <WRAP code>')
          .addOption('break', 'Accetta la rottura (con avviso)')
          .setValue(this.plugin.settings.codeInLists)
          .onChange((value) => {
            this.plugin.settings.codeInLists = value as CodeInListsStrategy
            this.save()
          }),
      )

    // --------------------------------------------------------------- Testo
    new Setting(containerEl).setName('Testo e pulizia').setHeading()

    this.toggle(
      'A capo singoli → \\\\',
      'DokuWiki fonde le righe consecutive; attivo conserva gli a capo Obsidian.',
      this.plugin.settings.preserveLineBreaks,
      (v) => (this.plugin.settings.preserveLineBreaks = v),
    )

    this.toggle(
      'Rimuovi le sezioni Related/backlink',
      'Pulizia pre-conversione.',
      this.plugin.settings.cleanupRelated,
      (v) => (this.plugin.settings.cleanupRelated = v),
    )

    this.toggle(
      'Normalizza spazi e righe vuote',
      'Pulizia pre-conversione.',
      this.plugin.settings.cleanupWhitespace,
      (v) => (this.plugin.settings.cleanupWhitespace = v),
    )

    this.toggle(
      'H1 dal nome file se manca il titolo',
      'Utile per l\'esportazione di cartelle.',
      this.plugin.settings.h1FromFileName,
      (v) => (this.plugin.settings.h1FromFileName = v),
    )

    // --------------------------------------------------------------- Estensioni
    new Setting(containerEl).setName('Estensioni Obsidian').setHeading()

    new Setting(containerEl)
      .setName('Frontmatter YAML')
      .addDropdown((drop) =>
        drop
          .addOption('comment', 'Converti in commento')
          .addOption('remove', 'Rimuovi')
          .addOption('keep', 'Mantieni')
          .setValue(this.plugin.settings.frontmatter)
          .onChange((value) => {
            this.plugin.settings.frontmatter = value as FrontmatterHandling
            this.save()
          }),
      )

    new Setting(containerEl)
      .setName('Tag Obsidian (#tag)')
      .addDropdown((drop) =>
        drop
          .addOption('remove', 'Rimuovi')
          .addOption('note', 'Riga di tag {{tag>…}}')
          .setValue(this.plugin.settings.tags)
          .onChange((value) => {
            this.plugin.settings.tags = value as TagHandling
            this.save()
          }),
      )

    this.toggle(
      'Rimuovi i commenti %%…%%',
      'Come nella webapp.',
      this.plugin.settings.removeObsidianComments,
      (v) => (this.plugin.settings.removeObsidianComments = v),
    )

    this.toggle(
      'Converti le attività ☐/☑',
      'Converte - [ ] / - [x].',
      this.plugin.settings.convertTasks,
      (v) => (this.plugin.settings.convertTasks = v),
    )

    new Setting(containerEl)
      .setName('Link interni (Doku → Markdown)')
      .addDropdown((drop) =>
        drop
          .addOption('wikilink', 'Wikilink Obsidian')
          .addOption('markdown', 'Link Markdown')
          .setValue(this.plugin.settings.internalLinks)
          .onChange((value) => {
            this.plugin.settings.internalLinks = value as InternalLinkStyle
            this.save()
          }),
      )

    // --------------------------------------------------------------- Reset
    new Setting(containerEl).addButton((btn) =>
      btn.setButtonText('Ripristina predefiniti').onClick(async () => {
        this.plugin.settings = { ...DEFAULT_SETTINGS, ...this.plugin.settings, ...DEFAULT_OPTIONS }
        await this.plugin.saveSettings()
        this.display()
        this.plugin.refreshOpenViews()
      }),
    )
  }

  private textField(name: string, desc: string, value: string, set: (v: string) => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) =>
        text.setValue(value).onChange((v) => {
          set(v)
          this.save()
        }),
      )
  }

  private toggle(name: string, desc: string, value: boolean, set: (v: boolean) => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle.setValue(value).onChange((v) => {
          set(v)
          this.save()
        }),
      )
  }
}
