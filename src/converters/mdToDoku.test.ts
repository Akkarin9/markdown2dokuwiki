import { describe, expect, it } from 'vitest'
import { mdToDoku } from './mdToDoku'
import { convertInline } from './inline'
import { DEFAULT_OPTIONS, normalizePageName, joinNamespace } from './types'

const conv = (input: string, options = {}): string => mdToDoku(input, options).output

describe('utilities', () => {
  it('normalizza i nomi pagina (minuscolo, spazi, accenti)', () => {
    expect(normalizePageName('Perché Usare DokuWiki')).toBe('perche_usare_dokuwiki')
    expect(normalizePageName('Guida/Setup')).toBe('guidasetup')
    expect(normalizePageName('ns:Pagina')).toBe('ns:pagina')
  })

  it('combina namespace e pagina', () => {
    expect(joinNamespace('guide', 'pagina')).toBe('guide:pagina')
    expect(joinNamespace('', 'pagina')).toBe('pagina')
    expect(joinNamespace(':guide:', 'pagina')).toBe('guide:pagina')
  })
})

describe('inline', () => {
  it('converte grassetto, corsivo, barrato e codice', () => {
    expect(conv('**bold**')).toBe('**bold**\n')
    expect(conv('*italic* e _anche_')).toBe('//italic// e //anche//\n')
    expect(conv('~~gone~~')).toBe('<del>gone</del>\n')
    expect(conv('`code`')).toBe("''code''\n")
  })

  it('converte grassetto+corsivo annidato', () => {
    expect(conv('***forte***')).toBe('**//forte//**\n')
  })

  it('non tocca i marcatori con spazi interni', () => {
    expect(conv('** bold **')).toBe('** bold **\n')
  })

  it('non interpreta gli asterischi nelle moltiplicazioni', () => {
    expect(conv('2 * 3 * 4')).toBe('2 * 3 * 4\n')
  })

  it('converte highlight quando abilitato', () => {
    expect(conv('==evidenziato==')).toBe('<fc #ffff00>evidenziato</fc>\n')
    expect(conv('==evidenziato==', { convertHighlight: false })).toBe('==evidenziato==\n')
  })

  it('protegge il codice inline dal corsivo', () => {
    expect(conv("usa `a * b` qui")).toBe("usa ''a * b'' qui\n")
  })
})

describe('heading', () => {
  it('mappa H1..H5', () => {
    expect(conv('# Titolo')).toBe('====== Titolo ======\n')
    expect(conv('## Sezione')).toBe('===== Sezione =====\n')
    expect(conv('### Sub')).toBe('==== Sub ====\n')
    expect(conv('#### Q')).toBe('=== Q ===\n')
    expect(conv('##### R')).toBe('== R ==\n')
  })

  it('mappa H6 a H5 con avviso', () => {
    const out = mdToDoku('# Titolo\n\n###### Profondo')
    expect(out.output).toContain('== Profondo ==')
    expect(out.warnings.some((w) => w.kind === 'unsupported' && w.line === 3)).toBe(true)
  })

  it('supporta heading con # di chiusura', () => {
    expect(conv('## Sezione ##')).toBe('===== Sezione =====\n')
  })
})

describe('liste', () => {
  it('converte liste puntate annidate', () => {
    const md = '- uno\n- due\n  - due.a'
    expect(conv(md)).toBe('  * uno\n  * due\n    * due.a\n')
  })

  it('converte liste numerate', () => {
    const md = '1. primo\n2. secondo'
    expect(conv(md)).toBe('  - primo\n  - secondo\n')
  })

  it('converte task Obsidian', () => {
    expect(conv('- [ ] da fare\n- [x] fatto')).toBe('  * ☐ da fare\n  * ☑ fatto\n')
  })

  it('rispetta convertTasks: false', () => {
    expect(conv('- [ ] da fare', { convertTasks: false })).toBe('  * [ ] da fare\n')
  })
})

