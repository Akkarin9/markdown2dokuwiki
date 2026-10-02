# Piano esecuzione `fase2.md` — COMPLETATO

Stato di partenza: motori, UI, opzioni, CodeMirror, batch ZIP, anteprima. 110 test verdi.
Stato finale: **155 test verdi**, `tsc` pulito, build e CLI funzionanti.

## Fasi

- **A. Motore MD → Doku ✅** — a capo singoli (`\\`), stili highlight (`fc/wrap/mark/bold`),
  codice dentro le liste (indent/wrap/break), transclusione (`{{page>...}}`),
  callout pieghevoli/annidati, fallback Mermaid/math/Dataview/Tasks, alias ancore (`Pagina > Sezione`),
  celle multi-riga, pulizia pre-conversione, H1 dal nome file.
- **B. Motore Doku → MD ✅** — inverso delle feature A (mark/wrap hi, `{{page>}}`, codice-in-liste) + round-trip
  (incluso il documento demo completo).
- **C. Opzioni, profili, pulizia pre-conversione, rilevamento plugin da frammento ✅** —
  `src/lib/profiles.ts`, `src/lib/plugins.ts`, pannello opzioni raggruppato con esempi.
- **D. Batch ✅** — struttura `ns/pagina.txt`, allegati in `media/`, risoluzione link incrociati,
  `LEGGIMI.txt`, report avvisi (`buildBatchPlan`/`renderReadme`/`zipFromPlan`).
- **E. Feature UI ✅** — diff affiancata (`src/lib/diff.ts` + `DiffView`), cronologia IndexedDB
  (`src/lib/history.ts` + `HistoryPanel`), incolla-e-copia, PWA, scroll sync.
- **F. Rifinitura UI ✅** — gutter coerente col tema, evidenziazione marcatori/callout, `:focus-visible`,
  contrasto, toolbar responsive con menu File.
- **G. CLI/libreria + README + piano plugin Obsidian ✅** — `src/cli/cli.ts`, `src/index.ts`,
  `README.md`, `docs/obsidian-plugin.md`.

Ogni fase è terminata con `npx vitest run` verde.
