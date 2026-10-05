# Plugin Obsidian — note di progetto

> **Stato: implementato.** Il piano di fattibilità di questo documento è stato realizzato: il plugin vive in `obsidian-plugin/` (vedi `obsidian-plugin/README.md`). Qui restano le motivazioni di progetto e le direzioni future.

## Obiettivo

Un plugin Obsidian che usi le stesse regole e opzioni del motore per convertire note in DokuWiki (e importare DokuWiki in Markdown), senza duplicarlo.

## Perché è stato fattibile

- Il motore è **puro e senza dipendenze dal DOM**: `mdToDoku`/`dokuToMd` (e `buildBatchPlan`) girano in qualunque ambiente JS.
- Non usa API browser-specifiche tranne dove isolato (`localStorage`, `IndexedDB`), che il plugin non usa.
- Il motore (`src/converters`, `src/lib`) espone tipi TypeScript completi, importabili direttamente.
- Le opzioni sono serializzabili, quindi si mappano 1:1 su `data.json` del plugin.

## Scelta fatta: bundle dai sorgenti

Il plugin **importa direttamente `../src`** e `esbuild` lo bundla in un singolo `main.js` (~76 KB), tenendo esterna solo l'API `obsidian`. Vantaggi: nessuna pubblicazione di pacchetto, sempre allineato al motore. Il costo è che plugin e motore vanno compilati dallo stesso checkout.

L'alternativa (pacchetto npm condiviso) resta valida se in futuro i due progetti si separano in repository distinti.

## Implementazione (riepilogo)

| Componente | File |
| --- | --- |
| Registrazione comandi, ribbon e vista | `obsidian-plugin/main.ts` |
| Impostazioni | `obsidian-plugin/src/settings.ts` |
| Pannello laterale | `obsidian-plugin/src/sidebar-view.ts` |
| Operazioni (nota, selezione, file) | `obsidian-plugin/src/operations.ts` |
| Import da DokuWiki (anteprima HTML) | `obsidian-plugin/src/import-modal.ts` |
| Esportazione cartella (namespace + `media/`) | `obsidian-plugin/src/export-folder.ts` |
| Avvisi cliccabili (riga → editor) | `obsidian-plugin/src/warnings-modal.ts` |
| Modali di input (profilo, JSON, frammento, conferme) | `obsidian-plugin/src/prompt-modal.ts` |
| Aggiornamento dal repo GitHub (`requestUrl`) | `obsidian-plugin/src/updater.ts` |
| Utility sul vault (testo e binari) | `obsidian-plugin/src/vault-utils.ts` |
| Bridge verso il motore | `obsidian-plugin/src/engine.ts` |

I comandi e il pannello laterale condividono gli stessi metodi pubblici del plugin (`runConvertNote`, `runConvertSelectionToDoku`, `runFolderExport`, `openImportModal`, `cycleOutputAction`): nessuna logica duplicata tra la palette e la UI.

## Già realizzato (ex direzioni future)

- **Allegati**: l'esportazione di cartella copia i media referenziati in `media/` insieme ai `.txt`.
- **Rilevamento plugin**: `detectPlugins` è nel pannello impostazioni e precompila le opzioni da un frammento incollato.
- **Profili**: profili di opzioni nominati, persistiti nel `data.json`, con export/import JSON.

## Direzioni future

1. **Pubblicazione diretta via XML-RPC** (`core.putPage` / `core.getPage`): caricare le pagine sulla wiki senza passare da file. Richiede URL, utente e token nelle impostazioni; da progettare con attenzione alla sicurezza.
2. **Anteprima diff** prima di esportare una cartella, per vedere cosa cambia nella pagina esistente.
3. **Namespace per-cartella**: mappare le cartelle del vault su namespace DokuWiki diversi (oggi il namespace dei link è uno solo, globale).
4. **Cronologia** delle conversioni, non ancora portata nel plugin.

## Rischi e mitigazioni

| Area | Rischio | Mitigazione |
| --- | --- | --- |
| Packaging | Duplicazione o divergenza tra motore e plugin | Bundle dagli stessi sorgenti + test del motore condivisi |
| API Obsidian | Cambiamenti tra versioni | Solo API stabili (`Vault`, `MetadataCache`, `Plugin`) |
| Allegati | Percorsi diversi dal browser | I riferimenti sono già normalizzati dal motore |
| Credenziali wiki | Sicurezza | L'upload via API è rimandato; oggi si esportano file |
