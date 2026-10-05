import { describe, expect, it } from 'vitest'
import { deriveFileName, slugify, countText } from './text'
import { convertBatchToZip, buildBatchPlan, renderReadme, outputPathFor } from './batch'
import { DEFAULT_OPTIONS } from '../converters/types'
import { detectFormat } from './detect'
import {
  createProfile,
  duplicateProfile,
  exportProfiles,
  importProfiles,
  makeDefaultProfile,
} from './profiles'
import { detectPlugins } from './plugins'
import { diffLines, diffStats } from './diff'

describe('text', () => {
  it('conta righe e caratteri', () => {
    expect(countText('')).toEqual({ lines: 0, chars: 0 })
    expect(countText('a\nb')).toEqual({ lines: 2, chars: 3 })
  })

  it('produce slug puliti', () => {
    expect(slugify('Guida alla Prenotazione!')).toBe('guida-alla-prenotazione')
    expect(slugify('Perché Usare')).toBe('perche-usare')
  })

  it('deriva il nome file dal frontmatter', () => {
    expect(deriveFileName('---\ntitle: Guida Sala\n---\n\n# Altro', 'md-to-doku')).toBe('guida-sala.txt')
  })

  it('deriva il nome file dal primo heading', () => {
    expect(deriveFileName('# Guida Rapida\n\ntesto', 'md-to-doku')).toBe('guida-rapida.txt')
    expect(deriveFileName('====== Guida Rapida ======\n', 'doku-to-md')).toBe('guida-rapida.md')
  })

  it('usa un fallback senza titolo', () => {
    expect(deriveFileName('solo testo', 'md-to-doku')).toBe('converted.txt')
  })
})

describe('detect', () => {
  it('riconosce il Markdown', () => {
    expect(detectFormat('# Titolo\n\n```ts\nx\n```')?.direction).toBe('md-to-doku')
  })

  it('riconosce il DokuWiki', () => {
    expect(detectFormat('====== Titolo ======\n\n<code bash>\nx\n</code>')?.direction).toBe('doku-to-md')
  })

  it('non si sbilancia su testo vuoto', () => {
    expect(detectFormat('   ')).toBeNull()
  })
})

