import { ArrowLeftRight } from 'lucide-react'
import type { Direction } from '../converters/types'

interface DirectionToggleProps {
  direction: Direction
  onChange: (direction: Direction) => void
  onSwap: () => void
  detected: Direction | null
}

/**
 * Selettore manuale della direzione. Se il rilevatore euristico suggerisce
 * una direzione diversa, mostra un suggerimento (non cambia da solo).
 */
export function DirectionToggle({ direction, onChange, onSwap, detected }: DirectionToggleProps) {
  const isMdToDoku = direction === 'md-to-doku'
  const suggest = detected !== null && detected !== direction

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Direzione di conversione"
          className="inline-flex rounded-full border border-border bg-panel p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={isMdToDoku}
            onClick={() => onChange('md-to-doku')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              isMdToDoku ? 'bg-accent text-white' : 'text-muted hover:text-text'
            }`}
          >
            MD → Doku
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!isMdToDoku}
            onClick={() => onChange('doku-to-md')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              !isMdToDoku ? 'bg-accent text-white' : 'text-muted hover:text-text'
            }`}
          >
            Doku → MD
          </button>
        </div>

        <button
          type="button"
          onClick={onSwap}
          aria-label="Inverti direzione e contenuto"
          title="Inverti direzione e contenuto (Ctrl/Cmd+Shift+S)"
          className="group rounded-full border border-border bg-panel p-2 text-muted transition hover:border-border-strong hover:text-accent active:scale-95"
        >
          <ArrowLeftRight
            className={`size-4 transition-transform duration-300 ${isMdToDoku ? '' : 'rotate-180'}`}
            aria-hidden
          />
        </button>
      </div>

      {suggest && (
        <button
          type="button"
          onClick={() => onChange(detected)}
          className="animate-pop-in rounded-full bg-accent-soft px-2.5 py-1 text-[11px] text-accent transition hover:bg-accent/20"
        >
          Sembra {detected === 'md-to-doku' ? 'Markdown' : 'DokuWiki'} · passa a{' '}
          {detected === 'md-to-doku' ? 'MD → Doku' : 'Doku → MD'}
        </button>
      )}
    </div>
  )
}
