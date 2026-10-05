# Markdown ⇄ DokuWiki

**Convertitore bidirezionale tra Markdown (con estensioni Obsidian) e DokuWiki**: un motore di conversione puro e un **plugin per Obsidian** che lo usa direttamente dal vault.

Nato per spostare guide da un vault Obsidian a una DokuWiki aziendale — e ogni tanto il contrario. Per questo le estensioni di Obsidian (wikilink, embed, callout, frontmatter, task, tag) sono trattate come cittadini di prima classe, non come un ripensamento.

**Tutto avviene in locale: nessun dato lascia la macchina.** Nessun backend, nessuna chiamata di rete durante la conversione.

---

## Indice

- [Cosa fa](#cosa-fa)
- [Plugin Obsidian](#plugin-obsidian)
- [Avvio rapido](#avvio-rapido)
- [Sintassi supportata](#sintassi-supportata)
- [Opzioni](#opzioni)
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

Ogni costrutto senza equivalente diretto produce un **avviso con numero di riga**. Le categorie sono `unsupported`, `degraded`, `collision`, `info`.

### Round-trip stabile

L'invariante testato è `md → doku → md → doku`: modificare una nota e ri-esportarla non produce drift. I punti di perdita inevitabili sono tutti segnalati.

---

## Plugin Obsidian

Vive in [`obsidian-plugin/`](obsidian-plugin/) e **bundla il motore da `../src`** con esbuild: nessuna copia da tenere allineata.

- **Pannello laterale** (icona nella barra) con tutti i comandi a un clic, senza cercarli nella palette.
- Converti **la nota corrente** o **la selezione** in DokuWiki; converti una selezione **da** DokuWiki in Markdown.
- **Import da DokuWiki**: incolli un documento, anteprima HTML del Markdown, crea una nuova nota.
- **Esporta la cartella** in `dokuwiki-out/` con la struttura reale `namespace/pagina.txt`, gli **allegati in `media/`**, `LEGGIMI.txt` e report degli avvisi.
- **Profili** di opzioni (crea/duplica/rinomina/elimina, export/import JSON) salvati nel `data.json`.
- **Rilevamento plugin DokuWiki** da un frammento incollato, per precompilare le opzioni.
- **Avvisi cliccabili**: un cenno in una notifica apre l'elenco e ti porta alla riga nell'editor.
- **Menù contestuale** nell'editor, **barra di stato**, e opzione per **aggiornare il file a ogni salvataggio**.
- **Aggiornamento da GitHub**: un pulsante (impostazioni e pannello) scarica e installa l'ultima versione dal repo pubblico, con confronto versione e conferma.
- Impostazioni che mappano 1:1 sulle `Options` del motore, con `versions.json` e CI incluse.

→ Dettagli e istruzioni di installazione in [`obsidian-plugin/README.md`](obsidian-plugin/README.md).

---

## Avvio rapido

Richiede **Node 22+**.

### Motore (test e typecheck)

```bash
git clone https://github.com/Akkarin9/markdown2dokuwiki.git
cd markdown2dokuwiki
npm install
npm test           # 155 test del motore
npm run typecheck  # solo controllo dei tipi
```

### Plugin Obsidian

```bash
cd obsidian-plugin
npm install
npm run build      # typecheck + bundle in main.js
```

Poi copia `main.js`, `manifest.json` e `styles.css` in `<vault>/.obsidian/plugins/md2doku-converter/` e attivalo da **Impostazioni → Plugin della community**. Dettagli in [`obsidian-plugin/README.md`](obsidian-plugin/README.md).

### Usare il motore come libreria

Il motore è composto da funzioni pure, senza DOM né filesystem: puoi importarle direttamente dai sorgenti.

```ts
import { mdToDoku } from './src/converters/mdToDoku'
import { dokuToMd } from './src/converters/dokuToMd'

const { output, warnings } = mdToDoku(markdown, { linkNamespace: 'guide' })
```

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

Le impostazioni del plugin mappano 1:1 sulle `Options` del motore. Le principali:

| Opzione | Default | Perché |
| --- | --- | --- |
| Stile callout | citazione HTML | nessun plugin installato: fallback sicuro |
| Stile evidenziazione | `<fc #ffff00>` | nativo DokuWiki, nessun plugin |
| Frontmatter | commento `%%…%%` | conserva l'informazione |
| A capo singoli → `\\` | attivo | DokuWiki fonde le righe, Obsidian no |
| Codice in liste | indentato | mantiene la numerazione |
| Transclusione (include) | disattiva | il plugin non è assunto |

---

## Architettura

```
src/converters/     il MOTORE (puro, senza dipendenze esterne)
  types.ts            Options, risultati, normalizzazione pagine
  inline.ts           InlineProtector + regole inline protette
  mdToDoku.ts         Markdown/Obsidian → DokuWiki
  dokuToMd.ts         DokuWiki → Markdown/Obsidian
src/lib/            supporto riusabile (batch/ZIP, anteprima, profili, plugin, diff, cronologia)
obsidian-plugin/    plugin Obsidian (bundla ../src via esbuild)
docs/               documentazione tecnica
```

Il motore è una coppia di **funzioni pure** `(input, options, context?) => { output, warnings }`, senza DOM, React o filesystem. Il documento è segmentato in blocchi tipizzati; i **blocchi di codice vengono estratti** e protetti da placeholder; le regole inline sono applicate in **ordine fisso** con un meccanismo (`InlineProtector`) che impedisce a una regola di riscrivere l'output di un'altra. Niente regex a cascata fragili.

📖 **Tutto il funzionamento, passo per passo: [`docs/architettura.md`](docs/architettura.md)** — fasi della conversione, ordine delle regole e perché, sistema di avvisi, decisioni di progetto.

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

**155 test verdi.** Prima di un commit: `npm test` e `npm run typecheck`; per il plugin anche `cd obsidian-plugin && npm run build`.

---

## Limiti noti

- **Nessun plugin DokuWiki assunto**: lo stile callout di default è una citazione HTML con etichetta in grassetto (più avviso). `<note>` e `<WRAP>` si selezionano nelle opzioni.
- **Frontmatter ↔ commenti**: `%%…%%` è commento sia in DokuWiki sia in Obsidian, quindi un frontmatter convertito in commento viene rimosso da una conversione di ritorno (avviso `collision`). Usa "Mantieni" per un round-trip fedele.
- **Blocchi indentati di 2 spazi** in DokuWiki sono ambigui tra codice e continuazione di lista: trattati come codice con avviso.
- **Colspan/rowspan** delle tabelle DokuWiki non hanno equivalente Markdown: degradati in celle vuote.
- **Mermaid, Dataview, Tasks e math `$$`** non hanno equivalente: resi come `<code>` con avviso.
- Nella conversione di una **singola nota** (file accanto alla nota) gli allegati non vengono copiati: restano nel vault e il motore normalizza solo i riferimenti. L'**esportazione di cartella** invece li copia in `media/`.

---

## Licenza

[MIT](LICENSE).
