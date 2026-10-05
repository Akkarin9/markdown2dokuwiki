# Plugin Obsidian — Markdown ⇄ DokuWiki

Plugin per Obsidian che converte le note **Markdown (Obsidian) → DokuWiki** e importa documenti **DokuWiki → Markdown**. Riusa il **motore condiviso** (`../src`): nessuna copia da tenere allineata.

## Cosa fa

Apri il **pannello laterale** dall'icona nella barra (o `Ctrl/Cmd+P` → "Apri il pannello laterale") e hai tutti i comandi a un clic:

| Pulsante / Comando | Effetto |
| --- | --- |
| **Converti la nota in DokuWiki** | appunti e/o file `.txt` accanto alla nota (scelta nelle impostazioni) |
| **Converti la selezione in DokuWiki** | sostituisce il testo selezionato |
| **Converti la selezione da DokuWiki** | il verso inverso, sempre sulla selezione |
| **Importa da DokuWiki…** | modale con anteprima HTML → nuova nota Markdown |
| **Esporta la cartella in DokuWiki** | `<cartella>/dokuwiki-out/` con `namespace/pagina.txt` (sottocartelle reali), allegati in `media/` + `LEGGIMI.txt` |
| **Apri le impostazioni** | la scheda del plugin |
| **Dove va il risultato** | cambia al volo appunti → file → entrambe |
| **Cerca aggiornamenti** | scarica e installa l'ultima versione dal repo pubblico |

Ogni pulsante corrisponde anche a un comando nella **Command Palette** (`Ctrl/Cmd+P`), quindi puoi assegnargli una scorciatoia.

## Installazione

### Sviluppo

Il plugin vive in una sottocartella di questo repo e bundla il motore da `../src`.

```bash
cd obsidian-plugin
npm install
npm run build      # typecheck + bundle in main.js
```

Poi copia (o collega) la cartella nella vault:

```bash
# Sostituisci con il percorso del tuo vault
VAULT=/percorso/della/tua/vault/.obsidian/plugins
mkdir -p "$VAULT/md2doku-converter"
cp main.js manifest.json styles.css "$VAULT/md2doku-converter/"
```

Infine, in Obsidian: **Impostazioni → Plugin della community → attiva "Markdown ⇄ DokuWiki"**.

### Sviluppo con reload automatico

```bash
cd obsidian-plugin
npm run dev        # esbuild in watch su main.js
```

Con il plugin [Hot Reload](https://github.com/pjeby/hot-reload) oppure ricaricando Obsidian, `main.js` viene ricompilato a ogni salvataggio.

## Impostazioni

Sono le opzioni del motore (voce **Markdown ⇄ DokuWiki** nelle impostazioni di Obsidian):

- **Profili**: profilo attivo, nuovo / duplica / rinomina / elimina, esporta e importa JSON. Sono salvati nel `data.json` di Obsidian.
- **Output**: appunti / file accanto alla nota / entrambe; estensione del file (`.txt`); aggiornamento automatico del file a ogni salvataggio della nota.
- **Namespace**: link e media, più "preserva le cartelle" (`[[Guida/Setup]]` → `[[guida:setup]]`).
- **Callout e plugin**: **rilevamento dei plugin da un frammento DokuWiki incollato**, stile callout (HTML / `<note>` / `<WRAP>`), stile evidenziazione (`<fc>` / `<wrap hi>` / `<mark>` / grassetto), transclusioni con plugin include, strategia per il codice dentro le liste.
- **Testo e pulizia**: a capo singoli → `\\`, rimozione sezioni Related, normalizzazione spazi, H1 dal nome file.
- **Estensioni Obsidian**: frontmatter, tag, commenti `%%`, task, link interni.
- **Aggiornamenti**: pulsante *Cerca aggiornamenti* che scarica `main.js`/`manifest.json`/`styles.css` da `Akkarin9/markdown2dokuwiki` (o il comando omonimo in palette). Dopo l'installazione ricarica Obsidian.

## Come è costruito

```
obsidian-plugin/
  main.ts               Plugin: registra comandi, ribbon e vista laterale
  src/
    engine.ts           ri-esporta il motore da ../../src
    settings.ts         pannello impostazioni (mappa 1:1 su Options)
    sidebar-view.ts     pannello laterale con i pulsanti dei comandi
    operations.ts       conversione nota/selezione, scrittura file, copia
    import-modal.ts     modale "importa da DokuWiki" (anteprima HTML)
    export-folder.ts    esportazione cartella (buildBatchPlan + media/)
    warnings-modal.ts   elenco avvisi cliccabile (riga → editor)
    prompt-modal.ts     modali di input (nome profilo, JSON, frammento)
    updater.ts          aggiornamento dal repo GitHub pubblico
    vault-utils.ts      utilità su file e cartelle del vault
  esbuild.config.mjs    bundle: motore incluso, API Obsidian esterna
  versions.json         versioni del plugin → minAppVersion
```

`esbuild` bundla i sorgenti di `../src` dentro `main.js`, tenendo esterno solo il modulo `obsidian`. Il risultato è un singolo file (~300 KB, include `markdown-it` per l'anteprima) senza dipendenze da pubblicare.

## Note

- Nell'**esportazione di cartella** gli allegati referenziati vengono copiati in `media/` dentro `dokuwiki-out/`. Nella conversione di una **singola nota** restano invece nel vault (solo i riferimenti vengono normalizzati).
- Il plugin **non invia nulla in rete**: la conversione è tutta locale.
- `isDesktopOnly: false`: il plugin funziona anche su mobile, tranne la scrittura di file in posizioni non gestite dal vault (che segue le API di Obsidian).
