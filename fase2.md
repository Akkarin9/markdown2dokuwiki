# Progetto: Markdown ⇄ DokuWiki Converter (specifica completa)

Webapp single-page che converte testo tra **Markdown (con sintassi Obsidian)** e **DokuWiki**, in entrambe le direzioni. Caso d'uso principale: spostare guide dal mio vault Obsidian alla DokuWiki aziendale (e ogni tanto il contrario). Le estensioni Obsidian contano quanto il Markdown standard.

**Se nella cartella esiste già un'implementazione**, analizzala, tieni ciò che funziona (heading, tabelle con allineamento, footnote, codice protetto, task, linee orizzontali, Batch ZIP, tema, scaffolding) e fai refactoring incrementale. Non riscrivere da zero. Se parti da zero, segui l'ordine delle fasi sotto.

## Stack e vincoli
- Vite + React + TypeScript + Tailwind CSS
- Nessun backend: tutto avviene nel browser, nessun dato lascia la pagina
- Vitest per il motore, CodeMirror 6 per gli editor (highlighting Markdown e DokuWiki, anche semplificato)
- Interfaccia in italiano

## Architettura
- Motore di conversione separato dalla UI, in un pacchetto interno riusabile (`src/engine/` o workspace): funzioni pure `(input, options) => { output, warnings }`
- Niente regex a cascata fragili: parsing a blocchi/token (righe + inline), con i blocchi di codice sempre protetti e mai toccati
- Ogni avviso ha la forma `{ line, type, message }`
- **Regola generale:** quando un elemento non ha equivalente diretto, converti al meglio e aggiungi un avviso con numero di riga. Mai fallire in silenzio.
- Tutto il motore è coperto da test su casi reali, inclusi i round-trip (md → doku → md stabile sui casi comuni)

## Specifica di conversione

**Markdown → DokuWiki**
- Heading `# H1` → `====== H1 ======` fino a H5 → `== H5 ==`; H6 → H5 con avviso
- `**x**` → `**x**`, `*x*`/`_x_` → `//x//`, `~~x~~` → `<del>x</del>`, `` `x` `` → `''x''`
- Liste puntate e numerate annidate (2 spazi per livello + `*` / `-`)
- Blocchi di codice con linguaggio → `<code lang>...</code>`
- Link `[t](url)` → `[[url|t]]`, immagini `![alt](src)` → `{{src|alt}}`
- Tabelle con header e allineamento → `^ header ^` / `| cella |`; celle multi-riga (`<br>`) gestite con degrado e avviso
- Citazioni `>`, linee orizzontali `---` → `----`
- Footnote `[^1]` → `((testo))`
- **A capo singoli:** Obsidian rende ogni a capo come riga separata, DokuWiki fonde le righe consecutive. Opzione "A capo singolo → `\\ `", attiva di default. Non si applica dentro codice, tabelle, liste, heading e citazioni. Nel verso inverso `\\ ` → a capo.

**Estensioni Obsidian**
- Wikilink `[[Pagina]]` e `[[Pagina|alias]]` normalizzati secondo le opzioni: minuscolo, spazi → underscore, accenti rimossi, namespace configurabile. Esempio: `[[Prenotazione Sale]]` → `[[:guide:prenotazione_sale|Prenotazione Sale]]`
- `[[Pagina#Sezione]]` → `[[:ns:pagina#sezione|Pagina > Sezione]]` (ancora = id heading normalizzato)
- Embed immagini `![[img.png]]` e `![[img.png|300]]` → `{{ns:img.png?300}}`, namespace media configurabile
- Transclusion `![[Nota]]` → `{{page>ns:nota}}` se l'opzione "plugin include" è attiva, altrimenti link + avviso
- Callout `> [!note] Titolo` → `<WRAP>` (alternativa: plugin `<note>`), mappando note, tip, warning, danger, info. Callout annidati o pieghevoli (`> [!note]-`) degradano con avviso
- Frontmatter YAML: rimuovi / converti in commento / tieni (opzione)
- Highlight `==x==` con opzione "Stile evidenziazione": `<wrap hi>x</wrap>` (default se WRAP attivo), `<fc #ffff00>`, `<mark>`, oppure grassetto come fallback senza plugin
- Task `- [ ]` / `- [x]` → ☐ / ☑
- Commenti `%%...%%` → rimossi (opzione)
- Tag `#tag` → rimossi o convertiti in riga di tag (opzione)
- Mermaid, math (`$$`), Dataview/Tasks → fallback a `<code>` con avviso
- **Blocchi di codice dentro le liste** (caso molto comune nelle guide passo-passo; in DokuWiki un `<code>` a livello zero interrompe la lista e la numerazione riparte). Strategia scelta nelle opzioni: (a) `<code>` indentato di 2 spazi per livello dentro l'elemento, (b) `<wrap>` con codice, (c) accetta la rottura con avviso. Scegli un default sensato, documentalo e testalo.