describe('code block', () => {
  it('converte una fence con linguaggio', () => {
    const md = '```ts\nconst x = 1\n```'
    expect(conv(md)).toBe('<code ts>\nconst x = 1\n</code>\n')
  })

  it('protegge il contenuto del codice da ogni regola', () => {
    const md = '```\n# non un heading\n**non bold**\n[[Non un link]]\n```'
    const out = conv(md)
    expect(out).toContain('# non un heading')
    expect(out).toContain('**non bold**')
    expect(out).toContain('[[Non un link]]')
  })

  it('converte fence senza linguaggio', () => {
    expect(conv('```\nplain\n```')).toBe('<code>\nplain\n</code>\n')
  })
})

describe('link e immagini', () => {
  it('converte link markdown', () => {
    expect(conv('[Google](https://google.com)')).toBe('[[https://google.com|Google]]\n')
  })

  it('converte immagini', () => {
    expect(conv('![logo](img/logo.png)')).toBe('{{img/logo.png|logo}}\n')
  })

  it('converte wikilink con namespace e normalizzazione', () => {
    expect(conv('Vedi [[Nota Importante]].', { linkNamespace: 'guide' })).toBe(
      'Vedi [[guide:nota_importante]].\n',
    )
  })

  it('converte wikilink con alias', () => {
    expect(conv('[[Pagina|testo]]')).toBe('[[pagina|testo]]\n')
  })

  it('converte wikilink con ancora', () => {
    expect(conv('[[Pagina#Sezione Uno]]')).toBe('[[pagina#sezione_uno|Pagina > Sezione Uno]]\n')
  })

  it('converte le sottocartelle Obsidian in namespace DokuWiki', () => {
    expect(conv('[[Guida/Setup]]')).toBe('[[guida:setup]]\n')
    expect(conv('[[Progetti/Alfa/Riunione]]')).toBe('[[progetti:alfa:riunione]]\n')
    expect(conv('[[Guida/Setup]]', { preserveFolders: false })).toBe('[[guidasetup]]\n')
  })

  it('combina namespace esplicito e sottocartelle', () => {
    expect(conv('[[Guida/Setup]]', { linkNamespace: 'wiki' })).toBe('[[wiki:guida:setup]]\n')
  })

  it('converte embed immagine con larghezza', () => {
    expect(conv('![[img.png|300]]')).toBe('{{img.png?300}}\n')
    expect(conv('![[img.png|300x200]]')).toBe('{{img.png?300x200}}\n')
  })

  it('converte embed immagine con didascalia e namespace media', () => {
    expect(conv('![[img.png|La mia foto]]', { mediaNamespace: 'media' })).toBe(
      '{{media:img.png|La mia foto}}\n',
    )
  })

  it('normalizza il nome del media (spazi e accenti)', () => {
    expect(conv('![[Foto Estate.png]]')).toBe('{{foto_estate.png}}\n')
  })

  it('degrada l embed di una nota (transclusione) con avviso', () => {
    const res = mdToDoku('![[Nota Importante]]')
    expect(res.output).toBe('[[nota_importante]]\n')
    expect(res.warnings.some((w) => w.kind === 'degraded' && w.message.includes('Embed di nota'))).toBe(true)
  })
})

describe('citazioni, hr e footnote', () => {
  it('converte hr', () => {
    expect(conv('---')).toBe('----\n')
  })

  it('converte citazioni semplici', () => {
    expect(conv('> una citazione')).toBe('> una citazione\n')
  })

  it('converte footnote definita', () => {
    const md = 'Testo[^1]\n\n[^1]: la nota'
    expect(conv(md)).toBe('Testo((la nota))\n')
  })

  it('degrada una footnote senza definizione con avviso', () => {
    const res = mdToDoku('Testo[^manca]')
    expect(res.output).toContain('[^manca]')
    expect(res.warnings.some((w) => w.kind === 'degraded')).toBe(true)
  })
})