describe('batch', () => {
  it('genera il nome di output corretto', () => {
    expect(outputPathFor('guida.md', 'md-to-doku', '')).toBe('guida.txt')
    expect(outputPathFor('guida.txt', 'doku-to-md', '')).toBe('guida.md')
    expect(outputPathFor('Guida Sala.md', 'md-to-doku', 'ns')).toBe('ns/guida_sala.txt')
  })

  it('converte piu file e produce uno zip', () => {
    const files = [
      { name: 'a.md', content: '# A\n\n**bold**' },
      { name: 'b.md', content: '# B' },
    ]
    const { blob, items } = convertBatchToZip(files, 'md-to-doku', DEFAULT_OPTIONS)
    expect(items).toHaveLength(2)
    expect(items[0].result.output).toContain('====== A ======')
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/zip')
  })

  it('deduplica i nomi in caso di collisione', () => {
    const files = [
      { name: 'stessa.md', content: '# Uno' },
      { name: 'stessa.markdown', content: '# Due' },
    ]
    const { blob } = convertBatchToZip(files, 'md-to-doku', DEFAULT_OPTIONS)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('struttura i file in namespace/pagina.txt', () => {
    const report = buildBatchPlan(
      [{ name: 'Guida Sala.md', content: '# Guida' }],
      'md-to-doku',
      DEFAULT_OPTIONS,
      [],
      { namespace: 'guide', mediaNamespace: '' },
    )
    expect(report.items[0].outputPath).toBe('guide/guida_sala.txt')
  })

  it('segnala i link verso note assenti dal batch', () => {
    const report = buildBatchPlan(
      [
        { name: 'A.md', content: 'Vedi [[B]] e [[Assente]].' },
        { name: 'B.md', content: '# B' },
      ],
      'md-to-doku',
      DEFAULT_OPTIONS,
    )
    expect(report.items[0].unresolved).toContain('Assente')
    expect(report.items[0].unresolved).not.toContain('B')
  })

  it('rileva e riscrive gli allegati presenti nel batch', () => {
    const png = new Uint8Array([1, 2, 3])
    const report = buildBatchPlan(
      [{ name: 'A.md', content: '![[Foto Estate.png]]' }],
      'md-to-doku',
      DEFAULT_OPTIONS,
      [{ name: 'Foto Estate.png', data: png }],
      { namespace: '', mediaNamespace: 'media' },
    )
    expect(report.attachments).toContain('foto_estate.png')
    expect(report.items[0].result.output).toContain('media:foto_estate.png')
  })

  it('elenca gli allegati referenziati ma mancanti', () => {
    const report = buildBatchPlan(
      [{ name: 'A.md', content: '![[mancante.png]]' }],
      'md-to-doku',
      DEFAULT_OPTIONS,
    )
    expect(report.missingAttachments).toContain('mancante.png')
  })

  it('genera un LEGGIMI con file, avvisi e allegati', () => {
    const png = new Uint8Array([1])
    const report = buildBatchPlan(
      [{ name: 'A.md', content: '![[x.png]]\n\n# Titolo\n\n###### H6' }],
      'md-to-doku',
      DEFAULT_OPTIONS,
      [{ name: 'x.png', data: png }],
      { namespace: 'ns', mediaNamespace: 'media' },
    )
    const readme = renderReadme(report, 'md-to-doku', 'ns')
    expect(readme).toContain('ns/a.txt')
    expect(readme).toContain('Avvisi:')
    expect(readme).toContain('media/x.png')
    expect(readme).toContain('Namespace di destinazione: ns')
  })
})

describe('profili', () => {
  it('crea, duplica ed esporta/importa un profilo', () => {
    const profile = createProfile('Lavoro', { ...DEFAULT_OPTIONS, linkNamespace: 'azienda' })
    expect(profile.name).toBe('Lavoro')
    expect(profile.options.linkNamespace).toBe('azienda')

    const copy = duplicateProfile(profile)
    expect(copy.name).toBe('Lavoro (copia)')
    expect(copy.id).not.toBe(profile.id)

    const json = exportProfiles([profile])
    const imported = importProfiles(json)
    expect(imported).toHaveLength(1)
    expect(imported![0].options.linkNamespace).toBe('azienda')
  })

  it('unisce i default alle opzioni parziali importate', () => {
    const imported = importProfiles(JSON.stringify({ version: 1, profiles: [{ name: 'Vecchio', options: { tags: 'note' } }] }))
    expect(imported![0].options.tags).toBe('note')
    expect(imported![0].options.calloutStyle).toBe(DEFAULT_OPTIONS.calloutStyle)
  })

  it('accetta anche un array semplice e scarta il JSON invalido', () => {
    expect(importProfiles('[{"name":"X"}]')).toHaveLength(1)
    expect(importProfiles('non json')).toBeNull()
    expect(importProfiles('{"version":1}')).toBeNull()
  })

  it('genera sempre un profilo predefinito', () => {
    expect(makeDefaultProfile().options).toEqual(DEFAULT_OPTIONS)
  })
})

describe('rilevamento plugin da frammento', () => {
  it('riconosce WRAP e include', () => {
    const res = detectPlugins('<WRAP warning Attenzione>\nciao\n</WRAP>\n\n{{page>guide:nota}}')
    expect(res.detected).toContain('wrap')
    expect(res.detected).toContain('include')
    expect(res.suggestion.calloutStyle).toBe('wrap')
    expect(res.suggestion.includeTransclusion).toBe(true)
  })

  it('riconosce il plugin note e tag', () => {
    const res = detectPlugins('<note Titolo>corpo</note>\n{{tag>a b}}')
    expect(res.detected).toContain('note')
    expect(res.detected).toContain('tag')
    expect(res.suggestion.calloutStyle).toBe('note')
    expect(res.suggestion.tags).toBe('note')
  })

  it('non rileva nulla su un frammento neutro', () => {
    const res = detectPlugins('**solo** //markdown// normale')
    expect(res.detected).toHaveLength(0)
    expect(res.notes).toHaveLength(0)
  })
})

describe('diff', () => {
  it('riconosce le righe aggiunte e rimosse', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc')
    expect(lines.map((l) => l.kind)).toEqual(['equal', 'removed', 'added', 'equal'])
  })

  it('conta le modifiche', () => {
    const stats = diffStats(diffLines('a\nb\nc', 'a\nB\nc'))
    expect(stats).toEqual({ added: 1, removed: 1, equal: 2 })
  })

  it('gestisce testi vuoti', () => {
    expect(diffLines('', '')).toEqual([])
    expect(diffLines('', 'x').map((l) => l.kind)).toEqual(['added'])
  })
})
