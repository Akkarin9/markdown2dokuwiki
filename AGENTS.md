# AGENTS.md

## Repository state

Vite + React + TS + Tailwind (v4) + Vitest + CodeMirror 6. **Progetto completo**: motori (`src/converters/*`), UI (`src/App.tsx`, `src/components/*`), highlighting DokuWiki custom (`src/editor/dokuLanguage.ts`), opzioni + **profili** + **rilevamento plugin da frammento** (`src/lib/{profiles,plugins}.ts`), **batch ZIP** con namespace/allegati/report (`src/lib/batch.ts`), anteprima (`src/lib/preview.ts`), **diff** (`src/lib/diff.ts`), **cronologia IndexedDB** (`src/lib/history.ts`), **PWA** (`public/{manifest.webmanifest,sw.js}`), **CLI/libreria** (`src/cli/cli.ts`, `src/index.ts`), **plugin Obsidian** (`obsidian-plugin/`, riusa `../src`, con pannello laterale). **161 test verdi** (motore + smoke test UI). Repo pubblica: `Akkarin9/markdown2dokuwiki`. Le spec di partenza (`prompt.md`/`fase2.md`) sono state implementate e rimosse dal repo.

## Stack

Vite + React + TypeScript + Tailwind CSS v4 · Vitest (motore) · CodeMirror 6 · nessun backend, **tutta la conversione avviene nel browser, nessun dato lascia la pagina**.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (`tsc -b`) + build
- `npm run build:cli` — bundle della CLI in `dist-cli/` (esbuild)
- `npm run test` / `npx vitest run` — suite completa
- `npm run test:watch` — watch
- Singolo test: `npx vitest run src/converters/mdToDoku.test.ts -t "<nome test>"`
- `npm run typecheck` — solo `tsc -b --noEmit`
- CLI: `node dist-cli/md2doku.mjs <file-o-cartella> [--out <dir>] [--options <json>]`
- Aggiungere sempre test Vitest per ogni regola toccata e lanciare `npx vitest run` prima di considerare finito un cambiamento.

## Architecture rules (these are the easy things to get wrong)

- Keep the **conversion engine fully separate from the UI**. Pure functions returning `ConversionResult` (`{ output, warnings }`) in `src/converters/mdToDoku.ts` and `src/converters/dokuToMd.ts`.
- **No chained/fragile regex.** `mdToDoku.ts` first segments the doc into typed `Block`s (frontmatter, fence, heading, list, table, quote, paragraph) at line level; each text block then goes through `convertInline` in `src/converters/inline.ts`.
- **Code blocks are protected and must never be touched** — fenced code is extracted into `segments[]` and replaced by a placeholder before any formatting rule can see it. Same idea for inline code and `%%comments%%`: `convertInline` swaps each match for an opaque placeholder (`InlineProtector`) and restores it at the end, so one rule can never rewrite another rule's product.
- Rules are evaluated **in a fixed order** (comments → embeds/links → code → del → highlight → bold → italic → tags). Order matters: bold must run before italic or the italic regex eats a `*` of `**`.
- **Warnings, not silent failure.** Anything without a direct equivalent emits a `{ line, kind, message }` (`unsupported` | `degraded` | `info` | `collision`). Line numbers are 1-based and preserved through the frontmatter/footnote pre-passes (footnote definitions are blanked, not deleted, to keep indices stable).
- `Options` and defaults live in `src/converters/types.ts`; both directions share them.
- **Folder paths**: `normalizePath` maps Obsidian `/` folders to DokuWiki `:` namespaces (`[[Guida/Setup]]` → `[[guida:setup]]`), controlled by the `preserveFolders` option. `dokuToMd` inverts this (`:` → `/`) so round-trips stay stable. Media names go through the same normalization as page names.
- `![[...]]` is disambiguated by extension: an image/attachment becomes `{{...}}`, an extensionless target is treated as a **note transclusion** and degrades to a link + warning.
- `src/lib/preview.ts` renders the *output* only. The DokuWiki branch **HTML-escapes everything** before adding its own markup; the Markdown branch uses `markdown-it` with `html: false`. Keep it that way — the preview is injected with `dangerouslySetInnerHTML`.
- **Never use `stream.match(re)` with a non-anchored regex in the CodeMirror stream parser** (`src/editor/dokuLanguage.ts`). `stream.match` only advances if the match starts at the cursor; a non-anchored `re.test()` inside a scan loop both mis-detects and can fail to advance, which throws `Stream parser failed to advance stream` and **unmounts the whole React tree**. The parser anchors every inline matcher with `m.index === 0` and always guarantees forward progress.
- The UI holds two `Editor` instances; each stores its `EditorView` in a ref and syncs external value changes by diffing `doc.toString()`, so avoid feeding a value back on every keystroke.
- **CodeMirror is lazy-loaded**: `src/components/LazyEditor.tsx` wraps `Editor` in `React.lazy` + `Suspense`, so the editor lands in its own on-demand chunk and the app shell stays small. Keep new CodeMirror imports (or a second editor) behind the same boundary.
- **UI smoke test** `src/App.test.tsx` runs in `happy-dom` (per-file `@vitest-environment`). It mocks `LazyEditor` as a `<textarea>` because CodeMirror needs real layout APIs. When adding App-level behaviour, extend that file rather than reaching for a full browser.
- The real round-trip invariant is **md → doku → md → doku** being stable (i.e. `doku2 === doku1`), tested in `dokuToMd.test.ts`. `mdToDoku` is **not** idempotent on its own output: re-running it on Doku text would re-interpret `#` (Doku heading tag) and `:`-prefixed tokens differently. Don't assert `mdToDoku(mdToDoku(x)) === mdToDoku(x)`.
- Known lossy/collision points, all surfaced as warnings: frontmatter-as-`%%comment%%` is destroyed by a return pass when `removeObsidianComments` is on (`collision`); 2-space indented blocks are ambiguous between DokuWiki code blocks and list continuations (`collision`); DokuWiki has no table separator row, so MD alignment is re-derived from cell padding and a header is synthesized when absent.

