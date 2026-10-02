#!/usr/bin/env node
/**
 * CLI `md2doku` / `doku2md`: converte file o intere cartelle riusando il motore.
 *
 * Uso:
 *   md2doku <input...> [--out <dir>] [--options <file.json>]
 *   doku2md <input...> [--out <dir>] [--options <file.json>]
 *
 * - Se `<input>` è una cartella, ricorsivamente converte `.md`/`.markdown`/`.txt`
 *   (md2doku) o `.txt`/`.doku` (doku2md).
 * - Senza `--out`, il risultato va in `<input-dir>/dokuwiki-out` o `markdown-out`.
 * - Le opzioni si leggono da un profilo JSON (vedi `exportProfiles`/README).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname, basename } from 'node:path'
import { mdToDoku } from '../converters/mdToDoku'
import { dokuToMd } from '../converters/dokuToMd'
import { DEFAULT_OPTIONS, type Options } from '../converters/types'

type Direction = 'md-to-doku' | 'doku-to-md'

const MD_EXT = new Set(['.md', '.markdown', '.txt'])
const DOKU_EXT = new Set(['.txt', '.doku', '.wiki'])

interface CliArgs {
  direction: Direction
  inputs: string[]
  out?: string
  options: Partial<Options>
}

function parseArgs(argv: string[], direction: Direction): CliArgs {
  const inputs: string[] = []
  let out: string | undefined
  let options: Partial<Options> = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--out' || arg === '-o') {
      out = argv[++i]
    } else if (arg === '--options' || arg === '-c') {
      const file = argv[++i]
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Options> & { options?: Partial<Options> }
      options = raw.options ?? raw
    } else if (arg === '--help' || arg === '-h') {
      printHelp(direction)
      process.exit(0)
    } else {
      inputs.push(arg)
    }
  }
  return { direction, inputs, out, options }
}

function printHelp(direction: Direction): void {
  const name = direction === 'md-to-doku' ? 'md2doku' : 'doku2md'
  process.stdout.write(
    `${name} — conversione ${direction === 'md-to-doku' ? 'Markdown → DokuWiki' : 'DokuWiki → Markdown'}\n\n` +
      `Uso: ${name} <file-o-cartella...> [--out <dir>] [--options <profili.json>]\n`,
  )
}

/** Elenca ricorsivamente i file con una delle estensioni accettate. */
function walk(path: string, extensions: Set<string>): string[] {
  const stat = statSync(path)
  if (stat.isFile()) return extensions.has(extname(path).toLowerCase()) ? [path] : []
  const out: string[] = []
  for (const entry of readdirSync(path)) {
    out.push(...walk(join(path, entry), extensions))
  }
  return out
}

function collectFiles(inputs: string[], direction: Direction): string[][] {
  const extensions = direction === 'md-to-doku' ? MD_EXT : DOKU_EXT
  const groups: string[][] = []
  for (const input of inputs) {
    groups.push(walk(input, extensions))
  }
  return groups
}

function run(argv: string[], direction: Direction): void {
  const args = parseArgs(argv, direction)
  if (args.inputs.length === 0) {
    printHelp(direction)
    process.exit(1)
  }

  const options: Options = { ...DEFAULT_OPTIONS, ...args.options }
  let converted = 0
  let warnings = 0

  const groups = collectFiles(args.inputs, direction)
  for (let g = 0; g < args.inputs.length; g += 1) {
    const input = args.inputs[g]
    const files = groups[g]
    const isDir = statSync(input).isDirectory()
    const outDir = args.out ?? (isDir ? join(input, direction === 'md-to-doku' ? 'dokuwiki-out' : 'markdown-out') : undefined)

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      const result = direction === 'md-to-doku' ? mdToDoku(content, options) : dokuToMd(content, options)
      const ext = direction === 'md-to-doku' ? '.txt' : '.md'
      const target = outDir
        ? join(outDir, basename(file).replace(extname(file), ext))
        : file.replace(extname(file), ext)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, result.output, 'utf8')
      converted += 1
      warnings += result.warnings.length
    }
  }

  process.stdout.write(`${converted} file convertiti, ${warnings} avvisi.\n`)
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'md2doku') {
  run(rest, 'md-to-doku')
} else if (cmd === 'doku2md') {
  run(rest, 'doku-to-md')
} else {
  // Chiamato direttamente (es. `node cli.js`): deduce la direzione dal nome.
  const name = basename(process.argv[1] ?? '')
  if (name.includes('doku2md')) run(rest, 'doku-to-md')
  else run(rest, 'md-to-doku')
}
