import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  CircleAlert,
  Copy,
  Download,
  Eye,
  Eraser,
  FileDiff,
  FileUp,
  History,
  Moon,
  Monitor,
  Pencil,
  ScanSearch,
  Settings2,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react'
import { LazyEditor } from './components/LazyEditor'
import { DirectionToggle } from './components/DirectionToggle'
import { OptionsPanel } from './components/OptionsPanel'
import { WarningsPanel } from './components/WarningsPanel'
import { Toast } from './components/Toast'
import { CommandPalette, type Command } from './components/CommandPalette'
import { PluginDetectDialog } from './components/PluginDetectDialog'
import { DiffView } from './components/DiffView'
import { HistoryPanel } from './components/HistoryPanel'
import { mdToDoku } from './converters/mdToDoku'
import { dokuToMd } from './converters/dokuToMd'
import type { ConversionWarning, Direction, Options } from './converters/types'
import { usePersistentSettings } from './lib/useSettings'
import { useDebounced } from './lib/useDebounced'
import { detectFormat } from './lib/detect'
import { EXAMPLE_DOKUWIKI, EXAMPLE_MARKDOWN } from './lib/example'
import { countText, deriveFileName } from './lib/text'
import { renderDoku, renderMarkdown } from './lib/preview'
import { convertBatchToZip, type BatchAttachment } from './lib/batch'
import { addHistoryEntry, clearHistory, deleteHistoryEntry, listHistory, type HistoryEntry } from './lib/history'
import { exportProfiles, importProfiles } from './lib/profiles'
import type { EditorHandle } from './components/Editor'

