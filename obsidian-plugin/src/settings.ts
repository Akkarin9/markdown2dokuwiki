/**
 * Impostazioni del plugin: le opzioni del motore (1:1 su `Options`) più alcune
 * preferenze del plugin (output, profili, aggiornamento al salvataggio).
 *
 * I profili riusano gli helper puri di `src/lib/profiles.ts` ma vengono salvati
 * nel `data.json` di Obsidian (non in `localStorage`, che non è affidabile su
 * mobile).
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import type Md2DokuPlugin from '../main'
import { detectPlugins } from '../../src/lib/plugins'
import {
  DEFAULT_PROFILE_ID,
  createProfile,
  duplicateProfile,
  exportProfiles,
  importProfiles,
  makeDefaultProfile,
  type Profile,
} from '../../src/lib/profiles'
import {
  DEFAULT_OPTIONS,
  type CalloutStyle,
  type CodeInListsStrategy,
  type FrontmatterHandling,
  type HighlightStyle,
  type InternalLinkStyle,
  type Options,
  type TagHandling,
} from './engine'
import { copyToClipboard, engineOptions } from './operations'
import { promptMultiline, promptText } from './prompt-modal'
import { checkForUpdates } from './updater'

/** Cosa fare dell'output della conversione della nota corrente. */
export type OutputAction = 'clipboard' | 'file' | 'both'

export interface Md2DokuSettings extends Options {
  /** Destinazione dell'output quando si converte la nota corrente. */
  outputAction: OutputAction
  /** Estensione dei file DokuWiki esportati (`.txt` di default). */
  outputExtension: string
  /** Aggiorna il file accanto alla nota a ogni salvataggio della nota. */
  convertOnSave: boolean
  /** Profili di opzioni salvati nel `data.json`. */
  profiles: Profile[]
  /** Id del profilo attivo. */
  activeProfileId: string
}

