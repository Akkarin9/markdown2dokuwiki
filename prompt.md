# Progetto: Markdown ⇄ DokuWiki Converter

Costruisci una webapp single-page che converte testo tra **Markdown (con sintassi Obsidian)** e **DokuWiki**, in entrambe le direzioni. Il caso d'uso principale: spostare guide dal mio vault Obsidian alla DokuWiki aziendale (e ogni tanto il contrario), quindi la gestione delle estensioni di Obsidian è importante quanto il Markdown standard.

## Stack
- Vite + React + TypeScript + Tailwind CSS
- Nessun backend: tutta la conversione avviene nel browser, nessun dato lascia la pagina
- Vitest per i test del motore di conversione
- Editor con CodeMirror 6 (syntax highlighting per markdown e per una sintassi DokuWiki custom, anche semplificata)

## Architettura
Separa nettamente il **motore di conversione** dalla UI:
- `src/converters/mdToDoku.ts` e `src/converters/dokuToMd.ts`: funzioni pure `(input: string, options: Options) => string`
- Niente regex a cascata fragili: usa un approccio a blocchi/token (parsing a righe + gestione inline) e proteggi sempre i blocchi di codice, che non vanno mai toccati
- Tutto il motore deve essere coperto da test con casi reali, inclusi i round-trip (md → doku → md deve essere stabile sui casi comuni)

## Funzionalità di conversione

**Markdown → DokuWiki**
- Heading: `# H1` → `====== H1 ======` fino a `##### H5` → `== H5 ==` (H6 mappato a H5 con avviso)
- Grassetto `**x**` → `**x**`, corsivo `*x*`/`_x_` → `//x//`, barrato `~~x~~` → `<del>x</del>`, codice inline `` `x` `` → `''x''`
- Liste puntate e numerate annidate (DokuWiki: 2 spazi + `*` / `-` per livello)
- Blocchi di codice con linguaggio → `<code lang>...</code>`
- Link `[t](url)` → `[[url|t]]`, immagini `![alt](src)` → `{{src|alt}}`
- Tabelle (con allineamento e header) → `^ header ^` / `| cella |`
- Citazioni `>` e linee orizzontali `---` → `----`
- Footnote `[^1]` → `((testo))`

**Estensioni Obsidian**
- Wikilink `[[Pagina]]` e `[[Pagina|alias]]` → link DokuWiki con namespace configurabile e normalizzazione del nome (minuscolo, spazi → underscore, accenti rimossi)
- Link con ancora `[[Pagina#Sezione]]`
- Embed immagini `![[img.png]]` e `![[img.png|300]]` → `{{ns:img.png?300}}`, con opzione per il namespace media
- Callout `> [!note] Titolo` → plugin `<WRAP>` (opzione alternativa: plugin `<note>`), mappando i tipi principali (note, tip, warning, danger, info)
- Frontmatter YAML: opzioni per rimuoverlo, convertirlo in commento o tenerlo
- Highlight `==x==` → `<fc #ffff00>x</fc>` o equivalente configurabile
- Task `- [ ]` / `- [x]` → resa testuale sensata (es. ☐ / ☑)
- Commenti `%%...%%` → rimossi (opzione)
- Tag `#tag` → rimossi o convertiti in riga di tag (opzione)

**DokuWiki → Markdown**
- Mapping inverso di tutto quanto sopra
- Link interni `[[ns:pagina|testo]]` → wikilink Obsidian o link markdown standard (opzione)
- `<WRAP>`/`<note>` → callout Obsidian
- Tabelle DokuWiki con `^` e `|`, incluse celle unite (`:::`) con degrado elegante

**Avvisi di conversione:** quando qualcosa non ha equivalente diretto, non fallire in silenzio: converti al meglio e mostra un avviso non invasivo (con numero di riga) in un pannello "Note di conversione".

## UI / UX (deve essere davvero bella)
Estetica: moderna, pulita, "da tool per sviluppatori curato" (pensa a Linear, Raycast, Obsidian stesso).
- Layout a due pannelli affiancati (input/output) con divisore ridimensionabile; su mobile diventano a tab
- Pulsante centrale **⇄ Inverti direzione** con animazione fluida, che scambia anche il contenuto
- Selettore direzione chiaro (MD → Doku / Doku → MD) con **rilevamento automatico** del formato incollato
- Conversione **live** mentre scrivi, con debounce
- Tema **dark di default** (palette scura calda, accento viola/indaco in stile Obsidian) + tema chiaro, con toggle
- Tipografia: font sans moderno (Inter) per la UI, monospace (JetBrains Mono) per gli editor
- Micro-interazioni: transizioni morbide, toast "Copiato!", skeleton/stati vuoti curati, focus ring evidenti
- Pulsanti: **Copia output**, **Scarica file** (.md / .txt), **Carica file** e **drag & drop** di file sull'editor, **Cancella**, **Esempio** (precarica un documento demo che mostra le funzionalità)
- Pannello **Opzioni** a scomparsa laterale con tutte le impostazioni (namespace link, namespace media, stile callout, gestione frontmatter, tag, ecc.), salvate in localStorage
- Contatori (righe, caratteri) e stato degli avvisi nella barra inferiore
- Scorciatoie da tastiera (Ctrl/Cmd+Shift+C copia output, Ctrl/Cmd+Shift+S inverti)
- Accessibilità: contrasti AA, navigazione da tastiera, aria-label
- Interfaccia in italiano

## Qualità e consegna
- Codice tipizzato, commentato dove serve, struttura pulita
- Test Vitest per ogni regola di conversione e per i round-trip
- `README.md` con istruzioni di avvio, elenco della sintassi supportata e limiti noti
- Lavora per passi: 1) scaffolding + motore MD→Doku con test, 2) motore Doku→MD con test, 3) UI, 4) opzioni e rifinitura estetica. Fermati e mostrami lo stato dopo ogni passo.

Prima di scrivere codice, proponi un breve piano e segnalami eventuali ambiguità sulla sintassi DokuWiki (plugin installati, ecc.).