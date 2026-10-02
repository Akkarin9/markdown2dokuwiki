import { useEffect, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

interface ToastProps {
  message: string | null
  onDone: () => void
}

/** Toast che si auto-nasconde; segnala anche lo stato "errore". */
export function Toast({ message, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) {
      setVisible(false)
      return undefined
    }
    setVisible(true)
    const id = setTimeout(onDone, 1800)
    return () => clearTimeout(id)
  }, [message, onDone])

  if (!message || !visible) return null
  const isError = message === 'Copia non riuscita'
  const Icon = isError ? AlertTriangle : Check

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-toast-in fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-strong bg-elevated px-4 py-2 text-sm text-text shadow-xl"
    >
      <Icon className={`size-4 ${isError ? 'text-danger' : 'text-success'}`} aria-hidden />
      {message}
    </div>
  )
}