describe('tabelle', () => {
  it('converte una tabella con header e allineamento', () => {
    const md = '| A | B |\n|:--|--:|\n| 1 | 2 |'
    // A = sinistra (uno spazio a sinistra), B = destra (due spazi a sinistra).
    expect(conv(md)).toBe('^ A ^  B ^\n| 1 |  2 |\n')
  })

  it('converte una tabella semplice', () => {
    const md = '| Nome | Età |\n| --- | --- |\n| Ada | 36 |'
    expect(conv(md)).toBe('^ Nome ^ Età ^\n| Ada | 36 |\n')
  })

  it('gestisce il pipe escapato nelle celle', () => {
    const md = '| A | B |\n| --- | --- |\n| a \\| b | c |'
    expect(conv(md)).toContain('| a | b | c |')
  })

  it('degrada le celle multi-riga con <br>', () => {
    const res = mdToDoku('| A | B |\n| --- | --- |\n| riga1<br>riga2 | c |')
    expect(res.output).toContain('riga1<br>riga2')
    expect(res.warnings.some((w) => w.message.includes('Cella multi-riga'))).toBe(true)
  })
})

describe('callout Obsidian', () => {
  it('stile html (fallback senza plugin) genera citazione e avviso', () => {
    const res = mdToDoku('> [!note] Titolo\n> contenuto')
    expect(res.output).toContain('> **Titolo**')
    expect(res.output).toContain('> contenuto')
    expect(res.warnings.length).toBeGreaterThan(0)
  })

  it('stile note genera <note>', () => {
    const out = conv('> [!warning] Attenzione\n> corpo', { calloutStyle: 'note' })
    expect(out).toBe('<warning Attenzione>\ncorpo\n</warning>\n')
  })

  it('stile wrap genera <WRAP>', () => {
    const out = conv('> [!tip] Suggerimento\n> corpo', { calloutStyle: 'wrap' })
    expect(out).toBe('<WRAP tip Suggerimento>\ncorpo\n</WRAP>\n')
  })

  it('usa un tipo sconosciuto senza crash', () => {
    const out = conv('> [!custom] X\n> y', { calloutStyle: 'note' })
    expect(out).toContain('<note X>')
  })
})

describe('frontmatter', () => {
  const md = '---\ntitle: Guida\ntags: [a, b]\n---\n\n# Titolo'

  it('commento per default', () => {
    expect(conv(md)).toBe('%% title: Guida %%\n%% tags: [a, b] %%\n\n====== Titolo ======\n')
  })

  it('rimuove se richiesto', () => {
    expect(conv(md, { frontmatter: 'remove' })).toBe('====== Titolo ======\n')
  })

  it('tiene se richiesto', () => {
    expect(conv(md, { frontmatter: 'keep' })).toBe(
      '---\ntitle: Guida\ntags: [a, b]\n---\n\n====== Titolo ======\n',
    )
  })

  it('non tocca un documento che inizia con --- non frontmatter', () => {
    const res = mdToDoku('---\n\nsolo testo')
    expect(res.warnings.some((w) => w.kind === 'degraded')).toBe(true)
  })
})

describe('commenti e tag Obsidian', () => {
  it('rimuove i commenti %% per default', () => {
    expect(conv('prima %% nascosto %% dopo')).toBe('prima  dopo\n')
  })

  it('conserva i commenti se richiesto', () => {
    expect(conv('prima %%nascosto%% dopo', { removeObsidianComments: false })).toBe(
      'prima %%nascosto%% dopo\n',
    )
  })

  it('rimuove i tag per default', () => {
    expect(conv('testo #progetto qui')).toBe('testo qui\n')
  })

  it('raccoglie i tag in una riga {{tag>...}}', () => {
    const res = mdToDoku('#progetto testo #altro', { tags: 'note' })
    expect(res.output).toContain('{{tag>progetto altro}}')
  })

  it('non confonde un heading con un tag', () => {
    expect(conv('# Titolo')).toBe('====== Titolo ======\n')
  })
})

