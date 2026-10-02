# Plugin Obsidian — note di progetto

> **Stato: implementato.** Il piano di fattibilità di questo documento è stato realizzato: il plugin vive in `obsidian-plugin/` (vedi `obsidian-plugin/README.md`). Qui restano le motivazioni di progetto e le direzioni future.

## Obiettivo

Un plugin Obsidian che usi le stesse regole e opzioni della webapp per convertire note in DokuWiki (e importare DokuWiki in Markdown), senza duplicare il motore.

## Perché è stato fattibile

- Il motore è **puro e senza dipendenze dal DOM**: `mdToDoku`/`dokuToMd` (e `buildBatchPlan`) girano in qualunque ambiente JS, Node compreso (come dimostra la CLI).
- Non usa API browser-specifiche tranne dove isolato (`localStorage`, `IndexedDB`), che il plugin non usa.
- `src/index.ts` espone un entry point pubblico con tipi TypeScript completi.
- Le opzioni sono serializzabili, quindi si mappano 1:1 su `data.json` del plugin.

## Scelta fatta: bundle dai sorgenti

Il plugin **importa direttamente `../src`** e `esbuild` lo bundla in un singolo `main.js` (~76 KB), tenendo esterna solo l'API `obsidian`. Vantaggi: nessuna pubblicazione di pacchetto, sempre allineato alla webapp. Il costo è che i due progetti vanno compilati dallo stesso checkout.

L'alternativa (pacchetto npm condiviso) resta valida se in futuro i due progetti si separano in repository distinti.

## Implementazione (riepilogo)

| Componente | File |
| --- | --- |
| Registrazione comandi, ribbon e vista | `obsidian-plugin/main.ts` |
| Impostazioni | `obsidian-plugin/src/settings.ts` |
| Pannello laterale | `obsidian-plugin/src/sidebar-view.ts` |
| Operazioni (nota, selezione, file) | `obsidian-plugin/src/operations.ts` |
| Import da DokuWiki | `obsidian-plugin/src/import-modal.ts` |
| Esportazione cartella | `obsidian-plugin/src/export-folder.ts` |
| Bridge verso il motore | `obsidian-plugin/src/engine.ts` |

I comandi e il pannello laterale condividono gli stessi metodi pubblici del plugin (`runConvertNote`, `runConvertSelectionToDoku`, `runFolderExport`, `openImportModal`, `cycleOutputAction`): nessuna logica duplicata tra la palette e la UI.

## Direzioni future

1. **Pubblicazione diretta via XML-RPC** (`core.putPage` / `core.getPage`): caricare le pagine sulla wiki senza passare da file. Richiede URL, utente e token nelle impostazioni; da progettare con attenzione alla sicurezza.
2. **Allegati**: oggi restano nel vault. Si potrebbero scrivere in una cartella `media/` del vault o caricarli via API.
3. **Rilevamento plugin**: portare `detectPlugins` nel pannello impostazioni per precompilare il profilo da un frammento incollato.
4. **Anteprima diff** prima di esportare una cartella, per vedere cosa cambia nella pagina esistente.

## Rischi e mitigazioni

| Area | Rischio | Mitigazione |
| --- | --- | --- |
| Packaging | Duplicazione o divergenza tra webapp e plugin | Bundle dagli stessi sorgenti + test del motore condivisi |
| API Obsidian | Cambiamenti tra versioni | Solo API stabili (`Vault`, `MetadataCache`, `Plugin`) |
| Allegati | Percorsi diversi dal browser | I riferimenti sono già normalizzati dal motore |
| Credenziali wiki | Sicurezza | L'upload via API è rimandato; oggi si esportano file |
