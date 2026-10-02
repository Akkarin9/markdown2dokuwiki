# Markdown ⇄ DokuWiki Converter

Webapp single-page per convertire testo tra **Markdown (con sintassi Obsidian)** e **DokuWiki**, in entrambe le direzioni. Pensata per spostare guide da un vault Obsidian a una DokuWiki aziendale — e ogni tanto il contrario — quindi le estensioni Obsidian sono di prima classe.

**Tutto avviene nel browser: nessun dato lascia la pagina.** Nessun backend, nessuna chiamata di rete durante la conversione.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
```

Altri comandi:

```bash
npm run build      # typecheck (tsc -b) + build di produzione in dist/
npm run build:cli  # bundle della CLI in dist-cli/
npm run preview    # anteprima della build
npm test           # suite Vitest (motore di conversione)
npm run typecheck  # solo controllo dei tipi
```

## Stack

Vite · React 18 · TypeScript (strict) · Tailwind CSS v4 · CodeMirror 6 · Vitest · fflate.

## Architettura

Il **motore di conversione** è separato dalla UI e vive in `src/converters/`:

```
src/converters/
  types.ts       Options, DEFAULT_OPTIONS, ConversionWarning, normalizzazione pagine
  inline.ts      InlineProtector + applicazione protetta delle regole inline
  mdToDoku.ts    Markdown/Obsidian -> DokuWiki
  dokuToMd.ts    DokuWiki -> Markdown/Obsidian
  *.test.ts      test, incluse le suite di round-trip
src/lib/         profili, pulizia, batch/ZIP, anteprima, diff, cronologia, rilevamento plugin
src/cli/cli.ts   CLI `md2doku` / `doku2md`
src/index.ts     entry point pubblico del motore (riusabile come libreria)
obsidian-plugin/ plugin Obsidian che riusa lo stesso motore (bundle con esbuild)
```

📖 **Documentazione tecnica completa: [`docs/architettura.md`](docs/architettura.md)** — il funzionamento passo per passo, le regole di conversione e le decisioni di progetto. Per il plugin Obsidian vedi [`obsidian-plugin/README.md`](obsidian-plugin/README.md).

Ogni motore è una **funzione pura** `(input, options, context?) => { output, warnings }`:

- il documento viene prima segmentato in blocchi tipizzati (frontmatter, code fence, heading, lista, tabella, citazione, paragrafo, math) a livello di riga;
- i **blocchi di codice vengono estratti** e sostituiti da un placeholder, quindi nessuna regola di formattazione li tocca;
- il testo di ogni blocco passa poi per le regole inline, applicate una dopo l'altra con un meccanismo a placeholder (`InlineProtector`) che impedisce a una regola di riscrivere l'output di un'altra.

Non si usano regex a cascata fragili. L'ordine delle regole è fisso e documentato nei due motori.

### Avvisi di conversione

Niente fallisce in silenzio: ogni costrutto senza equivalente diretto produce un avviso con **numero di riga**, mostrato nel pannello "Note di conversione". Le categorie sono `unsupported`, `degraded`, `collision`, `info`.

## Sintassi supportata

### Markdown → DokuWiki

| Markdown | DokuWiki |
| --- | --- |
| `# H1` … `##### H5` | `====== H1 ======` … `== H5 ==` (H6 → H5 con avviso) |
| `**grassetto**` | `**grassetto**` |
| `*corsivo*` / `_corsivo_` | `//corsivo//` |
| `~~barrato~~` | `<del>barrato</del>` |
| `` `codice` `` | `''codice''` |
| `==evidenziato==` | `<fc #ffff00>` (configurabile: `<wrap hi>`, `<mark>`, grassetto) |
| `[testo](url)` | `[[url|testo]]` |
| `![alt](src)` | `{{src|alt}}` |
| tabelle con header e allineamento | `^ header ^` / `\| cella \|` |
| `> citazione`, `---` | `> citazione`, `----` |
| `[^1]` + definizione | `((testo))` |
| `- [ ]` / `- [x]` | `☐` / `☑` |
| ```lang … ``` | `<code lang>…</code>` |
| liste annidate | 2 spazi per livello + `*` / `-` |
| a capo singoli | `\\` a fine riga (opzione attiva di default) |
| codice dentro una lista | `<code>` indentato di 2 spazi per livello (opzione) |

### Estensioni Obsidian