## Non-obvious syntax mappings

MD → DokuWiki (inverse for Doku → MD):

- Headings: `# H1` → `====== H1 ======` (six `=`), down to `##### H5` → `== H5 ==`. **H6 maps to H5 with a warning.**
- Emphasis: bold `**x**` stays `**x**`; italic `*x*` / `_x_` → `//x//`; strikethrough `~~x~~` → `<del>x</del>`; inline code `` `x` `` → `''x''` (**DokuWiki uses doubled single-quotes, not backticks**); highlight `==x==` → `<fc #ffff00>x</fc>` (configurable).
- Links: `[t](url)` → `[[url|t]]`; images `![alt](src)` → `{{src|alt}}`; hr `---` → `----`; footnote `[^1]` → `((testo))`.
- Code blocks with language → `<code lang>...</code>`.
- Tables (header + alignment) → DokuWiki `^ header ^` / `| cella |`. Doku → MD handles `^`/`|` and `:::` merged cells with **graceful degradation**.
- Nested lists: DokuWiki indentation is **2 spaces + `*`** (bullets) or **`-`** (numbers) per level.

## Obsidian extensions (first-class, not an afterthought)

- Wikilinks `[[Pagina]]`, `[[Pagina|alias]]`, `[[Pagina#Sezione]]` → DokuWiki link using a **configurable namespace**. Page-name normalization: **lowercase, spaces → underscores, strip accents.** A wikilink without an explicit alias but with an anchor gets the alias `Pagina > Sezione`.
- Embeds `![[img.png]]`, `![[img.png|300]]` → `{{ns:img.png?300}}` with a separate configurable **media namespace**.
- Callouts `> [!note] Titolo` → `<WRAP>` plugin (alternative `<note>` plugin), mapping note/tip/warning/danger/info. Foldable (`[!note]-`) and nested (`>>`) callouts degrade with a warning.
- Frontmatter YAML: options to **remove / convert to comment / keep**.
- Tasks `- [ ]` / `- [x]` → textual ☐ / ☑.
- Comments `%%...%%` → removed (option). Tags `#tag` → removed or turned into a tag line (option).
- Single newlines → `\\` (option `preserveLineBreaks`, default **on**), never inside code/tables/lists/headings/quotes; the inverse turns `\\` back into a newline. A trailing Markdown hard-break (`\`) normalizes to the same `\\`.
- `==highlight==` → configurable via `highlightStyle` (`fc` default, `wrap`, `mark`, `bold`). Doku→MD recognises `<fc>`, `<mark>` and `<wrap hi>`.
- Mermaid / Dataview / Tasks / math `$$` → `<code>` + warning (`OBSIDIAN_BLOCK_LANGS` map in `mdToDoku.ts`).
- Code blocks inside list items → `codeInLists` strategy (`indent` default / `wrap` / `break`). Fence segments are extracted in `collectBlocks` and placed by a `SEGMENT_OPEN`/`SEGMENT_CLOSE` placeholder consumed by `renderList`; `dokuToMd` inverts it.
- Transclusion `![[Nota]]` → `{{page>ns:nota}}` when `includeTransclusion` is on, otherwise link + warning.

## Modules beyond the engine

- `src/lib/profiles.ts` — named `Options` sets, export/import JSON, `default` profile always present.
- `src/lib/plugins.ts` — `detectPlugins(fragment)` deduces DokuWiki plugins and returns an `Options` suggestion.
- `src/lib/batch.ts` — `buildBatchPlan` (pure) + `zipFromPlan`; output is `namespace/pagina.txt`, attachments in `media/`, `LEGGIMI.txt` + warnings, cross-batch internal-link resolution and `missingAttachments`.
- `src/lib/diff.ts` — LCS line diff for the side-by-side view.
- `src/lib/history.ts` — last 30 conversions in IndexedDB (degrades silently if unavailable).
- `src/cli/cli.ts` — `md2doku`/`doku2md` folder→folder CLI (esbuild bundle via `npm run build:cli`).
- `src/index.ts` — public library entry point re-exporting the engine.
- `obsidian-plugin/` — Obsidian plugin that **bundles `../src`** with esbuild (external only `obsidian`/`electron`/CodeMirror). It registers a **right-sidebar view** (`src/sidebar-view.ts`, ribbon icon + `open-sidebar` command) plus commands: convert current note / selection → DokuWiki, selection DokuWiki → MD, paste-import → new MD note, export folder → `namespace/pagina.txt`. Public methods (`runConvertNote`, `runConvertSelectionToDoku`, `runFolderExport`, `openImportModal`, `cycleOutputAction`) are shared by commands and the sidebar. Its settings map 1:1 to `Options`. Build/test with `cd obsidian-plugin && npm install && npm run build`. No `"type": "module"` in its `package.json` (the bundle is CJS, as Obsidian expects); `main.js` **is committed**.
- `docs/architettura.md` — full technical documentation (engine phases, rule order, decisions). `docs/obsidian-plugin.md` — plugin design notes.
- PWA: `public/manifest.webmanifest` + `public/sw.js`; registered in `src/main.tsx` only in `PROD`.

## UI constraints

- Two-pane layout with a **draggable divider** on desktop (pointer drag, `←/→` to nudge, `Home`/double-click to recenter, clamped 20–80%); the split state is **not persisted**. Below `lg:` the panes stack. Live conversion with debounce (250 ms).
- **Dark theme by default** (warm dark, violet/indigo accent like Obsidian) + light/system toggle; Inter and JetBrains Mono are **self-hosted** via `@fontsource-variable` (no Google Fonts request — the tool must not leak anything, including the visitor's IP). Theme toggled by the `.dark` class on `<html>`.
- **Branding assets** live in `media/` (source) and `public/` (optimized output), generated by `scripts/make-icons.py` (Pillow). `logo.png` is the wordmark used in the header, wrapped in a **dark chip** (`bg-[#16151b]`) because its central "2" is near-white and would vanish in the light theme. `icon-*.png`/`favicon.ico` are generated from the round icon; `icon-512-maskable.png` uses a full background so Android's mask never cuts the logo. Two gotchas the script handles: the sources carry a "Made with AI" badge (a separate band at the top), and in the favicon the "MD2DW" text is a **transparent hole** inside the circle that must be filled white. Icons are quantized to 256 colours (gradients, so visually lossless). Regenerate with `python3 scripts/make-icons.py`.
- Center **⇄ Inverti direzione** swaps direction *and* content. Direction is **chosen manually**; `src/lib/detect.ts` only *suggests* the other format as a clickable chip — it never switches on its own.
- **Tailwind sources are explicit** (`src/index.css` uses `@import 'tailwindcss' source(none)` + `@source './**/*.{ts,tsx}'` + `@source '../index.html'`). Do **not** revert to the default auto-scan: Tailwind would scan the whole folder, so the local build (which sees `obsidian-plugin/`) would produce a different CSS than the Docker build (where `.dockerignore` excludes it). Keeping the sources explicit makes local and production builds identical byte-for-byte.
- Buttons: copy output (primary accent button), a **File** menu (load / batch ZIP / download), clear, load example. Options side panel persisted to **localStorage** (`md2doku.options`, `md2doku.theme`, `md2doku.profiles`). The copied/downloaded file name comes from `deriveFileName` (frontmatter `title` → first heading → fallback).
- Shortcuts: `Ctrl/Cmd+K` command palette, `Ctrl/Cmd+Shift+C` copy output, `Ctrl/Cmd+Shift+S` invert, `Ctrl/Cmd+Shift+H` history, `Ctrl/Cmd+Shift+Z` save to history. Warning rows are clickable and scroll the input editor (`Editor` exposes an imperative `scrollToLine` handle + a temporary line decoration).
- Output pane toggles **Codice / Anteprima / Diff** (`PaneToggle`). Diff view takes a pasted baseline and shows added/removed lines.
- Status bar toggles: **Incolla e copia** (`autoCopy`) and **Scroll sync** (`scrollSync`); scroll sync drives both editors through a shared `scrollRatio` prop.
- **Deployed** at `https://convert.akkarin.org` via Traefik (`proxy` network, `cloudflare` certresolver). See `Dockerfile` / `docker-compose.yml` / `nginx.conf` (which also `no-cache`s `sw.js`), and the sibling services in `/home/akkarin/docker/*` for label conventions.

## Working agreement (explicitly requested by the user)

Work in steps and **stop to show state after each**. The project is feature-complete: webapp, CLI and Obsidian plugin (with sidebar) all share the engine. Always run `npx vitest run` and `npx tsc -b --noEmit` before reporting a change as done; for the plugin also `cd obsidian-plugin && npm run build`.

## Decisions taken with the user (do not re-litigate)

- **No DokuWiki plugin is installed** on the target wiki. Therefore the default `calloutStyle` is `'html'` (a plain `> **Label**` quote + a `degraded` warning); `'note'` and `'wrap'` stay selectable for when a plugin is added. Do **not** make `<WRAP>`/`<note>` the default.
- Default namespaces are **empty** for both links and media. The user sets them in the Options panel.
- Frontmatter handling default is **`'comment'`** (`%% ... %%` per line), not remove/keep.
- `internalLinks` default is **`'wikilink'`**, and internal namespaces are **kept** (`[[guide:nota|testo]]` → `[[guide:nota|testo]]`).
- Format **direction is chosen manually** in the UI; auto-detection is only a suggestion.
- Source **text is not persisted** across sessions (only options, theme and profiles are). The editor starts empty; "Esempio" loads the demo.
- **`highlightStyle` default is `'fc'`** (`<fc #ffff00>`), because it is native DokuWiki and needs no plugin; `wrap`/`mark`/`bold` are alternatives.
- **`preserveLineBreaks` default is `true`** (single newline → `\\`), since DokuWiki merges consecutive lines and the user wants Obsidian's line structure kept.
- **`codeInLists` default is `'indent'`** (2 spaces per level), so a numbered list keeps its numbering on the wiki.
- **`includeTransclusion` default is `false`**: the include plugin is not assumed; transclusion degrades to a link + warning.
- `cleanupRelated` / `cleanupWhitespace` / `h1FromFileName` default **off** (explicit opt-in, non-destructive).
- The demo round-trip test uses `frontmatter: 'keep'` because the `'comment'` default intentionally collides with Obsidian's `%%` comments (documented as a `collision` warning).
