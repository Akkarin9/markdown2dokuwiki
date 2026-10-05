# Architettura e funzionamento — Markdown ⇄ DokuWiki

Documento tecnico del progetto: spiega come è strutturato, come avviene la conversione passo per passo, quali regole vengono applicate e perché. Le specifiche di partenza sono state implementate per intero (piano in `prompt.md`/`fase2.md`, non più nel repository); questo documento descrive *l'implementazione*.

---

## 1. Visione d'insieme

L'applicazione converte testo tra due formati in entrambe le direzioni:

- **Markdown con estensioni Obsidian** (wikilink, embed, callout, frontmatter, task, `%%commenti%%`, tag)
- **DokuWiki** (heading `=`, `//corsivo//`, `''mono''`, `<code>`, tabelle `^`/`|`, `((footnote))`, plugin WRAP/note)

Un solo consumatore del motore:

| Consumatore | Dove | Cosa fa |
| --- | --- | --- |
| **Plugin Obsidian** | `obsidian-plugin/` | Comandi sul vault (nota, selezione, cartella) e import da DokuWiki |

Principi di progetto:

1. **Il motore è puro e separato dalla UI.** Non conosce DOM, React, Obsidian o filesystem. È una coppia di funzioni `(input, options, context?) => { output, warnings }`.
2. **Tutto avviene in locale.** Nessun dato lascia la macchina: nessun backend, nessuna chiamata di rete durante la conversione.
3. **Niente fallisce in silenzio.** Ogni costrutto senza equivalente diretto produce un avviso con numero di riga.

---

## 2. Struttura del repository

```
src/
  converters/            ← IL MOTORE (puro, senza dipendenze esterne)
    types.ts               Options, DEFAULT_OPTIONS, ConversionResult, normalizzazione pagine
    inline.ts              InlineProtector + applicazione protetta delle regole inline
    mdToDoku.ts            Markdown/Obsidian → DokuWiki
    dokuToMd.ts            DokuWiki → Markdown/Obsidian
    *.test.ts              test del motore e round-trip
  lib/                   ← SUPPORTO riusabile (puro dove possibile)
    batch.ts               piano di conversione multipla + ZIP + report
    preview.ts             rendering HTML approssimato dell'output
    profiles.ts            profili di opzioni (export/import JSON)
    plugins.ts             rilevamento plugin DokuWiki da un frammento
    diff.ts                diff a livello di riga (LCS)
    history.ts             cronologia conversioni in IndexedDB
    detect.ts              euristica di rilevamento formato
    text.ts                contatori, slug, nome file
    example.ts             documenti demo
obsidian-plugin/         ← PLUGIN OBSIDIAN (bundla ../src via esbuild)
docs/                    ← questa documentazione
```

---

## 3. Architettura del motore

Il motore è composto da **funzioni pure**. Nessuna dipendenza esterna, nessuno stato globale, nessun effetto collaterale.

```ts
mdToDoku(input: string, options?: Partial<Options>, context?: ConversionContext): ConversionResult
dokuToMd(input: string, options?: Partial<Options>): ConversionResult

interface ConversionResult {
  output: string
  warnings: ConversionWarning[]   // { line, kind, message }
}
```

### 3.1 Perché non le regex a cascata

L'approccio "sostituisci con una serie di `replace`" è fragile: una regola può riscrivere l'output di un'altra (il corsivo mangia un asterisco del grassetto, una sostituzione crea per caso la sintassi della regola successiva…). Il motore evita questo con **due livelli di protezione**:

1. **A livello di blocco** i blocchi di codice vengono *estratti* e sostituiti da un placeholder prima che qualunque regola di formattazione li veda.
2. **A livello inline** ogni match viene sostituito da un placeholder opaco durante l'applicazione delle regole, e ripristinato solo alla fine.

### 3.2 Le fasi della conversione (`mdToDoku`)

```
input
  │
  ├─ 1. normalizzazione          CRLF → LF
  ├─ 2. pulizia opzionale        rimozione sezioni Related, normalizzazione spazi/vuote
  ├─ 3. pre-pass footnote        estrae [^label]: testo  →  Map, righe svuotate
  ├─ 4. pre-pass frontmatter     --- … ---  →  commento / rimozione / keep
  ├─ 5. segmentazione in blocchi frontmatter? fence? math? heading? hr? tabella? lista? citazione? paragrafo
  ├─ 6. estrazione del codice    ogni fence → segmento, al suo posto un placeholder
  ├─ 7. scansione HTML           avvisa sui tag senza equivalente
  ├─ 8. rendering per blocco     ogni blocco → convertInline con regole protette
  ├─ 9. coda                     tag raccolti, definizioni footnote
  └─ 10. assemblaggio            join con righe vuote, trim finale
output + warnings
```

