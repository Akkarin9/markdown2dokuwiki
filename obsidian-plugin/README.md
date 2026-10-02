# Plugin Obsidian — Markdown ⇄ DokuWiki

Plugin per Obsidian che converte le note **Markdown (Obsidian) → DokuWiki** e importa documenti **DokuWiki → Markdown**. Riusa lo **stesso motore** della webapp (`../src`): nessuna copia da tenere allineata.

## Cosa fa

Apri il **pannello laterale** dall'icona nella barra (o `Ctrl/Cmd+P` → "Apri il pannello laterale") e hai tutti i comandi a un clic:

| Pulsante / Comando | Effetto |
| --- | --- |
| **Converti la nota in DokuWiki** | appunti e/o file `.txt` accanto alla nota (scelta nelle impostazioni) |
| **Converti la selezione in DokuWiki** | sostituisce il testo selezionato |
| **Converti la selezione da DokuWiki** | il verso inverso, sempre sulla selezione |
| **Importa da DokuWiki…** | modale con anteprima live → nuova nota Markdown |
| **Esporta la cartella in DokuWiki** | `<cartella>/dokuwiki-out/` con `namespace/pagina.txt` + `LEGGIMI.txt` |
| **Apri le impostazioni** | la scheda del plugin |
| **Dove va il risultato** | cambia al volo appunti → file → entrambe |

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

Sono le stesse opzioni della webapp (voce **Markdown ⇄ DokuWiki** nelle impostazioni di Obsidian):

- **Output**: appunti / file accanto alla nota / entrambe; estensione del file (`.txt`).
- **Namespace**: link e media, più "preserva le cartelle" (`[[Guida/Setup]]` → `[[guida:setup]]`).
- **Callout e plugin**: stile callout (HTML / `<note>` / `<WRAP>`), stile evidenziazione (`<fc>` / `<wrap hi>` / `<mark>` / grassetto), transclusioni con plugin include, strategia per il codice dentro le liste.
- **Testo e pulizia**: a capo singoli → `\\`, rimozione sezioni Related, normalizzazione spazi, H1 dal nome file.
- **Estensioni Obsidian**: frontmatter, tag, commenti `%%`, task, link interni.

## Come è costruito

```
obsidian-plugin/
  main.ts               Plugin: registra comandi, ribbon e vista laterale
  src/
    engine.ts           ri-esporta il motore da ../../src
    settings.ts         pannello impostazioni (mappa 1:1 su Options)
    sidebar-view.ts     pannello laterale con i pulsanti dei comandi
    operations.ts       conversione nota/selezione, scrittura file, copia
    import-modal.ts     modale "importa da DokuWiki"
    export-folder.ts    esportazione cartella (buildBatchPlan)
    vault-utils.ts      utilità su file e cartelle del vault
  esbuild.config.mjs    bundle: motore incluso, API Obsidian esterna
```

`esbuild` bundla i sorgenti di `../src` dentro `main.js`, tenendo esterni solo i moduli forniti da Obsidian. Il risultato è un singolo file (~76 KB) senza dipendenze da pubblicare.

## Note

- Gli **allegati non vengono copiati** nella cartella di output: restano nel vault, mentre il motore normalizza i riferimenti. Per caricarli sulla wiki usa la webapp (batch ZIP) o caricali a mano.
- Il plugin **non invia nulla in rete**: la conversione è tutta locale.
- `isDesktopOnly: false`: il plugin funziona anche su mobile, tranne la scrittura di file in posizioni non gestite dal vault (che segue le API di Obsidian).
