/**
 * Infrastruttura per la conversione `inline` (dentro una singola riga).
 *
 * Le regole inline vengono applicate una dopo l'altra su una stringa. Per
 * evitare che una regola successiva riscriva l'output di una precedente (es.
 * il corsivo che mangia un asterisco del grassetto), ogni match viene sostituito
 * con un placeholder opaco che conserva l'output gia' calcolato; i placeholder
 * vengono ripristinati solo allo scopo di ridare la stringa finale.
 *
 * I placeholder usano i caratteri di controllo U+0000 / U+0001, che non
 * compaiono in testo normale.
 */

const PH = (index: number): string => `\u0000${index}\u0001`

export class InlineProtector {
  private readonly out: string[] = []

  /** Registra l'output renderizzato e restituisce il placeholder che lo rappresenta. */
  keep(rendered: string): string {
    const index = this.out.length
    this.out.push(rendered)
    return PH(index)
  }

  /** Sostituisce tutti i placeholder con il loro output renderizzato. */
  restore(text: string): string {
    return text.replace(/\u0000(\d+)\u0001/g, (_, digits: string) => this.out[Number(digits)] ?? '')
  }
}

export interface InlineRule {
  /** Deve essere globale; se non lo e' viene forzato. */
  pattern: RegExp
  /** Restituisce il testo di rimpiazzo; usare `protector.keep` per proteggere l'output. */
  replace: (match: RegExpExecArray, protector: InlineProtector) => string
}

/** Applica una singola regola sostituendo ogni match con un placeholder. */
function applyRule(text: string, rule: InlineRule, protector: InlineProtector): string {
  const source = rule.pattern.source
  const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g'
  const re = new RegExp(source, flags)
  let result = ''
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    // Protezione contro regex capaci di match vuoto (evita loop infiniti).
    if (match.index === re.lastIndex) re.lastIndex += 1
    result += text.slice(last, match.index)
    result += protector.keep(rule.replace(match, protector))
    last = match.index + match[0].length
  }
  result += text.slice(last)
  return result
}

/** Applica una sequenza di regole inline protette. */
export function convertInline(text: string, rules: InlineRule[]): string {
  const protector = new InlineProtector()
  let current = text
  for (const rule of rules) current = applyRule(current, rule, protector)
  return protector.restore(current)
}

/** Marcatore usato per proteggere i segmenti (`code`, `math`) a livello di blocco. */
export const SEGMENT_OPEN = '\u0002'
export const SEGMENT_CLOSE = '\u0003'

export function segmentPlaceholder(index: number): string {
  return `${SEGMENT_OPEN}${index}${SEGMENT_CLOSE}`
}

export function isSegmentPlaceholder(line: string): number | null {
  const m = /^\u0002(\d+)\u0003$/.exec(line)
  return m ? Number(m[1]) : null
}

/** Indenta ogni riga di una lista DokuWiki: 2 spazi per livello. */
export function dokuListIndent(level: number): string {
  return '  '.repeat(Math.max(0, level))
}