describe('avvisi HTML', () => {
  it('segnala i tag HTML sconosciuti', () => {
    const res = mdToDoku('<div class="x">ciao</div>')
    expect(res.warnings.some((w) => w.kind === 'unsupported' && w.message.includes('div'))).toBe(true)
  })

  it('non segnala i tag con equivalente', () => {
    const res = mdToDoku('H<sub>2</sub>O e <del>no</del>')
    expect(res.warnings).toHaveLength(0)
  })
})

describe('documento completo', () => {
  it('converte i costrutti comuni in un unico documento', () => {
    const md = [
      '# Titolo',
      '',
      'Paragrafo con **grassetto** e *corsivo* e `codice`.',
      '',
      '- punto uno',
      '- punto due',
      '  - annidato',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '---',
      '',
      '> citazione',
    ].join('\n')
    const out = conv(md)
    expect(out).toContain('====== Titolo ======')
    expect(out).toContain('**grassetto** e //corsivo// e \'\'codice\'\'')
    expect(out).toContain('  * punto uno\n  * punto due\n    * annidato')
    expect(out).toContain('^ A ^ B ^\n| 1 | 2 |')
    expect(out).toContain('----')
    expect(out).toContain('> citazione')
  })

  it('il contenuto dei blocchi di codice sopravvive a testo misto', () => {
    const md = 'testo\n\n```python\n# commento\nx = "**no**"\n```\n\naltro'
    expect(conv(md)).toBe('testo\n\n<code python>\n# commento\nx = "**no**"\n</code>\n\naltro\n')
  })

  it('rispetta le opzioni di default documentate', () => {
    expect(DEFAULT_OPTIONS.frontmatter).toBe('comment')
    expect(DEFAULT_OPTIONS.calloutStyle).toBe('html')
  })
})

