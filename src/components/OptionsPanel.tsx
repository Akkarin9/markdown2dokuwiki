import { useRef, useState } from 'react'
import { Check, Copy, Download, Plus, Trash2, Upload, X } from 'lucide-react'
import type {
  CalloutStyle,
  CodeInListsStrategy,
  FrontmatterHandling,
  HighlightStyle,
  InternalLinkStyle,
  Options,
  TagHandling,
} from '../converters/types'
import type { Profile } from '../lib/profiles'

interface OptionsPanelProps {
  open: boolean
  options: Options
  onChange: <K extends keyof Options>(key: K, value: Options[K]) => void
  onReset: () => void
  onClose: () => void
  // Profili
  profiles: Profile[]
  activeProfileId: string
  onApplyProfile: (id: string) => void
  onCreateProfile: () => void
  onDeleteProfile: (id: string) => void
  onRenameProfile: (id: string, name: string) => void
  onDuplicateProfile: (id: string) => void
  onSaveToProfile: () => void
  onExportProfiles: () => string
  onImportProfiles: (json: string) => boolean
  onOpenPluginDetect: () => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-faint">{hint}</span>}
    </label>
  )
}

function Example({ before, after }: { before: string; after: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed">
      <div className="text-faint">{before}</div>
      <div className="text-accent">→ {after}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {children}
    </section>
  )
}

const inputClass =
  'rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-accent'

const selectClass = `${inputClass} cursor-pointer`