**DokuWiki → Markdown**
- Mapping inverso di tutto quanto sopra
- Link interni `[[ns:pagina|testo]]` → wikilink Obsidian o link markdown standard (opzione)
- `<WRAP>`/`<note>` → callout Obsidian
- Tabelle con `^` e `|`, incluse celle unite (`:::`) con degrado elegante

**Pulizia pre-conversione (opzioni)**
- Rimuovi blocchi `Related:`/backlink tipici dei vault
- Normalizza spazi finali e righe vuote multiple
- "H1 dal nome file" quando la nota non ha un titolo (file caricati e batch)

## UI / UX (deve essere davvero bella)
Estetica moderna da tool per sviluppatori curato (Linear, Raycast, Obsidian).
- Due pannelli affiancati con divisore ridimensionabile; su mobile diventano tab
- Pulsante **⇄ Inverti direzione** con animazione fluida, che scambia anche il contenuto
- Selettore direzione (MD → Doku / Doku → MD) con **rilevamento automatico** del formato incollato
- Conversione **live** con debounce
- Tema **dark di default** (palette scura calda, accento viola/indaco stile Obsidian) + tema chiaro con toggle
- Inter per la UI, JetBrains Mono per gli editor
- Micro-interazioni, toast "Copiato!", stati vuoti curati
- **Toolbar:** "Copia output" è il pulsante primario con colore d'accento; Carica / Scarica / Batch ZIP raggruppati in un menu "File"; Cancella ed Esempio come icone con tooltip. Deve reggere a larghezze ridotte (tablet/mobile) senza rompersi
- Drag & drop di file sull'editor
- **Gutter numeri di riga:** deve seguire il tema (ora ha sfondo chiaro nel tema scuro; verifica entrambi)
- **Highlighting input Markdown:** nelle liste si colora solo il marcatore (`-`, `1.`, `[ ]`), non tutto il testo; criterio coerente nell'output
- **Focus ring:** usa `:focus-visible` (ora il ⇄ resta con l'anello viola fisso dopo il click)
- **Contrasto:** WCAG AA per status bar, etichette "Input/Output/sola lettura" e testo secondario, in entrambi i temi
- Scorciatoie: Ctrl/Cmd+Shift+C copia output, Ctrl/Cmd+Shift+S inverti
- Accessibilità: navigazione da tastiera, aria-label
- Status bar: contatori righe/caratteri, direzione rilevata, indicatore "✓ nessun avviso" / "⚠ N avvisi" cliccabile
- **Pannello "Note di conversione":** ogni avviso mostra riga, tipo, messaggio; il click scorre ed evidenzia la riga nell'editor
- **Scroll sync** opzionale (toggle) con evidenziazione della riga corrispondente al cursore

## Opzioni e profili
- Pannello Opzioni laterale a scomparsa, raggruppato, con descrizioni brevi ed esempio before/after per le opzioni ambigue
- **Profili salvabili** (es. "Lavoro", "Personale") con: namespace link, namespace media, plugin disponibili (WRAP, note, include…), stile callout, stile highlight, frontmatter, tag, a capo, strategia codice-in-liste, pulizia pre-conversione. Crea, rinomina, duplica, elimina, import/export JSON. Persistenza in localStorage
- **Rilevamento plugin da frammento:** una pagina/modale dove incollo un pezzo della mia DokuWiki e l'app deduce i plugin in uso (WRAP, note, ecc.) per precompilare il profilo

## Demo
Il pulsante "Esempio" precarica un documento che mostra **tutte** le estensioni: frontmatter, callout (note/tip/warning), `![[img.png|300]]`, wikilink con alias e con `#sezione`, `%%commento%%`, `#tag`, highlight, task, footnote, tabella, righe consecutive, codice dentro lista, un H6 e un blocco Mermaid, così gli avvisi compaiono.

## Batch ZIP e allegati
- Output come struttura `ns/pagina.txt` con nomi normalizzati (regole id DokuWiki)
- Wikilink tra note dello stesso batch risolti in `ns:pagina`; quelli verso note assenti elencati negli avvisi
- Rilevamento allegati (`![[img.png]]`, `![](img.png)`): se carico anche i file o trascino la cartella, vengono inclusi in `media/` con nomi normalizzati e riferimenti riscritti. Genera `LEGGIMI.txt` con l'elenco "da caricare su DokuWiki" e il namespace di destinazione
- Report finale: file convertiti, avvisi per file, link irrisolti

## Feature aggiuntive
- **Anteprima renderizzata:** tab "Anteprima" accanto al codice di output che mostra come apparirà la pagina (rendering approssimato di heading, liste, tabelle, code, WRAP), per individuare subito liste e tabelle rotte
- **Vista diff:** confronto side-by-side tra l'output attuale e una versione incollata/precedente, utile per aggiornare pagine già esistenti sulla wiki
- **Cronologia locale:** ultime N conversioni in IndexedDB, con ripristino e cancellazione
- **Modalità "incolla e copia":** incolli nell'input e l'output va negli appunti in automatico, con toast (toggle)
- **PWA installabile**, funzionante offline
- **CLI/libreria:** il motore esportabile come pacchetto npm con comando `md2doku`/`doku2md` per conversioni in massa dell'intero vault (cartella in → cartella out, stesse opzioni e profili in JSON). Documentare l'uso nel README
- **Opzionale a fine progetto:** schema di un plugin Obsidian "Esporta in DokuWiki" che riusa il motore (solo piano di fattibilità, nessuna implementazione)

## Ordine di lavoro
Procedi per fasi. A fine di ognuna: test verdi, elenco delle modifiche, decisioni prese, dubbi aperti. Fermati a mostrarmi lo stato prima di proseguire.

1. **Motore MD → Doku** (incluse estensioni Obsidian, a capo, wikilink, codice in liste, avvisi) con test
2. **Motore Doku → MD** con test e round-trip
3. **UI base:** layout, toolbar, temi, rilevamento direzione, live, status bar, pannello avvisi, demo completo
4. **Opzioni, profili e pulizia pre-conversione**, rilevamento plugin da frammento
5. **Batch ZIP, allegati e report**
6. **Rifinitura UI:** gutter, highlighting, focus-visible, contrasto AA, responsive toolbar, scroll sync
7. **Feature aggiuntive:** anteprima, diff, cronologia, incolla-e-copia, PWA
8. **CLI/libreria** e piano plugin Obsidian
9. **README:** avvio, sintassi supportata, opzioni, limiti noti, uso CLI

## Qualità
- Codice tipizzato, commentato dove serve, struttura pulita
- Test Vitest per ogni regola, round-trip inclusi
- Prima di scrivere codice: proponi un breve piano e chiedimi come è configurata la mia DokuWiki (plugin, namespace) se serve per scegliere un default. Se ho fixture reali da darti, usale come test.