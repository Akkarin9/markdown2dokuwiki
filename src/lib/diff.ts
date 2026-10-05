/**
 * Diff a livello di riga (algoritmo LCS) per la vista di confronto tra
 * l'output attuale e una versione precedente. Funzione pura, testabile.
 */

export type DiffKind = 'equal' | 'added' | 'removed'

export interface DiffLine {
  kind: DiffKind
  text: string
  /** Numero di riga nel documento di sinistra (1-based), se presente. */
  left?: number
  /** Numero di riga nel documento di destra (1-based), se presente. */
  right?: number
}

/** Calcola l'LCS tra due array di righe e restituisce la sequenza di diff. */
export function diffLines(leftText: string, rightText: string): DiffLine[] {
  const left = leftText === '' ? [] : leftText.replace(/\n$/, '').split('\n')
  const right = rightText === '' ? [] : rightText.replace(/\n$/, '').split('\n')

  // Tabella LCS (lunghezze).
  const n = left.length
  const m = right.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      out.push({ kind: 'equal', text: left[i], left: i + 1, right: j + 1 })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'removed', text: left[i], left: i + 1 })
      i += 1
    } else {
      out.push({ kind: 'added', text: right[j], right: j + 1 })
      j += 1
    }
  }
  while (i < n) {
    out.push({ kind: 'removed', text: left[i], left: i + 1 })
    i += 1
  }
  while (j < m) {
    out.push({ kind: 'added', text: right[j], right: j + 1 })
    j += 1
  }
  return out
}

export interface DiffStats {
  added: number
  removed: number
  equal: number
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (acc, line) => {
      acc[line.kind === 'equal' ? 'equal' : line.kind === 'added' ? 'added' : 'removed'] += 1
      return acc
    },
    { added: 0, removed: 0, equal: 0 },
  )
}
