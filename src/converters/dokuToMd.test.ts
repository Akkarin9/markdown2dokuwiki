import { describe, expect, it } from 'vitest'
import { dokuToMd } from './dokuToMd'
import { mdToDoku } from './mdToDoku'
import { EXAMPLE_MARKDOWN } from '../lib/example'

const conv = (input: string, options = {}): string => dokuToMd(input, options).output

describe('heading', () => {
  it('mappa H1..H5', () => {
    expect(conv('====== Titolo ======')).toBe('# Titolo\n')
    expect(conv('===== Sezione =====')).toBe('## Sezione\n')
    expect(conv('==== Sub ====')).toBe('### Sub\n')
    expect(conv('=== Q ===')).toBe('#### Q\n')
    expect(conv('== R ==')).toBe('##### R\n')
  })

  it('normalizza heading con soli due =', () => {
    expect(conv('== Solo ==')).toBe('##### Solo\n')
  })
})

describe('inline', () => {
  it('converte grassetto, corsivo, barrato, codice', () => {
    expect(conv('**bold**')).toBe('**bold**\n')
    expect(conv('//italic//')).toBe('*italic*\n')
    expect(conv('<del>gone</del>')).toBe('~~gone~~\n')
    expect(conv("''code''")).toBe('`code`\n')
  })

  it('non trasforma un URL in corsivo', () => {
    expect(conv('Vedi https://example.com/path qui')).toBe('Vedi https://example.com/path qui\n')
  })

  it('converte sottolineato con avviso', () => {
    const res = dokuToMd('__testo__')
    expect(res.output).toBe('<u>testo</u>\n')
    expect(res.warnings.some((w) => w.kind === 'degraded')).toBe(true)
  })

  it('converte highlight', () => {
    expect(conv('<fc #ffff00>x</fc>')).toBe('==x==\n')
  })

  it('converte anche <mark> e <wrap hi>', () => {
    expect(conv('<mark>x</mark>')).toBe('==x==\n')
    expect(conv('<wrap hi>x</wrap>')).toBe('==x==\n')
  })

  it('gestisce <nowiki>', () => {
    expect(conv('<nowiki>**letterale**</nowiki>')).toBe('**letterale**\n')
  })
})

describe('liste', () => {
  it('converte liste puntate annidate', () => {
    expect(conv('  * uno\n  * due\n    * due.a')).toBe('- uno\n- due\n  - due.a\n')
  })

  it('converte liste numerate', () => {
    expect(conv('  - primo\n  - secondo')).toBe('1. primo\n1. secondo\n')
  })

  it('converte i task ☐/☑ in checkbox', () => {
    expect(conv('  * ☐ da fare\n  * ☑ fatto')).toBe('- [ ] da fare\n- [x] fatto\n')
  })
})

describe('blocchi di codice', () => {
  it('converte <code lang>', () => {
    expect(conv('<code ts>\nconst x = 1\n</code>')).toBe('```ts\nconst x = 1\n```\n')
  })

  it('converte <file> e segnala il nome file', () => {
    const res = dokuToMd('<file php esempio.php>\n<?php\n</file>')
    expect(res.output).toBe('```php\n<?php\n```\n')
    expect(res.warnings.some((w) => w.message.includes('esempio.php'))).toBe(true)
  })

  it('sceglie una fence piu lunga se il contenuto contiene backtick', () => {
    expect(conv('<code>\na ``` b\n</code>')).toBe('````\na ``` b\n````\n')
  })
})

describe('link e media', () => {
  it('converte link esterni', () => {
    expect(conv('[[https://google.com|Google]]')).toBe('[Google](https://google.com)\n')
  })

  it('converte link interni in wikilink, namespace -> cartelle', () => {
    expect(conv('[[guide:nota|testo]]')).toBe('[[guide/nota|testo]]\n')
    expect(conv('[[guide:nota]]')).toBe('[[guide/nota]]\n')
  })

  it('mantiene i namespace se preserveFolders e disattivato', () => {
    expect(conv('[[guide:nota|testo]]', { preserveFolders: false })).toBe('[[guidenota|testo]]\n')
  })

  it('converte link interni in link markdown se richiesto', () => {
    expect(conv('[[guide:nota|testo]]', { internalLinks: 'markdown' })).toBe('[testo](guide:nota)\n')
  })

  it('converte immagini', () => {
    expect(conv('{{img/logo.png}}')).toBe('![[img/logo.png]]\n')
    expect(conv('{{img/logo.png|logo}}')).toBe('![logo](img/logo.png)\n')
  })

  it('preserva la dimensione come embed Obsidian', () => {
    expect(conv('{{foto.jpg?400}}')).toBe('![[foto.jpg|400]]\n')
  })

  it('converte la transclusione {{page>...}} in embed', () => {
    const res = dokuToMd('{{page>guide:nota}}')
    expect(res.output).toBe('![[guide:nota]]\n')
    expect(res.warnings.some((w) => w.message.includes('Transclusione'))).toBe(true)
  })
})

