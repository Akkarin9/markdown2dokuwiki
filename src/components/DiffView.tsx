import { useMemo } from 'react'
import { diffLines, diffStats } from '../lib/diff'

interface DiffViewProps {
  /** Versione di riferimento (sinistra). */
  left: string
  /** Versione attuale (destra). */
  right: string
  leftLabel?: string
  rightLabel?: string
}

/** Vista diff affiancata: confronta l'output attuale con una versione incollata. */
export function DiffView({ left, right, leftLabel = 'Precedente', rightLabel = 'Attuale' }: DiffViewProps) {
  const lines = useMemo(() => diffLines(left, right), [left, right])
  const stats = useMemo(() => diffStats(lines), [lines])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-faint">
        <span className="font-medium text-muted">{leftLabel}</span>
        <span className="text-border-strong">→</span>
        <span className="font-medium text-muted">{rightLabel}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-success">+{stats.added}</span>
          <span className="text-danger">−{stats.removed}</span>
          <span>{stats.equal} uguali</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-panel px-2 pb-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <p className="p-4 text-faint">Nessuna differenza da mostrare.</p>
        ) : (
          lines.map((line, idx) => (
            <div
              key={idx}
              className={`flex gap-3 rounded px-2 ${
                line.kind === 'added'
                  ? 'bg-success/10 text-success'
                  : line.kind === 'removed'
                    ? 'bg-danger/10 text-danger'
                    : 'text-muted'
              }`}
            >
              <span className="w-8 shrink-0 select-none text-right text-faint">{line.left ?? ''}</span>
              <span className="w-8 shrink-0 select-none text-right text-faint">{line.right ?? ''}</span>
              <span className="shrink-0 select-none">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span>
              <span className="whitespace-pre-wrap break-all">{line.text || ' '}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
