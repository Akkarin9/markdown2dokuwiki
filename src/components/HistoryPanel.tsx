import { Trash2, X } from 'lucide-react'
import type { HistoryEntry } from '../lib/history'

interface HistoryPanelProps {
  open: boolean
  entries: HistoryEntry[]
  onClose: () => void
  onRestore: (entry: HistoryEntry) => void
  onDelete: (id: number) => void
  onClear: () => void
}

const DIRECTION_LABEL: Record<HistoryEntry['direction'], string> = {
  'md-to-doku': 'MD → Doku',
  'doku-to-md': 'Doku → MD',
}

/** Cronologia locale delle conversioni (IndexedDB). */
export function HistoryPanel({ open, entries, onClose, onRestore, onDelete, onClear }: HistoryPanelProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Chiudi cronologia" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cronologia conversioni"
        className="animate-pop-in relative z-10 flex h-full w-[380px] max-w-full flex-col border-l border-border bg-panel shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Cronologia ({entries.length})</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClear}
              disabled={entries.length === 0}
              title="Svuota la cronologia"
              aria-label="Svuota la cronologia"
              className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-danger disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="p-4 text-sm text-faint">Nessuna conversione salvata. La cronologia è locale e non lascia il browser.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => (
                <li key={entry.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-elevated">
                  <button
                    type="button"
                    onClick={() => onRestore(entry)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                  >
                    <span className="flex items-center gap-2 text-[11px] text-faint">
                      <span className="rounded bg-elevated px-1.5 py-0.5 font-medium text-muted">
                        {DIRECTION_LABEL[entry.direction]}
                      </span>
                      {new Date(entry.at).toLocaleString('it-IT')}
                    </span>
                    <span className="truncate text-xs text-muted">{entry.label || entry.input.slice(0, 60)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => entry.id !== undefined && onDelete(entry.id)}
                    aria-label="Elimina voce"
                    className="rounded p-1 text-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
