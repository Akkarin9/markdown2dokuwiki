import esbuild from 'esbuild'
import process from 'node:process'

const production = process.argv.includes('production')

/**
 * Il motore vive in `../src`: esbuild lo bundla direttamente nel `main.js` del
 * plugin. Solo i moduli forniti da Obsidian restano esterni.
 */
const context = await esbuild.context({
  entryPoints: ['main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
  ],
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  outfile: 'main.js',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  logLevel: 'info',
})

if (production) {
  await context.rebuild()
  await context.dispose()
} else {
  await context.watch()
}
