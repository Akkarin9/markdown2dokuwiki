/**
 * Caricamento lazy dell'editor CodeMirror.
 *
 * CodeMirror è la dipendenza più pesante dell'app: caricandolo in un chunk
 * separato on-demand, la shell dell'interfaccia si mostra subito e il bundle
 * iniziale resta piccolo. `Suspense` attorno a `LazyEditor` gestisce l'attesa.
 */

import { lazy, Suspense } from 'react'
import type { EditorHandle, EditorProps } from './Editor'

const EditorImpl = lazy(() =>
  import('./Editor').then((mod) => ({ default: mod.Editor })),
)

export const LazyEditor = (
  props: EditorProps & { handleRef?: React.Ref<EditorHandle> },
) => {
  const { handleRef, ...rest } = props
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorImpl ref={handleRef} {...rest} />
    </Suspense>
  )
}

/** Segnaposto mostrato mentre CodeMirror viene scaricato. */
function EditorSkeleton() {
  return (
    <div className="h-full w-full animate-pulse bg-panel" aria-hidden>
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 rounded bg-elevated" />
        <div className="h-3 w-2/3 rounded bg-elevated" />
        <div className="h-3 w-1/2 rounded bg-elevated" />
      </div>
    </div>
  )
}
