import { useState } from 'react'
import { ScanSearch, X } from 'lucide-react'
import { detectPlugins, type PluginDetection } from '../lib/plugins'
import type { Options } from '../converters/types'

interface PluginDetectDialogProps {
  open: boolean
  onClose: () => void
  onApply: (suggestion: Partial<Options>) => void
}

/**
 * Modale per dedurre i plugin DokuWiki in uso da un frammento di pagina:
 * precompila le opzioni corrispondenti (stile callout, include, tag, highlight).
 */
export function PluginDetectDialog({ open, onClose, onApply }: PluginDetectDialogProps) {
  const [fragment, setFragment] = useState('')
  const [result, setResult] = useState<PluginDetection | null>(null)

  if (!open) return null

  const analyze = () => setResult(detectPlugins(fragment))

  const label: Record<PluginDetection['detected'][number], string> = {
    wrap: 'WRAP',
    note: 'note',
    include: 'include',
    tag: 'tag',
    mark: 'evidenziazione',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rilevamento plugin"
        className="animate-pop-in relative z-10 flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-border bg-panel p-5 shadow-2xl"
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanSearch className="size-4 text-accent" aria-hidden />
            <h2 className="text-sm font-semibold">Rileva plugin da un frammento</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <p className="text-xs text-faint">
          Incolla un pezzo della tua DokuWiki: l'app deduce i plugin in uso (WRAP, note, include, tag) e
          precompila le opzioni del profilo attivo.
        </p>

        <textarea
          value={fragment}
          onChange={(e) => setFragment(e.target.value)}
          rows={7}
          placeholder={'<WRAP warning Nota>\n...\n</WRAP>\n\n{{page>guide:altra_pagina}}'}
          className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none transition focus:border-accent"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={analyze}
            disabled={fragment.trim() === ''}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analizza
          </button>

          {result && (
            <button
              type="button"
              onClick={() => {
                onApply(result.suggestion)
                onClose()
              }}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-muted transition hover:border-border-strong hover:text-text"
            >
              Applica al profilo
            </button>
          )}
        </div>

        {result && (
          <div className="rounded-lg border border-border bg-bg/60 p-3 text-xs">
            {result.detected.length === 0 ? (
              <p className="text-muted">Nessun plugin riconosciuto nel frammento.</p>
            ) : (
              <>
                <p className="mb-1.5 flex flex-wrap gap-1.5">
                  {result.detected.map((id) => (
                    <span key={id} className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
                      {label[id]}
                    </span>
                  ))}
                </p>
                <ul className="flex flex-col gap-1 text-muted">
                  {result.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
