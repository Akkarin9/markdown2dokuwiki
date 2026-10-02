import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, Compartment, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  type DecorationSet,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { dokuwiki, sharedHighlighting } from '../editor/dokuLanguage'

export type EditorLanguage = 'markdown' | 'dokuwiki'

const languageCompartment = new Compartment()
const ariaCompartment = new Compartment()

/** Effetto per evidenziare temporaneamente una riga (salto da un avviso). */
const setHighlight = StateEffect.define<number | null>()
const highlightMark = Decoration.line({ class: 'cm-jump-highlight' })
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        if (e.value === null) return Decoration.none
        const lineNo = Math.min(Math.max(1, e.value), tr.state.doc.lines)
        const line = tr.state.doc.line(lineNo)
        return Decoration.set([highlightMark.range(line.from)])
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

export interface EditorHandle {
  /** Scorre alla riga (1-based) e la evidenzia brevemente. */
  scrollToLine: (line: number) => void
}

export interface EditorProps {
  value: string
  language: EditorLanguage
  onChange: (value: string) => void
  ariaLabel: string
  readOnly?: boolean
  /** Riceve il rapporto di scorrimento (0–1) quando l'utente scorre. */
  onScrollRatio?: (ratio: number) => void
  /** Quando cambia, scorre al rapporto indicato (0–1). Usato per lo scroll sync. */
  scrollRatio?: number
}

/** Editor CodeMirror 6 controllato da React (una sola istanza per pannello). */
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, language, onChange, ariaLabel, readOnly = false, onScrollRatio, scrollRatio },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onScrollRatioRef = useRef(onScrollRatio)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  onChangeRef.current = onChange
  onScrollRatioRef.current = onScrollRatio

  useImperativeHandle(ref, () => ({
    scrollToLine(line: number) {
      const view = viewRef.current
      if (!view) return
      const lineNo = Math.min(Math.max(1, line), view.state.doc.lines)
      const info = view.state.doc.line(lineNo)
      view.dispatch({
        selection: { anchor: info.from },
        effects: [EditorView.scrollIntoView(info.from, { y: 'center' }), setHighlight.of(lineNo)],
      })
      view.focus()
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => {
        viewRef.current?.dispatch({ effects: setHighlight.of(null) })
      }, 1600)
    },
  }))

  // Crea la view una sola volta.
  useEffect(() => {
    if (!hostRef.current) return undefined

    const theme = EditorView.theme({
      '&': { height: '100%', fontSize: '13.5px' },
      '.cm-content': { minHeight: '100%' },
      // Gutter coerente col tema: la base di CodeMirror imposta uno sfondo
      // chiaro che "bucava" il tema scuro.
      '.cm-gutters': {
        backgroundColor: 'var(--c-panel)',
        borderRight: '1px solid var(--c-border)',
        color: 'var(--c-faint)',
      },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--c-muted)' },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 10px' },
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        sharedHighlighting,
        highlightField,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        languageCompartment.of(markdown()),
        ...(readOnly ? [EditorState.readOnly.of(true)] : []),
        ariaCompartment.of(
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' }),
        ),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          scroll: (_event, view) => {
            const scroller = view.scrollDOM
            const max = scroller.scrollHeight - scroller.clientHeight
            onScrollRatioRef.current?.(max > 0 ? scroller.scrollTop / max : 0)
            return false
          },
        }),
        theme,
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincronizza modifiche esterne (esempio, inversione, caricamento file).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  // Cambia linguaggio senza ricreare la view.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const extension: Extension = language === 'dokuwiki' ? dokuwiki() : markdown()
    view.dispatch({ effects: languageCompartment.reconfigure(extension) })
  }, [language])

  // Aggiorna aria-label se cambia.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: ariaCompartment.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' }),
      ),
    })
  }, [ariaLabel])

  // Scroll sync: applica il rapporto richiesto dall'esterno.
  useEffect(() => {
    const view = viewRef.current
    if (!view || scrollRatio === undefined) return
    const scroller = view.scrollDOM
    const max = scroller.scrollHeight - scroller.clientHeight
    if (max <= 0) return
    const target = Math.round(scrollRatio * max)
    // Evita di rimbalzare sull'editor che ha originato lo scroll.
    if (Math.abs(scroller.scrollTop - target) > 2) scroller.scrollTop = target
  }, [scrollRatio])

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />
})
