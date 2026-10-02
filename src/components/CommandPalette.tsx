import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

export interface Command {
  id: string
  label: string
  hint?: string
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  commands: Command[]
  onClose: () => void
}

/** Command palette (Ctrl/Cmd+K) con filtro fuzzy semplice. */
export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) =>
      `${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`.toLowerCase().includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus dopo il mount.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Palette dei comandi"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <button type="button" aria-label="Chiudi la palette" className="absolute inset-0" onClick={onClose} />
      <div className="animate-pop-in relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border-strong bg-elevated shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <Search className="size-4 shrink-0 text-faint" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const cmd = filtered[active]
                if (cmd) {
                  cmd.run()
                  onClose()
                }
              }
            }}
            placeholder="Cerca un comando…"
            aria-label="Cerca un comando"
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-faint">Esc</kbd>
        </div>

        <ul className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">Nessun comando trovato</li>}
          {filtered.map((cmd, idx) => (
            <li key={cmd.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(idx)}
                onClick={() => {
                  cmd.run()
                  onClose()
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  idx === active ? 'bg-accent-soft text-text' : 'text-muted hover:bg-bg'
                }`}
              >
                <span>{cmd.label}</span>
                {cmd.hint && <kbd className="shrink-0 text-[10px] text-faint">{cmd.hint}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