export function OptionsPanel({
  open,
  options,
  onChange,
  onReset,
  onClose,
  profiles,
  activeProfileId,
  onApplyProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onDuplicateProfile,
  onSaveToProfile,
  onExportProfiles,
  onImportProfiles,
  onOpenPluginDetect,
}: OptionsPanelProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  const handleExport = () => {
    const json = onExportProfiles()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'profili-md2doku.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File) => {
    const ok = onImportProfiles(await file.text())
    if (!ok) window.alert('File profili non valido.')
  }

  return (
    <aside
      aria-label="Opzioni di conversione"
      aria-hidden={!open}
      className={`fixed inset-y-0 right-0 z-40 flex w-[360px] max-w-full flex-col border-l border-border bg-panel shadow-2xl transition-transform duration-300 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Opzioni</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi opzioni"
          className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {/* ---------------------------------------------------------- Profili */}
        <Group title="Profilo">
          <div className="flex items-center gap-2">
            <select
              className={selectClass}
              value={activeProfileId}
              onChange={(e) => onApplyProfile(e.target.value)}
              aria-label="Profilo attivo"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onCreateProfile}
              title="Nuovo profilo"
              aria-label="Nuovo profilo"
              className="rounded-lg border border-border bg-bg p-2 text-muted transition hover:border-border-strong hover:text-text"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSaveToProfile}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-muted transition hover:border-border-strong hover:text-text"
            >
              <Check className="size-3.5" aria-hidden /> Salva nel profilo
            </button>
            <button
              type="button"
              onClick={() => onDuplicateProfile(activeProfileId)}
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-muted transition hover:border-border-strong hover:text-text"
            >
              Duplica
            </button>
            <button
              type="button"
              disabled={activeProfileId === 'default'}
              onClick={() => onDeleteProfile(activeProfileId)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-muted transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3.5" aria-hidden /> Elimina
            </button>
          </div>
          {activeProfile && activeProfileId !== 'default' && (
            <Field label="Nome del profilo">
              <input
                type="text"
                className={inputClass}
                value={activeProfile.name}
                onChange={(e) => onRenameProfile(activeProfileId, e.target.value)}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-muted transition hover:border-border-strong hover:text-text"
            >
              <Download className="size-3.5" aria-hidden /> Esporta JSON
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-muted transition hover:border-border-strong hover:text-text"
            >
              <Upload className="size-3.5" aria-hidden /> Importa JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImport(file)
                e.target.value = ''
              }}
            />
          </div>
          <button
            type="button"
            onClick={onOpenPluginDetect}
            className="rounded-lg bg-accent-soft px-3 py-2 text-xs font-medium text-accent transition hover:brightness-110"
          >
            Rileva plugin da un frammento DokuWiki…
          </button>
        </Group>

        {/* ------------------------------------------------ Namespace e link */}
        <Group title="Namespace">
          <Field label="Namespace dei link" hint="Anteposto ai wikilink. Vuoto = nessun namespace.">
            <input
              type="text"
              className={inputClass}
              placeholder="es. guide"
              value={options.linkNamespace}
              onChange={(e) => onChange('linkNamespace', e.target.value)}
            />
          </Field>
          <Field label="Namespace dei media" hint="Anteposto a immagini ed embed.">
            <input
              type="text"
              className={inputClass}
              placeholder="es. guide:media"
              value={options.mediaNamespace}
              onChange={(e) => onChange('mediaNamespace', e.target.value)}
            />
          </Field>
          <Toggle
            label="Preserva le cartelle nei link"
            checked={options.preserveFolders}
            onChange={(v) => onChange('preserveFolders', v)}
          />
          <Example before="[[Guida/Setup]]" after={options.preserveFolders ? '[[guida:setup]]' : '[[guidasetup]]'} />
        </Group>

        {/* -------------------------------------------------- Callout e plugin */}
        <Group title="Callout e plugin">
          <Field
            label="Stile callout"
            hint="Nessun plugin installato: «Citazione (HTML)» è il fallback sicuro."
          >
            <select
              className={selectClass}
              value={options.calloutStyle}
              onChange={(e) => onChange('calloutStyle', e.target.value as CalloutStyle)}
            >
              <option value="html">Citazione (HTML, nessun plugin)</option>
              <option value="note">Plugin note &lt;note&gt;</option>
              <option value="wrap">Plugin wrap &lt;WRAP&gt;</option>
            </select>
          </Field>
          <Field label="Stile evidenziazione" hint="Come rendere ==x== in DokuWiki.">
            <select
              className={selectClass}
              value={options.highlightStyle}
              onChange={(e) => onChange('highlightStyle', e.target.value as HighlightStyle)}
            >
              <option value="fc">DokuWiki nativo &lt;fc #ffff00&gt;</option>
              <option value="wrap">Plugin wrap &lt;wrap hi&gt;</option>
              <option value="mark">HTML &lt;mark&gt;</option>
              <option value="bold">Grassetto (nessun plugin)</option>
            </select>
          </Field>
          <Toggle
            label="Converti ==evidenziato=="
            checked={options.convertHighlight}
            onChange={(v) => onChange('convertHighlight', v)}
          />
          <Toggle
            label="Transclusione con plugin include"
            checked={options.includeTransclusion}
            onChange={(v) => onChange('includeTransclusion', v)}
          />
          <Example before="![[Nota]]" after={options.includeTransclusion ? '{{page>ns:nota}}' : '[[ns:nota]] + avviso'} />
          <Field label="Codice dentro le liste" hint="DokuWiki: un <code> a colonna 0 interrompe la lista.">
            <select
              className={selectClass}
              value={options.codeInLists}
              onChange={(e) => onChange('codeInLists', e.target.value as CodeInListsStrategy)}
            >
              <option value="indent">Indenta di 2 spazi per livello</option>
              <option value="wrap">Avvolgi in &lt;WRAP code&gt;</option>
              <option value="break">Accetta la rottura (con avviso)</option>
            </select>
          </Field>
        </Group>

        {/* -------------------------------------------------------- Testo */}
        <Group title="Testo e pulizia">
          <Toggle
            label="A capo singoli → \\\\"
            checked={options.preserveLineBreaks}
            onChange={(v) => onChange('preserveLineBreaks', v)}
          />
          <p className="-mt-2 text-[11px] leading-snug text-faint">
            DokuWiki fonde le righe consecutive; attivo conserva gli a capo di Obsidian (mai in codice,
            tabelle, liste, heading e citazioni).
          </p>
          <Toggle
            label="Rimuovi le sezioni Related/backlink"
            checked={options.cleanupRelated}
            onChange={(v) => onChange('cleanupRelated', v)}
          />
          <Toggle
            label="Normalizza spazi e righe vuote"
            checked={options.cleanupWhitespace}
            onChange={(v) => onChange('cleanupWhitespace', v)}
          />
          <Toggle
            label="H1 dal nome file se manca il titolo"
            checked={options.h1FromFileName}
            onChange={(v) => onChange('h1FromFileName', v)}
          />
        </Group>

        {/* -------------------------------------------------- Estensioni */}
        <Group title="Estensioni Obsidian">
          <Field label="Frontmatter YAML">
            <select
              className={selectClass}
              value={options.frontmatter}
              onChange={(e) => onChange('frontmatter', e.target.value as FrontmatterHandling)}
            >
              <option value="comment">Converti in commento</option>
              <option value="remove">Rimuovi</option>
              <option value="keep">Mantieni</option>
            </select>
          </Field>
          <Field label="Tag Obsidian (#tag)">
            <select
              className={selectClass}
              value={options.tags}
              onChange={(e) => onChange('tags', e.target.value as TagHandling)}
            >
              <option value="remove">Rimuovi</option>
              <option value="note">Riga di tag {'{{tag>…}}'}</option>
            </select>
          </Field>
          <Toggle
            label="Rimuovi i commenti %%…%%"
            checked={options.removeObsidianComments}
            onChange={(v) => onChange('removeObsidianComments', v)}
          />
          <Toggle
            label="Converti le attività ☐/☑"
            checked={options.convertTasks}
            onChange={(v) => onChange('convertTasks', v)}
          />
          <Field label="Link interni (Doku → Markdown)">
            <select
              className={selectClass}
              value={options.internalLinks}
              onChange={(e) => onChange('internalLinks', e.target.value as InternalLinkStyle)}
            >
              <option value="wikilink">Wikilink Obsidian</option>
              <option value="markdown">Link Markdown</option>
            </select>
          </Field>
        </Group>
      </div>

      <footer className="flex items-center gap-2 border-t border-border p-4">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-muted transition hover:border-border-strong hover:text-text"
        >
          Ripristina predefiniti
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(JSON.stringify(options, null, 2)).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          }}
          title="Copia le opzioni come JSON"
          aria-label="Copia le opzioni come JSON"
          className="rounded-lg border border-border bg-bg p-2 text-muted transition hover:border-border-strong hover:text-text"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </footer>
    </aside>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-border-strong'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  )
}
