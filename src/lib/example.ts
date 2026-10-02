/** Documento demo che mostra le funzionalita' del convertitore. */
export const EXAMPLE_MARKDOWN = `---
title: Guida alla prenotazione sale
author: Akkarin
tags: [procedure, ufficio]
---

# Guida alla prenotazione delle sale

Questa guida mostra **tutto** cio' che serve: *corsivo*, ~~testo rimosso~~,
\`comandi inline\`, ==punti importanti== e perfino un H6.

Righe consecutive come in Obsidian:
questo resta su una riga sua,
e anche questa.

## Procedura rapida

- [ ] Apri il gestionale
- [x] Effettua il login
- [ ] Scegli la sala e l'orario

1. Cerca la sala per nome
2. Verifica la disponibilità
3. Conferma la prenotazione e annota il codice

### Codice dentro una lista

1. Installa le dipendenze
2. Avvia l'ambiente locale

   \`\`\`bash
   npm install
   npm run dev
   \`\`\`

3. Apri il browser su localhost

### Dettagli utili

Vedi [[Prenotazione Sale|la pagina dedicata]] oppure [[Policy#Uso delle sale]].

Trasclusione di nota: ![[Regolamento]]

## Tabella riassuntiva

| Sala       | Posti | Proiettore |
|:-----------|------:|:----------:|
| Aula Magna |    80 | sì         |
| Riunioni 1 |     8 | no         |

## Esempio di configurazione

\`\`\`bash
# Il contenuto di un blocco di codice non viene mai toccato
export SALA="Aula Magna"
echo "**non** diventa grassetto"
\`\`\`

## Diagramma

\`\`\`mermaid
graph TD; A[Sala] --> B[Prenotazione];
\`\`\`

## Avvertenza

> [!warning] Attenzione
> La sala viene rilasciata dopo 10 minuti se non confermi.

> [!tip] Suggerimento
> Puoi prenotare fino a 30 giorni in anticipo.

###### Sezione molto annidata (H6)

## Note e immagini

![schema delle sale](img/schema.png)
![[planimetria.jpg|400]]

---

Per maggiori dettagli consultare il regolamento[^1].

[^1]: Il regolamento completo è disponibile sull'intranet aziendale.
`

/** Un esempio anche in DokuWiki, per l'altra direzione. */
export const EXAMPLE_DOKUWIKI = `====== Guida alla prenotazione delle sale ======

Questa guida mostra **tutto** cio' che serve: //corsivo//, <del>testo rimosso</del>,
''comandi inline'' e <fc #ffff00>punti importanti</fc>.

===== Procedura rapida =====

  * ☐ Apri il gestionale
  * ☑ Effettua il login
  * ☐ Scegli la sala e l'orario

  - Cerca la sala per nome
  - Verifica la disponibilità
  - Conferma la prenotazione

Vedi [[prenotazione_sale|la pagina dedicata]].

^ Sala ^  Posti ^ Proiettore ^
| Aula Magna |  80 | sì |
| Riunioni 1 |  8 | no |

<code bash>
# Il contenuto non viene toccato
export SALA="Aula Magna"
</code>

<WRAP warning Attenzione>
La sala viene rilasciata dopo 10 minuti.
</WRAP>

----

Per dettagli consultare il regolamento((Il regolamento completo è sull'intranet)).
`