export const DEFAULT_SETTINGS: Md2DokuSettings = {
  ...DEFAULT_OPTIONS,
  outputAction: 'clipboard',
  outputExtension: '.txt',
  convertOnSave: false,
  profiles: [makeDefaultProfile()],
  activeProfileId: DEFAULT_PROFILE_ID,
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

    this.renderProfiles(containerEl)

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

    this.toggle(
      'Aggiorna il file accanto alla nota al salvataggio',
      'Riscrive il file DokuWiki a ogni salvataggio della nota, senza comandi.',
      this.plugin.settings.convertOnSave,
      (v) => (this.plugin.settings.convertOnSave = v),
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
      .setName('Rileva plugin da un frammento')
      .setDesc('Incolla del DokuWiki: propongo opzioni adatte a WRAP, note, include, tag ed evidenziazione.')
      .addButton((btn) => btn.setButtonText('Incolla frammento…').onClick(() => void this.detectFromFragment()))

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
      'Rimuove i commenti Obsidian dal risultato.',
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

    // --------------------------------------------------------------- Aggiornamenti
    new Setting(containerEl).setName('Aggiornamenti').setHeading()

    new Setting(containerEl)
      .setName('Aggiorna da GitHub')
      .setDesc(
        "Controlla Akkarin9/markdown2dokuwiki e installa l'ultima versione del plugin. " +
          'Dopo l\'installazione ricarica Obsidian (Ctrl+R).',
      )
      .addButton((btn) => btn.setButtonText('Cerca aggiornamenti').onClick(() => void checkForUpdates(this.app, this.plugin)))

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

  // ------------------------------------------------------------------- profili

  private renderProfiles(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Profili').setHeading()

    const profiles = this.plugin.settings.profiles
    new Setting(containerEl)
      .setName('Profilo attivo')
      .setDesc('Un profilo è un insieme di opzioni salvato con un nome.')
      .addDropdown((drop) => {
        for (const profile of profiles) drop.addOption(profile.id, profile.name)
        drop.setValue(this.plugin.settings.activeProfileId)
        drop.onChange((id) => this.applyProfile(id))
      })
      .addExtraButton((btn) =>
        btn
          .setIcon('save')
          .setTooltip('Salva le opzioni correnti nel profilo attivo')
          .onClick(async () => {
            const profile = this.activeProfile()
            if (!profile) return
            profile.options = engineOptions(this.plugin.settings)
            await this.plugin.saveSettings()
            new Notice(`Profilo «${profile.name}» aggiornato`)
          }),
      )

    new Setting(containerEl)
      .setName('Gestisci profili')
      .setDesc('Il profilo predefinito non può essere eliminato.')
      .addButton((btn) => btn.setButtonText('Nuovo').onClick(() => void this.createNewProfile()))
      .addButton((btn) => btn.setButtonText('Duplica').onClick(() => void this.duplicateActiveProfile()))
      .addButton((btn) => btn.setButtonText('Rinomina').onClick(() => void this.renameActiveProfile()))
      .addButton((btn) => btn.setButtonText('Elimina').setWarning().onClick(() => void this.deleteActiveProfile()))

    new Setting(containerEl)
      .setName('Import / export profili')
      .setDesc('Esporta tutti i profili come JSON, o incolla un JSON esportato in precedenza.')
      .addButton((btn) =>
        btn
          .setButtonText('Esporta (JSON)')
          .onClick(() => void copyToClipboard(exportProfiles(this.plugin.settings.profiles), 'Profili copiati negli appunti')),
      )
      .addButton((btn) => btn.setButtonText('Importa (JSON)').onClick(() => void this.importProfilesFromJson()))
  }

  private activeProfile(): Profile | null {
    const { profiles, activeProfileId } = this.plugin.settings
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null
  }

  private applyProfile(id: string): void {
    const profile = this.plugin.settings.profiles.find((p) => p.id === id)
    if (!profile) return
    Object.assign(this.plugin.settings, profile.options)
    this.plugin.settings.activeProfileId = id
    this.save()
    this.display()
  }

  private async createNewProfile(): Promise<void> {
    const name = await promptText(this.app, 'Nuovo profilo', 'Nome del profilo')
    if (!name) return
    const profile = createProfile(name, engineOptions(this.plugin.settings))
    this.plugin.settings.profiles.push(profile)
    this.plugin.settings.activeProfileId = profile.id
    await this.plugin.saveSettings()
    this.display()
  }

  private async duplicateActiveProfile(): Promise<void> {
    const active = this.activeProfile()
    if (!active) return
    const copy = duplicateProfile(active)
    this.plugin.settings.profiles.push(copy)
    this.plugin.settings.activeProfileId = copy.id
    await this.plugin.saveSettings()
    this.display()
  }

  private async renameActiveProfile(): Promise<void> {
    const active = this.activeProfile()
    if (!active) return
    const name = await promptText(this.app, 'Rinomina profilo', 'Nuovo nome', active.name)
    if (!name) return
    active.name = name
    await this.plugin.saveSettings()
    this.display()
  }

  private async deleteActiveProfile(): Promise<void> {
    const active = this.activeProfile()
    if (!active) return
    if (active.id === DEFAULT_PROFILE_ID) {
      new Notice('Il profilo predefinito non può essere eliminato')
      return
    }
    this.plugin.settings.profiles = this.plugin.settings.profiles.filter((p) => p.id !== active.id)
    const next = this.plugin.settings.profiles[0] ?? makeDefaultProfile()
    if (this.plugin.settings.profiles.length === 0) this.plugin.settings.profiles = [next]
    this.plugin.settings.activeProfileId = next.id
    Object.assign(this.plugin.settings, next.options)
    await this.plugin.saveSettings()
    this.display()
  }

  private async importProfilesFromJson(): Promise<void> {
    const raw = await promptMultiline(this.app, 'Importa profili', 'Incolla il JSON esportato')
    if (!raw) return
    const parsed = importProfiles(raw)
    if (!parsed) {
      new Notice('JSON dei profili non valido')
      return
    }
    this.plugin.settings.profiles = parsed
    const first = parsed[0]
    this.plugin.settings.activeProfileId = first.id
    Object.assign(this.plugin.settings, first.options)
    await this.plugin.saveSettings()
    this.display()
    new Notice(`${parsed.length} profili importati`)
  }

  private async detectFromFragment(): Promise<void> {
    const fragment = await promptMultiline(this.app, 'Rileva plugin DokuWiki', 'Incolla una pagina o un frammento DokuWiki')
    if (!fragment) return
    const detection = detectPlugins(fragment)
    if (detection.detected.length === 0) {
      new Notice('Nessun plugin noto trovato nel frammento')
      return
    }
    Object.assign(this.plugin.settings, detection.suggestion)
    await this.plugin.saveSettings()
    this.display()
    new Notice(detection.notes.join(' '))
  }

  // ---------------------------------------------------------------- componenti

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