export default function App() {
  const settings = usePersistentSettings()
  const { options, update, reset, theme, cycleTheme } = settings

  const [direction, setDirection] = useState<Direction>('md-to-doku')
  const [source, setSource] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pluginDetectOpen, setPluginDetectOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [previewOn, setPreviewOn] = useState(false)
  const [diffOn, setDiffOn] = useState(false)
  const [diffBaseline, setDiffBaseline] = useState('')
  const [autoCopy, setAutoCopy] = useState(false)
  const [scrollSync, setScrollSync] = useState(false)
  const [scrollRatio, setScrollRatio] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [warningsDismissed, setWarningsDismissed] = useState(false)
  const [splitPct, setSplitPct] = useState(50)
  const [batchBusy, setBatchBusy] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const draggingRef = useRef(false)
  const sourceEditorRef = useRef<EditorHandle>(null)

  const debouncedSource = useDebounced(source, 250)

  const { output, warnings } = useMemo(() => {
    if (debouncedSource.trim() === '') return { output: '', warnings: [] as ConversionWarning[] }
    return direction === 'md-to-doku'
      ? mdToDoku(debouncedSource, options)
      : dokuToMd(debouncedSource, options)
  }, [debouncedSource, direction, options])

  const detected = useMemo(() => detectFormat(debouncedSource)?.direction ?? null, [debouncedSource])
  const sourceStats = countText(source)
  const outputStats = countText(output)

  // Un nuovo testo riconverte: le note tornano visibili.
  useEffect(() => setWarningsDismissed(false), [debouncedSource, direction, options])

  const showToast = useCallback((message: string) => setToast(message), [])

  // Carica la cronologia quando il pannello si apre.
  useEffect(() => {
    if (!historyOpen) return
    void listHistory().then(setHistory)
  }, [historyOpen])

  // "Incolla e copia": quando l'output cambia e l'opzione è attiva, copia.
  const lastCopiedRef = useRef('')
  useEffect(() => {
    if (!autoCopy) return
    if (output === '' || output === lastCopiedRef.current) return
    lastCopiedRef.current = output
    void navigator.clipboard.writeText(output).then(
      () => showToast('Output copiato'),
      () => undefined,
    )
  }, [autoCopy, output, showToast])

  const handleSwap = useCallback(() => {
    setDirection((d) => (d === 'md-to-doku' ? 'doku-to-md' : 'md-to-doku'))
    // Scambia anche il contenuto: l'output diventa il nuovo input.
    setSource((prev) => output || prev)
  }, [output])

  const handleCopy = useCallback(async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      showToast('Copiato!')
    } catch {
      showToast('Copia non riuscita')
    }
  }, [output, showToast])

  const download = useCallback((blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleDownload = useCallback(() => {
    if (!output) return
    download(new Blob([output], { type: 'text/plain;charset=utf-8' }), deriveFileName(source || output, direction))
    showToast('File scaricato')
  }, [download, direction, output, source, showToast])

  // Salva la conversione corrente nella cronologia.
  const saveToHistory = useCallback(async () => {
    if (!output.trim()) return
    await addHistoryEntry({
      at: Date.now(),
      direction,
      input: source,
      output,
      label: deriveFileName(source || output, direction),
    })
    if (historyOpen) setHistory(await listHistory())
  }, [direction, historyOpen, output, source])

  const handleLoadExample = useCallback(() => {
    setSource(direction === 'md-to-doku' ? EXAMPLE_MARKDOWN : EXAMPLE_DOKUWIKI)
    showToast('Esempio caricato')
  }, [direction, showToast])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const batchInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setSource(await file.text())
  }, [])

  const handleBatch = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setBatchBusy(true)
      try {
        const mediaRe = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|ogv|mov|ogg|mp3|wav|flac|m4a|pdf)$/i
        const docs: Array<{ name: string; content: string }> = []
        const attachments: BatchAttachment[] = []
        for (const file of files) {
          if (mediaRe.test(file.name)) {
            attachments.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })
          } else {
            docs.push({ name: file.name, content: await file.text() })
          }
        }
        const { blob, report } = convertBatchToZip(docs, direction, options, { attachments })
        download(blob, `conversione-${direction === 'md-to-doku' ? 'dokuwiki' : 'markdown'}.zip`)
        const extra = report.attachments.length > 0 ? ` + ${report.attachments.length} allegati` : ''
        showToast(`${docs.length} file convertiti${extra}`)
      } catch {
        showToast('Conversione batch non riuscita')
      } finally {
        setBatchBusy(false)
      }
    },
    [direction, download, options, showToast],
  )

  // Scorciatoie da tastiera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void handleCopy()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSwap()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setHistoryOpen((v) => !v)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void saveToHistory()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleCopy, handleSwap, saveToHistory])

  // Divisore ridimensionabile: percentuale del pannello sinistro.
  const setSplitFromClientX = useCallback((clientX: number) => {
    const el = mainRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setSplitPct(Math.min(80, Math.max(20, pct)))
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
      setSplitFromClientX(e.clientX)
    }
    const onUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [setSplitFromClientX])

  const startDrag = useCallback(() => {
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const sourceLanguage = direction === 'md-to-doku' ? 'markdown' : 'dokuwiki'
  const outputLanguage = direction === 'md-to-doku' ? 'dokuwiki' : 'markdown'

  // B5: portano alla riga interessata nell'editor di input.
  const handleWarningClick = useCallback((line: number) => {
    sourceEditorRef.current?.scrollToLine(line)
  }, [])

  // B6: HTML dell'anteprima, rigenerato dal debounce (non da ogni tasto).
  const previewHtml = useMemo(() => {
    if (!previewOn || output.trim() === '') return ''
    return outputLanguage === 'markdown' ? renderMarkdown(output) : renderDoku(output)
  }, [previewOn, output, outputLanguage])

  const commands: Command[] = useMemo(
    () => [
      { id: 'copy', label: 'Copia output', hint: 'Ctrl+Shift+C', run: () => void handleCopy() },
      { id: 'download', label: 'Scarica file', run: handleDownload },
      { id: 'example', label: 'Carica esempio', keywords: 'demo', run: handleLoadExample },
      { id: 'clear', label: 'Cancella input', keywords: 'svuota reset', run: () => setSource('') },
      { id: 'swap', label: 'Inverti direzione e contenuto', hint: 'Ctrl+Shift+S', run: handleSwap },
      { id: 'preview', label: previewOn ? 'Nascondi anteprima' : 'Mostra anteprima', run: () => setPreviewOn((v) => !v) },
      { id: 'diff', label: diffOn ? 'Nascondi diff' : 'Mostra diff', run: () => setDiffOn((v) => !v) },
      {
        id: 'save-history',
        label: 'Salva nella cronologia',
        hint: 'Ctrl+Shift+Z',
        run: () => void saveToHistory(),
      },
      { id: 'history', label: 'Apri cronologia', hint: 'Ctrl+Shift+H', run: () => setHistoryOpen(true) },
      {
        id: 'autocopy',
        label: autoCopy ? 'Disattiva "incolla e copia"' : 'Attiva "incolla e copia"',
        run: () => setAutoCopy((v) => !v),
      },
      {
        id: 'scrollsync',
        label: scrollSync ? 'Disattiva scroll sync' : 'Attiva scroll sync',
        run: () => setScrollSync((v) => !v),
      },
      { id: 'options', label: 'Apri opzioni', run: () => setOptionsOpen(true) },
      { id: 'plugins', label: 'Rileva plugin da frammento…', run: () => setPluginDetectOpen(true) },
      {
        id: 'theme',
        label: `Tema: ${theme === 'dark' ? 'scuro' : theme === 'light' ? 'chiaro' : 'sistema'} (cambia)`,
        run: cycleTheme,
      },
      { id: 'batch', label: 'Conversione batch (ZIP)…', run: () => batchInputRef.current?.click() },
      {
        id: 'dir-md',
        label: 'Direzione: MD → Doku',
        run: () => setDirection('md-to-doku'),
      },
      {
        id: 'dir-doku',
        label: 'Direzione: Doku → MD',
        run: () => setDirection('doku-to-md'),
      },
    ],
    [
      autoCopy,
      cycleTheme,
      diffOn,
      handleCopy,
      handleDownload,
      handleLoadExample,
      handleSwap,
      previewOn,
      saveToHistory,
      scrollSync,
      theme,
    ],
  )

  const [fileMenuOpen, setFileMenuOpen] = useState(false)

  const toolbarButtons = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={handleCopy}
        disabled={!output}
        title="Copia output (Ctrl/Cmd+Shift+C)"
        aria-label="Copia output"
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Copy className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Copia</span>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setFileMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={fileMenuOpen}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-2 text-xs font-medium text-muted transition hover:border-border-strong hover:text-text"
        >
          <FileUp className="size-3.5" aria-hidden />
          <span className="hidden md:inline">File</span>
        </button>
        {fileMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Chiudi menu File"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setFileMenuOpen(false)}
            />
            <div
              role="menu"
              className="animate-pop-in absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-panel py-1 shadow-2xl"
            >
              <MenuItem
                icon={FileUp}
                label="Carica file…"
                onClick={() => {
                  setFileMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              />
              <MenuItem
                icon={Upload}
                label="Carica in batch (ZIP)…"
                onClick={() => {
                  setFileMenuOpen(false)
                  batchInputRef.current?.click()
                }}
                disabled={batchBusy}
              />
              <MenuItem
                icon={Download}
                label="Scarica output"
                onClick={() => {
                  setFileMenuOpen(false)
                  handleDownload()
                }}
                disabled={!output}
              />
            </div>
          </>
        )}
      </div>

      <ToolButton onClick={handleLoadExample} icon={Sparkles} label="Esempio" />
      <ToolButton onClick={() => setSource('')} icon={Eraser} label="Cancella" disabled={!source} />
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,.doku,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
      <input
        ref={batchInputRef}
        type="file"
        multiple
        accept=".md,.markdown,.txt,.doku,text/plain"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          void handleBatch(files)
          e.target.value = ''
        }}
      />

      {/* Intestazione */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-sm font-bold text-accent">
            MD
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Markdown ⇄ DokuWiki</h1>
            <p className="hidden text-[11px] text-faint sm:block">Tutto nel browser · nessun dato lascia la pagina</p>
          </div>
        </div>

        <DirectionToggle direction={direction} onChange={setDirection} onSwap={handleSwap} detected={detected} />

        <div className="flex items-center gap-1.5">
          {toolbarButtons}
          <IconButton
            onClick={() => setPaletteOpen(true)}
            icon={Pencil}
            label="Comandi (Ctrl/Cmd+K)"
            srLabel="Apri la palette dei comandi"
          />
          <IconButton
            onClick={() => setHistoryOpen(true)}
            icon={History}
            label="Cronologia (Ctrl/Cmd+Shift+H)"
            srLabel="Apri la cronologia"
          />
          <IconButton
            onClick={() => setPluginDetectOpen(true)}
            icon={ScanSearch}
            label="Rileva plugin da un frammento"
            srLabel="Rileva plugin DokuWiki"
          />
          <IconButton
            onClick={cycleTheme}
            icon={theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor}
            label={`Tema: ${theme === 'dark' ? 'scuro' : theme === 'light' ? 'chiaro' : 'sistema'}`}
            srLabel="Cambia tema"
          />
          <IconButton onClick={() => setOptionsOpen(true)} icon={Settings2} label="Opzioni" srLabel="Apri opzioni" />
        </div>
      </header>

      {/* Pannelli: su desktop colonne ridimensionabili, su mobile impilate. */}
      <main ref={mainRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className="flex min-h-0 flex-1 flex-col border-b border-border lg:flex-none lg:border-b-0"
          style={{ flexBasis: `${splitPct}%` }}
        >
          <PaneHeader
            title={direction === 'md-to-doku' ? 'Markdown (Obsidian)' : 'DokuWiki'}
            badge="Input"
          />
          <DropZone onFile={handleFile}>
            <LazyEditor
              handleRef={sourceEditorRef}
              value={source}
              language={sourceLanguage}
              onChange={setSource}
              ariaLabel="Editor di input"
              scrollRatio={scrollSync ? scrollRatio : undefined}
              onScrollRatio={scrollSync ? setScrollRatio : undefined}
            />
          </DropZone>
        </section>

        <Divider splitPct={splitPct} onStartDrag={startDrag} onNudge={setSplitPct} />

        <section className="flex min-h-0 flex-col lg:flex-1">
          <PaneHeader
            title={direction === 'md-to-doku' ? 'DokuWiki' : 'Markdown (Obsidian)'}
            badge={diffOn ? 'Diff' : previewOn ? 'Anteprima' : 'Output'}
            readOnlyHint={!previewOn && !diffOn}
            action={
              <div className="flex items-center gap-1">
                <PaneToggle
                  active={diffOn}
                  icon={FileDiff}
                  label="Diff"
                  onClick={() => {
                    setDiffOn((v) => !v)
                    if (!diffOn) setPreviewOn(false)
                  }}
                />
                <PaneToggle
                  active={previewOn}
                  icon={Eye}
                  label="Anteprima"
                  onClick={() => {
                    setPreviewOn((v) => !v)
                    if (!previewOn) setDiffOn(false)
                  }}
                />
              </div>
            }
          />
          <div className="relative min-h-0 flex-1 bg-panel">
            {diffOn ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border px-4 py-2">
                  <label className="flex flex-col gap-1 text-[11px] text-faint">
                    Versione precedente da confrontare
                    <textarea
                      value={diffBaseline}
                      onChange={(e) => setDiffBaseline(e.target.value)}
                      rows={3}
                      placeholder="Incolla qui la versione già presente sulla wiki…"
                      className="w-full resize-y rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-xs text-text outline-none transition focus:border-accent"
                    />
                  </label>
                </div>
                <div className="min-h-0 flex-1">
                  <DiffView left={diffBaseline} right={output} />
                </div>
              </div>
            ) : previewOn ? (
              <div
                className="prose-preview h-full overflow-y-auto px-5 py-4 text-sm leading-relaxed"
                // Il ramo DokuWiki esegue l'escape di tutto (nessun HTML non fidato);
                // il ramo Markdown usa markdown-it con `html: false`.
                dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="pv-empty">L\'anteprima appare qui</p>' }}
              />
            ) : output ? (
              <LazyEditor
                value={output}
                language={outputLanguage}
                onChange={() => undefined}
                ariaLabel="Editor di output"
                readOnly
                scrollRatio={scrollSync ? scrollRatio : undefined}
                onScrollRatio={scrollSync ? setScrollRatio : undefined}
              />
            ) : (
              <EmptyState />
            )}
          </div>
        </section>
      </main>

      {/* Barra di stato */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-panel px-4 py-2 text-[11px] text-faint">
        <div className="flex items-center gap-3">
          <span>
            Input: {sourceStats.lines} righe · {sourceStats.chars} caratteri
          </span>
          <span className="text-border-strong">|</span>
          <span>
            Output: {outputStats.lines} righe · {outputStats.chars} caratteri
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            label="Incolla e copia"
            checked={autoCopy}
            onChange={() => setAutoCopy((v) => !v)}
            title="Copia l'output negli appunti automaticamente a ogni conversione"
          />
          <Toggle
            label="Scroll sync"
            checked={scrollSync}
            onChange={() => setScrollSync((v) => !v)}
            title="Allinea lo scorrimento dei due pannelli"
          />
          {warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setWarningsDismissed(false)}
              className="flex items-center gap-1.5 text-warning transition hover:brightness-110"
            >
              <CircleAlert className="size-3.5" aria-hidden />
              {warnings.length} {warnings.length === 1 ? 'nota' : 'note'} di conversione
            </button>
          )}
          <span className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Direzione</span>
            <span className="font-medium text-muted">
              {direction === 'md-to-doku' ? 'MD → Doku' : 'Doku → MD'}
            </span>
            {detected && detected === direction && <span className="text-success">· rilevata</span>}
          </span>
        </div>
      </footer>

      {warnings.length > 0 && !warningsDismissed && (
        <WarningsPanel warnings={warnings} onClose={() => setWarningsDismissed(true)} onJump={handleWarningClick} />
      )}

      <OptionsPanel
        open={optionsOpen}
        options={options}
        onChange={update}
        onReset={reset}
        onClose={() => setOptionsOpen(false)}
        profiles={settings.profiles}
        activeProfileId={settings.activeProfileId}
        onApplyProfile={settings.applyProfile}
        onCreateProfile={() => settings.addProfile(`Profilo ${settings.profiles.length}`)}
        onDeleteProfile={settings.removeProfile}
        onRenameProfile={settings.renameProfile}
        onDuplicateProfile={settings.copyProfile}
        onSaveToProfile={() => {
          settings.saveToActiveProfile()
          showToast('Profilo aggiornato')
        }}
        onExportProfiles={() => exportProfiles(settings.profiles)}
        onImportProfiles={(json) => {
          const imported = importProfiles(json)
          if (!imported) return false
          settings.replaceProfiles(imported)
          return true
        }}
        onOpenPluginDetect={() => {
          setOptionsOpen(false)
          setPluginDetectOpen(true)
        }}
      />

      <PluginDetectDialog
        open={pluginDetectOpen}
        onClose={() => setPluginDetectOpen(false)}
        onApply={(suggestion) => {
          for (const [key, value] of Object.entries(suggestion)) {
            update(key as keyof Options, value as never)
          }
          showToast('Opzioni aggiornate dai plugin rilevati')
        }}
      />

      <HistoryPanel
        open={historyOpen}
        entries={history}
        onClose={() => setHistoryOpen(false)}
        onRestore={(entry) => {
          setDirection(entry.direction)
          setSource(entry.input)
          setHistoryOpen(false)
        }}
        onDelete={(id) => void deleteHistoryEntry(id).then(() => setHistory((h) => h.filter((e) => e.id !== id)))}
        onClear={() => void clearHistory().then(() => setHistory([]))}
      />

      {optionsOpen && (
        <button
          type="button"
          aria-label="Chiudi opzioni"
          onClick={() => setOptionsOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        />
      )}

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function Divider({
  splitPct,
  onStartDrag,
  onNudge,
}: {
  splitPct: number
  onStartDrag: () => void
  onNudge: (updater: (prev: number) => number) => void
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ridimensiona i pannelli"
      aria-valuenow={Math.round(splitPct)}
      aria-valuemin={20}
      aria-valuemax={80}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault()
        onStartDrag()
      }}
      onDoubleClick={() => onNudge(() => 50)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onNudge((p) => Math.max(20, p - step))
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          onNudge((p) => Math.min(80, p + step))
        } else if (e.key === 'Home') {
          e.preventDefault()
          onNudge(() => 50)
        }
      }}
      className="group relative hidden shrink-0 cursor-col-resize touch-none items-center justify-center border-border bg-bg lg:flex lg:w-2 lg:border-x hover:bg-accent-soft"
      title="Trascina per ridimensionare · doppio clic per centrare"
    >
      <span className="pointer-events-none h-9 w-1 rounded-full bg-border-strong transition group-hover:bg-accent" />
    </div>
  )
}

