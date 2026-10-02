# Markdown ⇄ DokuWiki

**Convertitore bidirezionale tra Markdown (con estensioni Obsidian) e DokuWiki**, con un motore di conversione condiviso, una webapp, una CLI e un plugin per Obsidian.

> 🚧 **In prova su [convert.akkarin.org](https://convert.akkarin.org)** — versione funzionante ma in rodaggio: le API e le opzioni possono ancora cambiare.

Nato per spostare guide da un vault Obsidian a una DokuWiki aziendale — e ogni tanto il contrario. Per questo le estensioni di Obsidian (wikilink, embed, callout, frontmatter, task, tag) sono trattate come cittadini di prima classe, non come un ripensamento.

**Tutto avviene in locale: nessun dato lascia la macchina.** Nessun backend, nessuna chiamata di rete durante la conversione.

---

## Indice

- [Cosa fa](#cosa-fa)
- [Tre modi di usarlo](#tre-modi-di-usarlo)
- [Avvio rapido](#avvio-rapido)
- [Caratteristiche](#caratteristiche)
- [Sintassi supportata](#sintassi-supportata)
- [Opzioni](#opzioni)
- [Deploy](#deploy)
- [Architettura](#architettura)
- [Test](#test)
- [Limiti noti](#limiti-noti)

---

## Cosa fa

Trasforma questo Markdown di Obsidian…

```markdown
---
title: Guida sale
---

# Prenotazione sale

Vedi [[Prenotazione Sale|la pagina dedicata]] e ![[planimetria.jpg|400]].

> [!warning] Attenzione
> La sala si libera dopo 10 minuti.

- [x] Login effettuato
- [ ] Scegli la sala

| Sala | Posti |
|:-----|------:|
| Magna | 80 |
```

…in DokuWiki pronto da incollare:

```text
%% title: Guida sale %%

====== Prenotazione sale ======

Vedi [[prenotazione_sale|la pagina dedicata]] e {{planimetria.jpg?400}}.

> **Attenzione**
> La sala si libera dopo 10 minuti.

  * ☑ Login effettuato
  * ☐ Scegli la sala

^ Sala ^  Posti ^
| Magna |  80 |
```

E viceversa, con la stessa fedeltà.

### Niente fallimenti silenziosi

Ogni costrutto senza equivalente diretto produce un **avviso con numero di riga**, mostrato in un pannello cliccabile (e raccolto nei report del batch). Le categorie sono `unsupported`, `degraded`, `collision`, `info`.

### Round-trip stabile

L'invariante testato è `md → doku → md → doku`: modificare una nota e ri-esportarla non produce drift. I punti di perdita inevitabili sono tutti segnalati.

---

## Tre modi di usarlo

| | Come | Dove |
| --- | --- | --- |
| 🌐 **Webapp** | interfaccia a due pannelli con conversione live | [convert.akkarin.org](https://convert.akkarin.org) |
| ⌨️ **CLI** | conversione di intere cartelle da terminale | `md2doku` / `doku2md` |
| 🔌 **Plugin Obsidian** | comandi dentro il vault, senza uscire dall'editor | `obsidian-plugin/` |

Tutti e tre usano **lo stesso motore** (`src/converters/`), quindi si comportano allo stesso modo con le stesse opzioni.

---

## Avvio rapido

Richiede **Node 22+**.

```bash
git clone https://github.com/Akkarin9/markdown2dokuwiki.git
cd markdown2dokuwiki
npm install
npm run dev        # http://localhost:5173
```

Altri comandi:

```bash
npm run build      # typecheck + build di produzione in dist/
npm test           # 161 test (motore + smoke test UI)
npm run typecheck  # solo controllo dei tipi
npm run build:cli  # bundle della CLI in dist-cli/
```

---

## Caratteristiche

### Webapp

- **Due pannelli** affiancati con divisore trascinabile (`←/→`, `Home` per centrare, limiti 20–80%); su mobile si impilano.
- **Conversione live** con debounce (250 ms) e pulsante **⇄ Inverti direzione** che scambia anche il contenuto.
- **Direzione manuale**, con un suggerimento automatico se il testo incollato sembra dell'altro formato.
- **Tema scuro di default** (palette calda, accento viola/indaco) + chiaro/sistema; font Inter e JetBrains Mono **self-hosted** (nessuna richiesta a Google Fonts).
- **Output** commutabile tra **Codice**, **Anteprima** renderizzata e **Diff** affiancata.
- **Note di conversione** cliccabili: il clic scorre ed evidenzia la riga nell'editor.
- **Cronologia locale** (IndexedDB, ultime 30) con ripristino. **Incolla e copia** e **scroll sync** opzionali.
- **Profili** salvabili (namespace, plugin, stili, pulizia) con import/export JSON.
- **Rilevamento plugin** da un frammento di DokuWiki, per precompilare il profilo.
- **Conversione batch**: più file → uno ZIP con `namespace/pagina.txt`, allegati in `media/`, `LEGGIMI.txt` e report degli avvisi.
- **PWA installabile**, funzionante offline.
- Scorciatoie: `Ctrl/Cmd+K` palette, `Ctrl/Cmd+Shift+C` copia, `Ctrl/Cmd+Shift+S` inverti, `Ctrl/Cmd+Shift+H` cronologia.

### Plugin Obsidian

- **Pannello laterale** (icona nella barra) con tutti i comandi a un clic, senza cercarli nella palette.
- Converti **la nota corrente** o **la selezione** in DokuWiki; converti una selezione **da** DokuWiki in Markdown.
- **Import da DokuWiki**: incolli un documento, anteprima live, crea una nuova nota Markdown.
- **Esporta la cartella** in `dokuwiki-out/` con struttura namespace, `LEGGIMI.txt` e report.
- Impostazioni identiche a quelle della webapp.

→ Dettagli in [`obsidian-plugin/README.md`](obsidian-plugin/README.md).

### CLI

```bash
node dist-cli/md2doku.mjs <file-o-cartella...> [--out <dir>] [--options <json>]
node dist-cli/doku2md.mjs  <file-o-cartella...> [--out <dir>] [--options <json>]
```

Con una cartella in ingresso converte ricorsivamente e, senza `--out`, scrive in `<input>/dokuwiki-out` (o `markdown-out`).

---

## Sintassi supportata

### Markdown → DokuWiki

| Markdown | DokuWiki |
| --- | --- |
| `# H1` … `##### H5` | `====== H1 ======` … `== H5 ==` (H6 → H5 con avviso) |
| `**grassetto**` | `**grassetto**` |
| `*corsivo*` / `_corsivo_` | `//corsivo//` |
| `~~barrato~~` | `<del>barrato</del>` |
| `` `codice` `` | `''codice''` |
| `==evidenziato==` | `<fc #ffff00>` (configurabile) |
| `[testo](url)` · `![alt](src)` | `[[url\|testo]]` · `{{src\|alt}}` |
| tabelle con header e allineamento | `^ header ^` / `\| cella \|` |
| `> citazione` · `---` | `> citazione` · `----` |
| `[^1]` + definizione | `((testo))` |
| `- [ ]` / `- [x]` | `☐` / `☑` |
| ```` ```lang … ``` ```` | `<code lang>…</code>` |
| a capo singoli | `\\` a fine riga (opzione, attiva di default) |
| codice dentro una lista | `<code>` indentato (opzione) |

### Estensioni Obsidian

| Obsidian | DokuWiki |
| --- | --- |
| `[[Pagina]]`, `[[Pagina\|alias]]` | `[[namespace:pagina]]` (minuscolo, spazi→`_`, accenti rimossi) |
| `[[Guida/Setup]]` | `[[guida:setup]]` (cartelle → namespace) |
| `[[Pagina#Sezione]]` | `[[ns:pagina#sezione\|Pagina > Sezione]]` |
| `![[img.png]]` · `![[img.png\|300]]` | `{{img.png}}` · `{{img.png?300}}` |
| `![[Nota]]` (transclusione) | `{{page>ns:nota}}` con plugin include, altrimenti link + avviso |
| `> [!note] Titolo` | `<note>` / `<WRAP>` / citazione HTML |
| frontmatter YAML | commento `%%…%%` / rimosso / mantenuto |
| `%%commento%%` · `#tag` | rimossi o convertiti |
| Mermaid / Dataview / math `$$` | `<code>` con avviso |

### DokuWiki → Markdown

Mapping inverso di tutto quanto sopra, più: link interni → wikilink o link Markdown (opzione), `<WRAP>`/`<note>` → callout, `<fc>`/`<mark>`/`<wrap hi>` → `==…==`, `{{page>…}}` → `![[…]]`, footnote inline → `[^n]` con definizioni in coda, colspan/rowspan degradati con avviso.

---

## Opzioni

Raggruppate in **Profilo**, **Namespace**, **Callout e plugin**, **Testo e pulizia**, **Estensioni Obsidian**, con descrizioni ed esempi. Le principali:

| Opzione | Default | Perché |
| --- | --- | --- |
| Stile callout | citazione HTML | nessun plugin installato: fallback sicuro |
| Stile evidenziazione | `<fc #ffff00>` | nativo DokuWiki, nessun plugin |
| Frontmatter | commento `%%…%%` | conserva l'informazione |
| A capo singoli → `\\` | attivo | DokuWiki fonde le righe, Obsidian no |
| Codice in liste | indentato | mantiene la numerazione |
| Transclusione (include) | disattiva | il plugin non è assunto |

---

## Deploy

La webapp è un **sito statico**: dopo il build, sono solo file da servire. Puoi metterla online in tre modi.

### 1. Docker (quello usato per convert.akkarin.org)

Il `Dockerfile` è multi-stage: compila con Node 22 e serve `dist/` con nginx.

```bash
docker compose up -d --build   # build + avvio
docker compose logs -f         # log nginx
docker compose down            # arresto
```

Il `docker-compose.yml` è già configurato per **Traefik** (rete `proxy`, `certresolver=cloudflare`) su `convert.akkarin.org`. Per il tuo dominio cambia **una riga**:

```yaml
traefik.http.routers.markdown2dokuwiki.rule: "Host(`tuo-dominio.example`)"
```

Il container non espone porte all'esterno: il traffico arriva solo dal reverse proxy.

### 2. Qualsiasi hosting statico

```bash
npm run build
# carica il contenuto di dist/ dove vuoi
```

Funziona su Netlify, Vercel, Cloudflare Pages, GitHub Pages, un bucket S3, un nginx qualsiasi. È una SPA senza routing: basta reindirizzare le richieste non trovate a `index.html` (vedi `nginx.conf` per l'esempio).

### 3. Solo in locale

```bash
npm run build && npm run preview   # http://localhost:4173
```

> Il service worker (PWA) si registra **solo in produzione**: in `npm run dev` non c'è cache da invalidare.

### Dopo un aggiornamento

Con Docker basta ricostruire: `docker compose up -d --build`. Il container riparte con la nuova build; gli asset hanno un hash nel nome, quindi la cache del browser non serve versioni vecchie. (`sw.js` è servito con `no-cache` apposta.)

---

## Architettura

```
src/converters/     il MOTORE (puro, senza dipendenze esterne)
  types.ts            Options, risultati, normalizzazione pagine
  inline.ts           InlineProtector + regole inline protette
  mdToDoku.ts         Markdown/Obsidian → DokuWiki
  dokuToMd.ts         DokuWiki → Markdown/Obsidian
src/lib/            supporto: batch/ZIP, anteprima, profili, plugin, diff, cronologia
src/components/     UI React + CodeMirror (caricato lazy)
src/cli/            CLI md2doku / doku2md
src/index.ts        entry point libreria pubblica
obsidian-plugin/    plugin Obsidian (riusa ../src via esbuild)
```

Il motore è una coppia di **funzioni pure** `(input, options, context?) => { output, warnings }`, senza DOM, React o filesystem. Il documento è segmentato in blocchi tipizzati; i **blocchi di codice vengono estratti** e protetti da placeholder; le regole inline sono applicate in **ordine fisso** con un meccanismo (`InlineProtector`) che impedisce a una regola di riscrivere l'output di un'altra. Niente regex a cascata fragili.

📖 **Tutto il funzionamento, passo per passo: [`docs/architettura.md`](docs/architettura.md)** — fasi della conversione, ordine delle regole e perché, sistema di avvisi, decisioni di progetto.

### Usarlo come libreria

```ts
import { mdToDoku, dokuToMd } from 'markdown2dokuwiki'

const { output, warnings } = mdToDoku(markdown, { linkNamespace: 'guide' })
```

---

## Test

```bash
npm test                                        # tutti
npx vitest run src/converters/mdToDoku.test.ts  # un file
npx vitest run -t "round-trip"                  # per nome
```

| File | Copre |
| --- | --- |
| `src/converters/mdToDoku.test.ts` | ogni regola MD → Doku, opzioni, avvisi |
| `src/converters/dokuToMd.test.ts` | ogni regola Doku → MD + round-trip |
| `src/lib/lib.test.ts` | testo, rilevamento, batch, profili, plugin, diff |
| `src/App.test.tsx` | smoke test UI (`happy-dom`) |

**161 test verdi.** Prima di un commit: `npm test` e `npm run typecheck`.

---

## Limiti noti

- **Nessun plugin DokuWiki assunto**: lo stile callout di default è una citazione HTML con etichetta in grassetto (più avviso). `<note>` e `<WRAP>` si selezionano nelle opzioni.
- **Frontmatter ↔ commenti**: `%%…%%` è commento sia in DokuWiki sia in Obsidian, quindi un frontmatter convertito in commento viene rimosso da una conversione di ritorno (avviso `collision`). Usa "Mantieni" per un round-trip fedele.
- **Blocchi indentati di 2 spazi** in DokuWiki sono ambigui tra codice e continuazione di lista: trattati come codice con avviso.
- **Colspan/rowspan** delle tabelle DokuWiki non hanno equivalente Markdown: degradati in celle vuote.
- **Mermaid, Dataview, Tasks e math `$$`** non hanno equivalente: resi come `<code>` con avviso.
- La build separa la shell (~350 kB) dall'editor CodeMirror (~530 kB) caricato on-demand.

---

## Licenza

[MIT](LICENSE).