describe('convertInline isolato', () => {
  it('restituisce i placeholder risolti', () => {
    const out = convertInline('**a** e `b`', [
      { pattern: /`([^`]+)`/g, replace: (m) => `''${m[1]}''` },
      { pattern: /\*\*(.+?)\*\*/g, replace: (m) => `**${m[1]}**` },
    ])
    expect(out).toBe("**a** e ''b''")
  })
})

describe('a capo singoli (preserveLineBreaks)', () => {
  it('inserisce \\\\ a fine riga nei paragrafi multi-riga', () => {
    expect(conv('prima riga\nseconda riga')).toBe('prima riga \\\\\nseconda riga\n')
  })

  it('non tocca un paragrafo su una sola riga', () => {
    expect(conv('una sola riga')).toBe('una sola riga\n')
  })

  it('non si applica dentro liste, citazioni e heading', () => {
    const md = '# Titolo\n\n- uno\n- due\n\n> citazione'
    const out = conv(md)
    expect(out).not.toContain('Titolo \\\\')
    expect(out).not.toContain('uno \\\\')
    expect(out).not.toContain('citazione \\\\')
  })

  it('può essere disattivato', () => {
    expect(conv('prima\nseconda', { preserveLineBreaks: false })).toBe('prima\nseconda\n')
  })

  it('normalizza un hard break Markdown a \\\\', () => {
    expect(conv('prima\\\nseconda')).toBe('prima \\\\\nseconda\n')
  })
})

describe('stili di evidenziazione', () => {
  it('usa <fc> per default', () => {
    expect(conv('==x==')).toBe('<fc #ffff00>x</fc>\n')
  })

  it('usa <wrap hi>', () => {
    expect(conv('==x==', { highlightStyle: 'wrap' })).toBe('<wrap hi>x</wrap>\n')
  })

  it('usa <mark>', () => {
    expect(conv('==x==', { highlightStyle: 'mark' })).toBe('<mark>x</mark>\n')
  })

  it('usa il grassetto come fallback', () => {
    expect(conv('==x==', { highlightStyle: 'bold' })).toBe('**x**\n')
  })
})

describe('codice dentro le liste', () => {
  const md = '1. Passo uno\n2. Passo due\n\n   ```bash\n   npm install\n   ```\n\n3. Passo tre'

  it('indenta il blocco di codice (default)', () => {
    const out = conv(md)
    expect(out).toContain('  <code bash>')
    expect(out).toContain('  npm install')
  })

  it('usa <WRAP> quando richiesto', () => {
    const out = conv(md, { codeInLists: 'wrap' })
    expect(out).toContain('<WRAP code bash>')
    expect(out).toContain('npm install')
  })

  it('accetta la rottura con avviso', () => {
    const res = mdToDoku(md, { codeInLists: 'break' })
    expect(res.output).toContain('<code bash>')
    expect(res.output).toContain('\nnpm install')
    expect(res.warnings.some((w) => w.message.includes('colonna 0'))).toBe(true)
  })
})

describe('transclusione con plugin include', () => {
  it('genera {{page>...}} quando l\'opzione è attiva', () => {
    const res = mdToDoku('![[Nota Importante]]', { includeTransclusion: true, linkNamespace: 'guide' })
    expect(res.output).toBe('{{page>guide:nota_importante}}\n')
    expect(res.warnings.some((w) => w.message.includes('include'))).toBe(true)
  })
})

describe('fallback Mermaid, math e plugin Obsidian', () => {
  it('rende Mermaid come <code> con avviso', () => {
    const res = mdToDoku('```mermaid\ngraph TD; A-->B;\n```')
    expect(res.output).toBe('<code mermaid>\ngraph TD; A-->B;\n</code>\n')
    expect(res.warnings.some((w) => w.kind === 'degraded' && w.message.includes('mermaid'))).toBe(true)
  })

  it('rende un blocco matematico $$ come <code math> con avviso', () => {
    const res = mdToDoku('$$\nE = mc^2\n$$')
    expect(res.output).toBe('<code math>\nE = mc^2\n</code>\n')
    expect(res.warnings.some((w) => w.message.includes('matematico'))).toBe(true)
  })

  it('segnala un blocco Dataview', () => {
    const res = mdToDoku('```dataview\nTABLE x FROM #tag\n```')
    expect(res.output).toContain('<code dataview>')
    expect(res.warnings.some((w) => w.kind === 'unsupported')).toBe(true)
  })
})

describe('callout pieghevoli e annidati', () => {
  it('degrada un callout pieghevole con avviso', () => {
    const res = mdToDoku('> [!note]- Pieghevole\n> contenuto', { calloutStyle: 'note' })
    expect(res.output).toBe('<note Pieghevole>\ncontenuto\n</note>\n')
    expect(res.warnings.some((w) => w.message.includes('pieghevole'))).toBe(true)
  })

  it('degrada un callout annidato con avviso', () => {
    const res = mdToDoku('> [!note] Esterno\n> contenuto\n> > interno', { calloutStyle: 'note' })
    expect(res.warnings.some((w) => w.message.includes('annidato'))).toBe(true)
  })
})

describe('pulizia pre-conversione', () => {
  it('rimuove le sezioni Related', () => {
    const md = '# Titolo\n\nCorpo.\n\n## Related\n\n- [[Altra nota]]\n\n## Dopo\n\ntesto'
    const out = conv(md, { cleanupRelated: true })
    expect(out).not.toContain('Altra nota')
    expect(out).toContain('Dopo')
  })

  it('normalizza spazi finali e righe vuote multiple', () => {
    const out = conv('testo   \n\n\n\naltro', { cleanupWhitespace: true })
    expect(out).toBe('testo\n\naltro\n')
  })
})

describe('H1 dal nome file', () => {
  it('aggiunge un H1 quando manca un titolo', () => {
    const res = mdToDoku('solo testo', { h1FromFileName: true }, { fileName: 'Guida Sala.md' })
    expect(res.output).toContain('====== Guida Sala ======')
    expect(res.warnings.some((w) => w.message.includes('nome file'))).toBe(true)
  })

  it('non aggiunge nulla se esiste già un H1', () => {
    const res = mdToDoku('# Già qui', { h1FromFileName: true }, { fileName: 'Guida.md' })
    expect(res.output).not.toContain('====== Guida ======')
  })
})
