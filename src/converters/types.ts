/**
 * Contratto condiviso dal motore di conversione.
 *
 * Il motore e' composto da funzioni pure `(input, options) => ConversionResult`
 * e non deve mai dipendere dal DOM o da React.
 */

export type Direction = 'md-to-doku' | 'doku-to-md'

/** Stile di resa per i callout Obsidian (`> [!note] ...`). */
export type CalloutStyle =
  // Fallback senza plugin: `<note>` e' un tag HTML sconosciuto a DokuWiki, che
  // di default mostra il contenuto con un banner "HTML ignorato". Scelta sicura
  // finche' non viene installato un plugin.
  | 'html'
  // Plugin "note" (description list): <note>...</note>, <tip>, <warning>, ...
  | 'note'
  // Plugin "wrap": <WRAP note>...</WRAP> con titolo opzionale.
  | 'wrap'

/** Cosa fare con il frontmatter YAML in testa al documento. */
export type FrontmatterHandling = 'remove' | 'comment' | 'keep'

/** Cosa fare con i tag Obsidian (`#tag`). */
export type TagHandling = 'remove' | 'note'

/** Come rendere i wikilink interni nella direzione Doku -> Obsidian. */
export type InternalLinkStyle = 'wikilink' | 'markdown'

/** Come rendere `==evidenziato==` in DokuWiki. */
export type HighlightStyle =
  // Tag nativo di DokuWiki, funziona senza plugin.
  | 'fc'
  // Plugin WRAP: <wrap hi>x</wrap>.
  | 'wrap'
  // HTML <mark>: richiede l'opzione htmlok sulla wiki.
  | 'mark'
  // Fallback senza alcun plugin.
  | 'bold'

/** Cosa fare con un blocco di codice dentro una voce di lista. */
export type CodeInListsStrategy =
  // Indenta <code> di 2 spazi per livello (mantiene la numerazione).
  | 'indent'
  // Avvolge il codice in <wrap code>...</wrap>.
  | 'wrap'
  // Lascia il blocco a colonna 0 accettando la rottura della lista (con avviso).
  | 'break'

export interface Options {
  /** Namespace anteposto ai wikilink. Vuoto = nessun namespace. */
  linkNamespace: string
  /** Namespace anteposto ai media negli embed. Vuoto = nessun namespace. */
  mediaNamespace: string
  calloutStyle: CalloutStyle
  frontmatter: FrontmatterHandling
  tags: TagHandling
  /** `true`: rimuove i commenti Obsidian `%%...%%`. `false`: li conserva come `%%...%%`. */
  removeObsidianComments: boolean
  /** `true`: converte `==x==` secondo `highlightStyle`. `false`: lascia `==x==` invariato. */
  convertHighlight: boolean
  /** Stile con cui rendere l'evidenziazione. */
  highlightStyle: HighlightStyle
  /** `true`: converte le checkbox `- [ ]`/`- [x]` in ☐/☑. `false`: le lascia invariate. */
  convertTasks: boolean
  /** Direzione Doku -> Obsidian: rendi i link interni come wikilink o link markdown. */
  internalLinks: InternalLinkStyle
  /** `true`: `[[Guida/Setup]]` -> `[[guida:setup]]` (le `/` di Obsidian sono cartelle). */
  preserveFolders: boolean
  /**
   * `true`: un a capo singolo dentro un paragrafo diventa `\\` (forzatura riga
   * DokuWiki), perche' DokuWiki fonde le righe consecutive. Non si applica a
   * codice, tabelle, liste, heading e citazioni.
   */
  preserveLineBreaks: boolean
  /** Strategia per i blocchi di codice dentro le liste. */
  codeInLists: CodeInListsStrategy
  /**
   * `true`: `![[Nota]]` -> `{{page>ns:nota}}` (plugin include). Altrimenti
   * degrada a link con avviso.
   */
  includeTransclusion: boolean
  /** Pulizia pre-conversione: rimuove le sezioni "Related"/backlink. */
  cleanupRelated: boolean
  /** Pulizia pre-conversione: spazi finali e righe vuote multiple fuori dal codice. */
  cleanupWhitespace: boolean
  /** Aggiunge un H1 dal nome file quando il documento non ha un titolo. */
  h1FromFileName: boolean
}

export const DEFAULT_OPTIONS: Options = {
  linkNamespace: '',
  mediaNamespace: '',
  calloutStyle: 'html',
  frontmatter: 'comment',
  tags: 'remove',
  removeObsidianComments: true,
  convertHighlight: true,
  highlightStyle: 'fc',
  convertTasks: true,
  internalLinks: 'wikilink',
  preserveFolders: true,
  preserveLineBreaks: true,
  codeInLists: 'indent',
  includeTransclusion: false,
  cleanupRelated: false,
  cleanupWhitespace: false,
  h1FromFileName: false,
}

/** Contesto non persistito passato ai motori (es. nome file per il batch). */
export interface ConversionContext {
  fileName?: string
}

export type WarningKind =
  | 'unsupported'
  | 'degraded'
  | 'info'
  | 'collision'

export interface ConversionWarning {
  /** Riga (1-based) del sorgente a cui si riferisce l'avviso. */
  line: number
  kind: WarningKind
  message: string
}

export interface ConversionResult {
  output: string
  warnings: ConversionWarning[]
}

/**
 * Normalizza un nome pagina Obsidian per DokuWiki:
 * minuscolo, spazi -> underscore, accenti rimossi, `:` preservato.
 * Le pagine DokuWiki sono automaticamente lowercase, quindi allinearsi evita
 * link rotti.
 */
export function normalizePageName(raw: string): string {
  const accented = 'àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ'
  const plain = 'aaaaaaaceeeeiiiinoooooouuuuyy'
  let out = ''
  for (const ch of raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
    const idx = accented.indexOf(ch)
    out += idx >= 0 ? plain[idx] : ch
  }
  return out
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:\-.]/g, '')
}

/** Costruisce il target di un link DokuWiki combinando namespace e pagina. */
export function joinNamespace(namespace: string, page: string): string {
  const ns = namespace.trim().replace(/^:|:$/g, '')
  return ns ? `${ns}:${page}` : page
}

/**
 * Normalizza un percorso Obsidian. In Obsidian `/` indica le cartelle del
 * vault; in DokuWiki la gerarchia si esprime con `:`. Con `preserveFolders`
 * i separatori diventano `:`, altrimenti vengono rimossi (comportamento piatto).
 */
export function normalizePath(raw: string, preserveFolders: boolean): string {
  const segments = raw
    .split('/')
    .map((segment) => normalizePageName(segment))
    .filter((segment) => segment !== '')
  return segments.join(preserveFolders ? ':' : '')
}