describe('citazioni, callout, hr', () => {
  it('converte hr', () => {
    expect(conv('----')).toBe('---\n')
  })

  it('converte citazioni annidate', () => {
    expect(conv('> primo\n>> annidato')).toBe('> primo\n> > annidato\n')
  })

  it('converte <WRAP> in callout', () => {
    expect(conv('<WRAP tip Suggerimento>\ncorpo\n</WRAP>')).toBe('> [!tip] Suggerimento\n> corpo\n')
  })

  it('converte il plugin note in callout', () => {
    expect(conv('<warning Attenzione>\ncorpo\n</warning>')).toBe('> [!warning] Attenzione\n> corpo\n')
  })

  it('ricava il titolo dal grassetto se il tag non lo ha', () => {
    expect(conv('<note>\n**Nota**\n\ncorpo\n</note>')).toBe('> [!note] Nota\n> corpo\n')
  })
})

describe('tabelle', () => {
  it('converte una tabella con header', () => {
    expect(conv('^ A ^ B ^\n| 1 | 2 |')).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n')
  })

  it('rispetta l\'allineamento', () => {
    expect(conv('^ A ^  B ^\n| 1 |  2 |')).toBe('| A | B |\n| --- | ---: |\n| 1 | 2 |\n')
  })

  it('degrada il colspan con avviso', () => {
    const res = dokuToMd('^ A ^ B ^\n| 1 | 2 ||')
    expect(res.output).toContain('| 1 | 2 |')
    expect(res.warnings.some((w) => w.message.includes('colspan'))).toBe(true)
  })

  it('degrada il rowspan con avviso', () => {
    const res = dokuToMd('^ A ^ B ^\n| 1 | ::: |')
    expect(res.warnings.some((w) => w.message.includes('rowspan'))).toBe(true)
  })
})

describe('footnote e tag', () => {
  it('converte footnote inline in definizioni accodate', () => {
    expect(conv('Testo((la nota)).')).toBe('Testo[^1].\n\n[^1]: la nota\n')
  })

  it('converte la riga {{tag>...}} in tag Obsidian', () => {
    expect(conv('testo\n\n{{tag>a b}}', { tags: 'note' })).toBe('testo\n\n#a #b\n')
  })

  it('rimuove la riga {{tag>...}} per default', () => {
    expect(conv('testo\n\n{{tag>a b}}')).toBe('testo\n')
  })
})

describe('convertInline e avvisi', () => {
  it('segnala i tag HTML sconosciuti', () => {
    const res = dokuToMd('<div>ciao</div>')
    expect(res.warnings.some((w) => w.kind === 'unsupported')).toBe(true)
  })
})

describe('round-trip md -> doku -> md', () => {
  const stable = (md: string, options = {}): void => {
    const doku1 = mdToDoku(md, options).output
    const mdBack = dokuToMd(doku1, options).output
    const doku2 = mdToDoku(mdBack, options).output
    expect(doku2).toBe(doku1)
  }

  it('regge inline e heading', () => {
    stable('# Titolo\n\nTesto con **grassetto**, *corsivo* e `codice`.')
  })

  it('regge barrato e highlight', () => {
    stable('~~barrato~~ e ==evidenziato==')
  })

  it('regge liste e task', () => {
    stable('- uno\n- due\n  - annidato\n\n- [ ] da fare\n- [x] fatto')
  })

  it('regge link, immagini e hr', () => {
    stable('[Google](https://google.com)\n\n![logo](img/logo.png)\n\n---')
  })

  it('regge i blocchi di codice', () => {
    stable('```ts\nconst x = **1**\n```')
  })

  it('regge le tabelle', () => {
    stable('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('regge le footnote', () => {
    stable('Testo[^1].\n\n[^1]: la nota')
  })

  it('regge i callout con stile note', () => {
    stable('> [!warning] Attenzione\n> corpo', { calloutStyle: 'note' })
  })

  it('regge i wikilink gia normalizzati', () => {
    stable('Vedi [[guide:nota_importante]].')
  })

  it('regge le sottocartelle Obsidian', () => {
    stable('Vedi [[Guida/Setup]] e [[Progetti/Alfa|il progetto]].')
  })

  it('regge il frontmatter con modalita keep', () => {
    stable('---\ntitle: Guida\n---\n\n# Titolo', { frontmatter: 'keep' })
  })

  it('segnala la collisione frontmatter/commenti in modalita comment', () => {
    const res = mdToDoku('---\ntitle: Guida\n---\n\n# Titolo', { frontmatter: 'comment' })
    expect(res.warnings.some((w) => w.kind === 'collision')).toBe(true)
  })

  it('regge gli a capo singoli', () => {
    stable('prima riga\nseconda riga\nterza')
  })

  it('regge lo stile highlight wrap', () => {
    stable('Testo ==evidenziato== qui', { highlightStyle: 'wrap' })
  })

  it('regge un blocco matematico', () => {
    stable('$$\nE = mc^2\n$$')
  })

  it('regge il codice dentro una lista', () => {
    stable('1. Passo uno\n2. Passo due\n\n   ```bash\n   npm install\n   ```\n\n3. Passo tre')
  })

  it('regge il documento demo completo', () => {
    stable(EXAMPLE_MARKDOWN, { frontmatter: 'keep' })
  })
})