function PaneHeader({
  title,
  badge,
  readOnlyHint,
  action,
}: {
  title: string
  badge: string
  readOnlyHint?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] text-faint">{badge}</span>
        {readOnlyHint && <span className="text-[11px] text-faint">sola lettura</span>}
      </div>
      {action}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-elevated text-faint">
        <ArrowLeftRight className="size-5" aria-hidden />
      </div>
      <p className="text-sm text-muted">L'output appare qui</p>
      <p className="max-w-xs text-xs text-faint">
        Scrivi o incolla del testo nel pannello di sinistra, oppure carica un file o prova l'esempio.
      </p>
    </div>
  )
}

function DropZone({ onFile, children }: { onFile: (file: File) => void; children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className="relative min-h-0 flex-1 bg-panel"
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft text-sm font-medium text-accent">
          Rilascia il file per caricarlo
        </div>
      )}
    </div>
  )
}

function IconButton({
  onClick,
  icon: Icon,
  label,
  srLabel,
}: {
  onClick: () => void
  icon: typeof Copy
  label: string
  srLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={srLabel}
      className="rounded-lg border border-border bg-bg p-2 text-muted transition hover:border-border-strong hover:text-text"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

function ToolButton({
  onClick,
  icon: Icon,
  label,
  hotkey,
  disabled,
}: {
  onClick: () => void
  icon: typeof Copy
  label: string
  hotkey?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hotkey ? `${label} (${hotkey})` : label}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-2 text-xs font-medium text-muted transition hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Copy
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted transition hover:bg-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  )
}

function PaneToggle({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Copy
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition ${
        active ? 'bg-accent-soft text-accent' : 'text-faint hover:text-text'
      }`}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string
  checked: boolean
  onChange: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      onClick={onChange}
      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition ${
        checked ? 'border-accent bg-accent-soft text-accent' : 'border-border text-faint hover:text-text'
      }`}
    >
      <span className={`size-1.5 rounded-full ${checked ? 'bg-accent' : 'bg-border-strong'}`} />
      {label}
    </button>
  )
}
