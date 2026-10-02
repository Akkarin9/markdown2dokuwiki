import { AlertTriangle, Info, TriangleAlert, X } from 'lucide-react'
import type { ConversionWarning } from '../converters/types'

interface WarningsPanelProps {
  warnings: ConversionWarning[]
  onClose: () => void
  /** Porta l'attenzione sulla riga interessata nell'editor di input. */
  onJump?: (line: number) => void
}

const KIND_META: Record<ConversionWarning['kind'], { label: string; className: string; Icon: typeof Info }> = {
  unsupported: { label: 'Non supportato', className: 'text-danger', Icon: TriangleAlert },
  degraded: { label: 'Degradato', className: 'text-warning', Icon: AlertTriangle },
  collision: { label: 'Ambiguità', className: 'text-warning', Icon: AlertTriangle },
  info: { label: 'Info', className: 'text-info', Icon: Info },
}

/** Pannello non invasivo con le "Note di conversione". */
export function WarningsPanel({ warnings, onClose, onJump }: WarningsPanelProps) {
  return (
    <div className="animate-pop-in border-t border-border bg-elevated">
      <header className="flex items-center justify-between px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Note di conversione ({warnings.length})
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi le note di conversione"
          className="rounded-md p-1 text-muted transition hover:bg-panel hover:text-text"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>
      <ul className="max-h-40 overflow-y-auto px-2 pb-3">
        {warnings.map((w, i) => {
          const meta = KIND_META[w.kind]
          return (
            <li key={`${w.line}-${i}`}>
              <button
                type="button"
                onClick={() => onJump?.(w.line)}
                title="Vai alla riga nell'editor"
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-panel"
              >
                <meta.Icon className={`mt-0.5 size-3.5 shrink-0 ${meta.className}`} aria-hidden />
                <span className="shrink-0 font-mono text-faint">riga {w.line}</span>
                <span className={`shrink-0 ${meta.className}`}>{meta.label}</span>
                <span className="text-muted">{w.message}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