**Passo 3 — footnote.** Le definizioni `[^label]: testo` vengono estratte in una `Map` e le righe corrispondenti *svuotate* (non rimosse), così i numeri di riga degli avvisi restano allineati al sorgente. Il riferimento inline `[^label]` diventa `((testo))`.

**Passo 4 — frontmatter.** Il blocco `--- … ---` in testa è gestito secondo `options.frontmatter`:
- `remove`: eliminato;
- `comment` (default): ogni riga diventa `%% riga %%` — con un avviso `collision`, perché `%%…%%` è sia commento DokuWiki sia commento Obsidian e una conversione di ritorno lo eliminerebbe;
- `keep`: mantenuto com'è.

**Passo 5 — segmentazione.** Il documento viene diviso in blocchi tipizzati a livello di riga (`Block`). I tipi sono `code`, `heading`, `hr`, `list`, `table`, `quote`, `paragraph`. Riconoscere il tipo *prima* di convertire evita che le regole inline tocchino strutture che non lo devono essere (una riga di tabella non è un paragrafo).

**Passo 6 — protezione del codice.** Ogni fence (```` ``` ```` o `~~~`) viene:
- aperta con un'individuazione del linguaggio;
- raccolta fino alla chiusura (o a fine documento, con avviso);
- salvata in un array `segments[]`;
- sostituita nel flusso da un indice di segmento.

Da qui in poi nulla può toccare il contenuto del codice. Lo stesso vale per il codice *dentro le liste* (vedi §5.6) e per i blocchi matematici `$$`.

**Passo 8 — rendering inline.** Ogni blocco di testo passa per `convertInline`, che applica le regole in **ordine fisso** (vedi §5).

### 3.3 Le fasi della conversione (`dokuToMd`)

Speculare, con due differenze:

- `<code>`/`<file>`, `<WRAP>`/plugin `note` e i blocchi di codice indentati vengono estratti in segmenti *prima* del rendering.
- Le definizioni footnote non esistono in DokuWiki (sono inline): man mano che si incontrano `((testo))`, si accumulano in un array e si emettono come `[^n]: testo` in coda al documento.

---

## 4. Il meccanismo di protezione inline (`inline.ts`)

Il cuore della robustezza. `InlineProtector` mantiene un array di output già calcolati e restituisce, per ognuno, un placeholder composto da caratteri di controllo impossibili nel testo normale (`U+0000 … U+0001`).

```ts
convertInline(text, rules):
  protector = new InlineProtector()
  for rule of rules:            // una dopo l'altra, ordine fisso
    text = applyRule(text, rule, protector)
  return protector.restore(text) // solo alla fine i placeholder tornano testo
```

Quando una regola trova un match, il suo risultato viene "congelato" dietro un placeholder: la regola successiva vede il placeholder, non il markup generato. Così:

- il grassetto non viene reinterpretato dal corsivo;
- il codice inline non viene toccato dalle regole di enfasi;
- un link appena creato non viene riletto come sintassi di una regola successiva.

`applyRule` reistanzia la regex con flag `g`, protegge contro i match vuoti (per evitare loop infiniti) e garantisce sempre avanzamento.

---

## 5. Regole di conversione Markdown → DokuWiki

L'ordine è **fisso e significativo**: ogni regola opera su ciò che le precedenti hanno già protetto.

| # | Cosa | Da | A |
| --- | --- | --- | --- |
| 1 | Commenti Obsidian | `%%…%%` | rimosso (default) o protetto |
| 2 | Embed Obsidian | `![[img.png]]`, `![[img.png\|300]]` | `{{ns:img.png}}`, `{{ns:img.png?300}}` |
| 2b | Transclusione | `![[Nota]]` (senza estensione) | `{{page>ns:nota}}` se abilitato, altrimenti link + avviso |
| 3 | Wikilink | `[[Pagina]]`, `[[Pagina\|alias]]`, `[[Pagina#Sezione]]` | `[[ns:pagina]]`, `[[ns:pagina\|alias]]`, `[[ns:pagina#sezione\|Pagina > Sezione]]` |
| 4 | Immagine Markdown | `![alt](src)` | `{{src\|alt}}` |
| 5 | Link Markdown | `[testo](url)` | `[[url\|testo]]` |
| 6 | Footnote | `[^1]` | `((testo))` (o invariato + avviso se non definita) |
| 7 | Codice inline | `` `x` `` | `''x''` |
| 8 | Barrato | `~~x~~` | `<del>x</del>` |
| 9 | Highlight | `==x==` | `<fc #ffff00>` (o `wrap`/`mark`/`bold`) |
| 10 | Grassetto+corsivo | `***x***`, `___x___` | `**//x//**` |
| 11 | Grassetto | `**x**`, `__x__` | `**x**` |
| 12 | Corsivo | `*x*`, `_x_` | `//x//` |
| 13 | Tag | `#tag` | rimosso, oppure raccolto per `{{tag>…}}` |

Perché quest'ordine:
- **1–2 prima di tutto**: i commenti e gli embed vanno neutralizzati prima che le regole di link/enfasi li vedano.
- **3 (wikilink) prima di 4–5 (link Markdown)**: `[[…]]` e `[…](…)` sono sintassi distinte, ma un wikilink non deve essere reinterpretato come link standard.
- **9 prima di 10–12**: `==x==` usa caratteri che non collidono con `*`, ma tenerlo sopra evita ambiguità con le sequenze di `=`.
- **10 → 11 → 12**: è l'ordine critico. Il grassetto deve girare *prima* del corsivo, altrimenti il pattern del corsivo consumerebbe un asterisco di `**`. Anche `***x***` va gestito per primo, altrimenti verrebbe spezzato.
- **13 per ultimo**: i tag vanno rimossi dopo che heading (`# Titolo`) sono già stati riconosciuti come blocchi, così `#` di un heading non viene letto come tag.

Le regex del corsivo usano lookbehind/lookahead (`(?<![*\w])…(?![*\w])`) per non interpretare le moltiplicazioni (`2 * 3 * 4`) o le parole con underscore.

### 5.1 Heading

| Markdown | DokuWiki |
| --- | --- |
| `# H1` | `====== H1 ======` (6 `=`) |
| `## H2` | `===== H2 =====` |
| `### H3` | `==== H3 ====` |
| `#### H4` | `=== H4 ===` |
| `##### H5` | `== H5 ==` |
| `###### H6` | `== H6 ==` + **avviso** (DokuWiki ha max 5 livelli) |

La formula è `'='.repeat(7 - level)`.

### 5.2 Tabelle

Markdown ha una riga separatrice `|:---|:--:|`; DokuWiki no. La conversione:
1. legge gli allineamenti dalla riga separatrice (`:---` sinistra, `---:` destra, `:--:` centro);
2. ricostruisce l'allineamento in DokuWiki con gli **spazi** (DokuWiki allinea le celle in base allo spazio dal lato opposto): `  cella ` = destra, `  cella  ` = centro, ` cella ` = default;
3. emette header con `^` e righe con `|`.

La direzione inversa non ha separatore: l'allineamento viene **reinferito dalle spaziature** delle celle, e se manca un header ne viene sintetizzato uno vuoto.

### 5.3 Callout Obsidian

`> [!note] Titolo` è riconosciuto dalla regex `^\[!([\w-]+)\]([+-])?(?:\s+(.*))?$`. Il tipo mappa su tre stili (`options.calloutStyle`):

| Stile | Output | Note |
| --- | --- | --- |
| `html` (default) | `> **Titolo**` + corpo | nessun plugin richiesto; avviso `degraded` |
| `note` | `<note Titolo>…</note>` | plugin `note` (description list) |
| `wrap` | `<WRAP note Titolo>…</WRAP>` | plugin `wrap` |

I tipi Obsidian (`note`, `tip`, `warning`, `danger`, `info`, `success`, `question`, …) sono mappati sui tag/classi corrispondenti (`NOTE_PLUGIN_TAG`, `WRAP_CLASS`). I callout **pieghevoli** (`[!note]-`) e **annidati** (`>>`) degradano con un avviso, perché DokuWiki non ha il collasso.

### 5.4 Estensioni Obsidian

**Wikilink.** Il nome pagina è normalizzato per DokuWiki:

```ts
normalizePageName(raw) =
  raw.normalize('NFD')                              // separa gli accenti
     .replace(/\p{M}/gu, '')                        // li rimuove
     … (tabella accenti rimanenti)
     .toLowerCase()
     .replace(/\s+/g, '_')                          // spazi → underscore
     .replace(/[^a-z0-9_:\-.]/g, '')                // solo caratteri leciti
```

Le `/` di Obsidian sono cartelle del vault; in DokuWiki la gerarchia si esprime con `:`. `normalizePath` trasforma i segmenti: `[[Guida/Setup]]` → `guida:setup` (con `preserveFolders` attivo). All'anchor `#Sezione` corrisponde l'id heading normalizzato, e senza alias esplicito il testo del link diventa `Pagina > Sezione`.

**Embed.** `![[…]]` è disambiguato per **estensione**: se termina con un'estensione media (`.png`, `.jpg`, `.pdf`, …) diventa `{{…}}`; se è senza estensione è una **transclusione di nota**, che degrada a link (o diventa `{{page>…}}` con il plugin include).

**Frontmatter.** `remove` / `comment` / `keep` (vedi §3.2).

**Task.** `- [ ]` / `- [x]` → `☐` / `☑` (opzione `convertTasks`).

**Commenti.** `%%…%%` rimossi (opzione) o conservati.

**Tag.** `#tag` rimossi o raccolti in coda come `{{tag>a b c}}` (opzione `tags`).

**Costrutti senza equivalente.** Mermaid, Dataview, Tasks e i blocchi matematici `$$…$$` diventano `<code>` con un avviso (`OBSIDIAN_BLOCK_LANGS` in `mdToDoku.ts`).

### 5.5 A capo singoli

Obsidian rende ogni a capo come riga separata; DokuWiki fonde le righe consecutive di un paragrafo. L'opzione `preserveLineBreaks` (default attivo) aggiunge `\\` a fine di ogni riga di un paragrafo multi-riga, tranne l'ultima. **Non** si applica a codice, tabelle, liste, heading e citazioni. Al ritorno, `\\` torna a capo. Un hard break Markdown (`\` finale) è normalizzato allo stesso `\\` per non duplicarlo.

### 5.6 Codice dentro le liste

Caso comune nelle guide passo-passo. In DokuWiki un `<code>` a colonna 0 **interrompe la lista** e la numerazione riparte. Tre strategie (`options.codeInLists`):

| Strategia | Output | Effetto |
| --- | --- | --- |
| `indent` (default) | `<code>` indentato di 2 spazi per livello | mantiene la numerazione |
| `wrap` | `<WRAP code lang>…</WRAP>` | richiede il plugin wrap |
| `break` | blocco a colonna 0 | accetta la rottura, con avviso |

Meccanica: durante la segmentazione, una fence indentata dentro una lista viene estratta in un segmento e sostituita da un placeholder; `renderList` consuma il placeholder e lo colloca secondo la strategia, ricordando il livello dell'ultima voce.

---

## 6. Regole di conversione DokuWiki → Markdown

Mapping inverso di §5, più:

| DokuWiki | Markdown | Note |
| --- | --- | --- |
| `[[ns:pagina\|testo]]` | `[[ns/pagina\|testo]]` o `[testo](ns:pagina)` | opzione `internalLinks`; `:` → `/` |
| `<WRAP>` / `<note>` | `> [!tipo] Titolo` | tipo reinferito dalla classe/tag |
| `<fc>`, `<mark>`, `<wrap hi>` | `==evidenziazione==` | tre origini possibili |
| `{{page>ns:pagina}}` | `![[ns/pagina]]` | transclusione |
| `((footnote))` | `[^n]` + definizioni in coda | DokuWiki le ha inline |
| `~~NOTOC~~`, `~~NOCACHE~~` | rimosse | macro di controllo, con avviso |
| `__sottolineato__` | `<u>…</u>` | non è Markdown puro, avviso |

**Tabelle con celle unite.** DokuWiki ha colspan (`||`) e rowspan (`:::`); Markdown no. Vengono **degradati** in celle vuote con un avviso. Le stringhe di `:::` sono evitate come contenuto, così non vengono reinterpretate.

**Interwiki.** Un target con `>` è reso come link Markdown generico con avviso.

---

## 7. Il sistema di avvisi

```ts
interface ConversionWarning {
  line: number                       // 1-based, riferito al sorgente
  kind: 'unsupported' | 'degraded' | 'collision' | 'info'
  message: string
}
```

| Tipo | Significato | Esempio |
| --- | --- | --- |
| `unsupported` | nessun equivalente | H6 → H5; blocco Dataview |
| `degraded` | reso al meglio, con perdita | callout senza plugin; colspan |
| `collision` | ambiguo, può corrompersi al ritorno | frontmatter come `%%commento%%` |
| `info` | informativo, nessuna perdita | dimensione immagine preservata |

I numeri di riga sono mantenuti stabili attraverso i pre-pass (footnote *svuotate*, non rimosse). Nel batch gli avvisi confluiscono nel `LEGGIMI.txt`.

---

## 8. L'invariante di round-trip

La proprietà testata non è l'idempotenza di un singolo motore — `mdToDoku` **non** è idempotente sul proprio output, perché rileggerebbe `#` e i token con `:` con significati DokuWiki — ma la **stabilità del ciclo completo**:

```
doku1 = mdToDoku(md)
md2   = dokuToMd(doku1)
doku2 = mdToDoku(md2)
assert doku2 === doku1
```

Questo garantisce che modificare una nota e ri-esportarla non produca drift. Il test copre i casi comuni e l'intero documento demo.

**Punti di perdita noti**, tutti emessi come avvisi:
- frontmatter ↔ commenti (quando `removeObsidianComments` è attivo);
- blocchi indentati di 2 spazi, ambigui tra codice e continuazione di lista;
- colspan/rowspan delle tabelle;
- label footnote multiple e note a piè multi-riga.

---

## 9. Moduli di supporto

| Modulo | Responsabilità |
| --- | --- |
| `batch.ts` | `buildBatchPlan` (puro): converte N file, assegna `namespace/pagina.txt`, risolve i wikilink interni al batch, elenca i link irrisolti, gestisce gli allegati (mappa `media/`), produce il report. `zipFromPlan` + `renderReadme` generano ZIP e `LEGGIMI.txt`. |
| `preview.ts` | Rendering HTML *approssimato* dell'output. Il ramo DokuWiki fa **escape di tutto** prima di aggiungere markup; il ramo Markdown usa `markdown-it` con `html: false`. Iniettato con `dangerouslySetInnerHTML`. |
| `profiles.ts` | Profili di `Options` con nome, export/import JSON. Il profilo "Predefinito" esiste sempre. |
| `plugins.ts` | `detectPlugins(frammento)` deduce WRAP/note/include/tag/evidenziazione e propone le opzioni. |
| `diff.ts` | Diff a livello di riga (LCS) per la vista affiancata. |
| `history.ts` | Ultime 30 conversioni in IndexedDB; degrada silenziosamente se non disponibile. |
| `detect.ts` | Euristica di rilevamento del formato: **solo suggerimento**, la direzione resta manuale. |

---

## 10. Plugin Obsidian

Vive in `obsidian-plugin/` e **bundla gli stessi sorgenti** di `../src` (esbuild fa il bundle). Vedi `docs/obsidian-plugin.md` per il design e `obsidian-plugin/README.md` per l'uso.

Comandi offerti:

1. **Converti la nota corrente in DokuWiki** — appunti e/o file `.txt` accanto alla nota.
2. **Converti la selezione in DokuWiki** — sostituisce il testo selezionato.
3. **Converti la selezione da DokuWiki in Markdown** — il verso inverso.
4. **Importa da DokuWiki** — modale: incolli un documento, anteprima live, crea una nuova nota Markdown.
5. **Esporta la cartella corrente in DokuWiki** — `namespace/pagina.txt` (sottocartelle reali) e allegati in `media/`, più `LEGGIMI.txt`.

In più: menù contestuale nell'editor, barra di stato, notifiche degli avvisi cliccabili (che portano alla riga), profili di opzioni e rilevamento dei plugin DokuWiki da un frammento. Le impostazioni mappano 1:1 sulle `Options` del motore.

---

## 11. Testing

| File | Copre |
| --- | --- |
| `src/converters/mdToDoku.test.ts` | ogni regola MD → Doku, opzioni, avvisi |
| `src/converters/dokuToMd.test.ts` | ogni regola Doku → MD + round-trip (incluso il demo) |
| `src/lib/lib.test.ts` | testo, rilevamento, batch, profili, plugin, diff |

**155 test**. Prima di considerare finito un cambiamento: `npx vitest run` e `npx tsc -b --noEmit`.

---

## 14. Decisioni di default (e perché)

| Opzione | Default | Motivo |
| --- | --- | --- |
| `calloutStyle` | `html` | nessun plugin installato sulla wiki di destinazione |
| `highlightStyle` | `fc` | nativo DokuWiki, nessun plugin |
| `frontmatter` | `comment` | conserva l'informazione senza perderla (con avviso di collisione) |
| `preserveLineBreaks` | `true` | DokuWiki fonde le righe, Obsidian no |
| `codeInLists` | `indent` | mantiene la numerazione delle liste |
| `includeTransclusion` | `false` | il plugin include non è assunto |
| `internalLinks` | `wikilink` | coerente con l'uso Obsidian |
| namespaces | vuoti | li imposta l'utente |
| `cleanupRelated` / `cleanupWhitespace` / `h1FromFileName` | off | pulizia esplicita, non distruttiva di default |