| Obsidian | DokuWiki |
| --- | --- |
| `[[Pagina]]`, `[[Pagina\|alias]]` | `[[namespace:pagina]]` (normalizzato: minuscolo, spazi → `_`, accenti rimossi) |
| `[[Guida/Setup]]` | `[[guida:setup]]` (le `/` di Obsidian sono cartelle → namespace; disattivabile) |
| `[[Pagina#Sezione]]` | `[[ns:pagina#sezione\|Pagina > Sezione]]` |
| `![[img.png]]` | `{{img.png}}` (nome normalizzato) |
| `![[img.png\|300]]` | `{{img.png?300}}` |
| `![[img.png\|didascalia]]` | `{{img.png\|didascalia}}` |
| `![[Nota]]` (transclusione) | `{{page>ns:nota}}` se il plugin include è attivo, altrimenti link + avviso |
| `> [!note] Titolo` | `<note …>` / `<WRAP …>` / citazione HTML (in base alle opzioni) |
| frontmatter YAML | commento `%% … %%` / rimosso / mantenuto |
| `%%commento%%` | rimosso (o conservato) |
| `#tag` | rimosso o riga `{{tag>…}}` |
| Mermaid / Dataview / Tasks / math `$$` | `<code>` con avviso (nessun equivalente senza plugin) |

### DokuWiki → Markdown

Mapping inverso di tutto quanto sopra, più:

- link interni `[[ns:pagina|testo]]` → **wikilink** `[[ns:pagina|testo]]` (namespace mantenuto) oppure link Markdown, in base alle opzioni;
- `<WRAP>` / plugin `note` → callout Obsidian `> [!tipo] Titolo`;
- `<fc>`, `<mark>`, `<wrap hi>` → `==evidenziazione==`;
- tabelle con `^`/`|`, **colspan (`||`) e rowspan (`:::`)** degradati in celle vuote con avviso;
- `{{page>…}}` → `![[…]]`;
- `((footnote))` inline → `[^n]` con le definizioni raccolte in coda;
- macro `~~NOTOC~~`/`~~NOCACHE~~` rimosse con avviso.

## Interfaccia

- Due pannelli affiancati (input/output) con **divisore trascinabile** (frecce `←/→`, `Home`/doppio clic per centrare, limiti 20–80%); su mobile diventano impilati.
- Pulsante **⇄ Inverti direzione** che scambia direzione e contenuto.
- Selettore di direzione **manuale**, con un suggerimento di auto-rilevamento (euristica) se il testo incollato sembra appartenere all'altro formato.
- Conversione **live** con debounce (250 ms).
- Tema **scuro di default** (palette calda, accento viola/indaco) + chiaro/sistema, con toggle; font Inter e JetBrains Mono **self-hosted** (nessuna richiesta a Google Fonts). Il gutter dei numeri di riga segue il tema.
- Toolbar: **Copia output** (pulsante d'accento), menu **File** (carica / batch ZIP / scarica), **Esempio**, **Cancella**; icone per comandi, cronologia, rilevamento plugin, tema e opzioni.
- **Anteprima renderizzata** (toggle Codice/Anteprima): Markdown con markdown-it, DokuWiki con un renderer semplificato.
- **Vista diff** affiancata: incolla la versione già presente sulla wiki e vedi le righe aggiunte/rimosse.
- **Pannello "Note di conversione"** cliccabile: clic su un avviso evidenzia e scorre alla riga nell'editor.
- **Cronologia locale** (IndexedDB, ultime 30 conversioni) con ripristino ed eliminazione.
- **Incolla e copia** (opzione): l'output va negli appunti automaticamente a ogni conversione.
- **Scroll sync** opzionale tra i due pannelli.
- **PWA installabile**, funzionante offline (service worker + manifest).
- **Conversione batch**: carica più file e scarica uno ZIP con la struttura `namespace/pagina.txt`, gli allegati in `media/`, un `LEGGIMI.txt` e un riepilogo delle note.
- **Rilevamento plugin da frammento**: incolla un pezzo di DokuWiki e l'app deduce i plugin in uso per precompilare il profilo.
- **Profili** salvabili (namespace, plugin, stili, pulizia), con creazione/duplicazione/rinomina/eliminazione e import/export JSON, persistiti in `localStorage`.
- **Command palette** (`Ctrl/Cmd+K`).
- Scorciatoie: `Ctrl/Cmd+Shift+C` copia output, `Ctrl/Cmd+Shift+S` inverti, `Ctrl/Cmd+Shift+H` cronologia, `Ctrl/Cmd+Shift+Z` salva nella cronologia.
- Interfaccia in italiano; contrasti AA, focus `:focus-visible`, navigazione da tastiera e `aria-label`.

## Opzioni e profili

Il pannello Opzioni è raggruppato in **Profilo**, **Namespace**, **Callout e plugin**, **Testo e pulizia**, **Estensioni Obsidian**, con brevi descrizioni ed esempi before/after per le opzioni ambigue.

- **Namespace** link e media (vuoti di default).
- **Stile callout**: citazione HTML (fallback senza plugin, default), `<note>`, `<WRAP>`.
- **Stile evidenziazione**: `<fc>` (default), `<wrap hi>`, `<mark>`, grassetto.
- **Codice dentro le liste**: indenta (`indent`, default), `<WRAP code>`, oppure accetta la rottura con avviso.
- **A capo singoli → `\\`** (attivo di default).
- **Pulizia pre-conversione**: rimuove le sezioni Related/backlink, normalizza spazi e righe vuote, aggiunge un H1 dal nome file.
- **Transclusione con plugin include**, frontmatter, tag, commenti, task, stile link interni, preserva cartelle.

I profili si esportano/importano come JSON (`exportProfiles` / `importProfiles`).

## CLI / libreria

Il motore è esportato da `src/index.ts` e riusabile come libreria:

```ts
import { mdToDoku, dokuToMd, DEFAULT_OPTIONS } from 'markdown2dokuwiki'

const { output, warnings } = mdToDoku(markdown, { linkNamespace: 'guide' })
```

CLI per conversioni in massa (cartella → cartella):

```bash
npm run build:cli

node dist-cli/md2doku.mjs <file-o-cartella...> [--out <dir>] [--options <profili.json>]
node dist-cli/doku2md.mjs <file-o-cartella...> [--out <dir>] [--options <profili.json>]
```

- Con una cartella in ingresso, converte ricorsivamente i file con estensione adatta e, senza `--out`, scrive in `<input>/dokuwiki-out` (o `markdown-out`).
- `--options` accetta un file JSON con le opzioni (o un profilo esportato: `{ "options": { … } }`).
- La build produce `dist-cli/md2doku.mjs` e `dist-cli/doku2md.mjs` (bin esposti in `package.json`).

## Test

```bash
npm test                                          # tutti i test
npx vitest run src/converters/mdToDoku.test.ts    # un solo file
npx vitest run -t "round-trip"                    # per nome
```

L'invariante di round-trip testato è **md → doku → md → doku** stabile, incluso il documento demo completo (non l'idempotenza del singolo motore: `#` e i token con `:` hanno significati diversi nei due linguaggi).

Oltre al motore, `src/App.test.tsx` è uno **smoke test dell'interfaccia** (ambiente `happy-dom`) che verifica conversione live, caricamento dell'esempio, cambio direzione, pannello note, opzioni e vista diff.

## Deploy

Esposto su **https://convert.akkarin.org** dietro Traefik (rete Docker `proxy`, resolver Let's Encrypt `cloudflare`).

```bash
docker compose up -d --build   # build dell'immagine + avvio
docker compose logs -f         # log nginx
docker compose down            # arresto
```

- `Dockerfile`: build multi-stage (Node 22 → `npm run build`, poi nginx alpine che serve `dist/`).
- `nginx.conf`: SPA fallback su `index.html`, cache lunga per `/assets/`, `no-cache` per `index.html` e `sw.js`.
- `docker-compose.yml`: label Traefik (`Host(\`convert.akkarin.org\`)`, entrypoint `websecure`, `certresolver=cloudflare`, porta servizio `80`).
- Il container espone solo internamente la porta 80 (nessun `ports:`): il traffico arriva solo via Traefik.

## Limiti noti

- **Nessun plugin DokuWiki installato**: lo stile callout predefinito è una citazione HTML con etichetta in grassetto (più un avviso). `<note>` e `<WRAP>` sono selezionabili nel pannello Opzioni (o suggeriti dal rilevamento plugin).
- **Frontmatter ↔ commenti**: `%%…%%` è sia commento DokuWiki sia commento Obsidian, quindi un frontmatter convertito in commento viene rimosso da una conversione di ritorno (avviso `collision`). Usa l'opzione "Mantieni" se ti serve un round-trip fedele.
- **Blocchi indentati di 2 spazi** in DokuWiki sono ambigui tra blocchi di codice e continuazione di liste: vengono trattati come codice con un avviso.
- **Colspan/rowspan** delle tabelle DokuWiki non hanno equivalente Markdown: degradati in celle vuote.
- **Sottolineato `__x__`** DokuWiki → `<u>x</u>` con avviso (non è Markdown puro). Interwiki e note a piè multi-riga sono resi al meglio.
- **Mermaid, Dataview, Tasks e math `$$`** non hanno equivalente: resi come `<code>` con avviso.
- La build di produzione è divisa in un chunk applicativo (~350 kB) e uno per l'editor CodeMirror (~530 kB) caricato on-demand con `React.lazy`: la shell si mostra subito, l'editor arriva poco dopo.
