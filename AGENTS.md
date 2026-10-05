# AGENTS.md

## Repository state

Motore di conversione **Markdown (Obsidian) ⇄ DokuWiki** (`src/converters/*`) più il **plugin Obsidian** (`obsidian-plugin/`, che riusa `../src` via esbuild, con pannello laterale). Supporto riusabile in `src/lib/` (batch ZIP, anteprima, profili, rilevamento plugin/formato, diff, cronologia, testo). **155 test verdi** (motore + supporto). Repo pubblica: `Akkarin9/markdown2dokuwiki`. Non c'è più webapp, CLI né deploy container: il consumatore del motore è il plugin.

## Stack

TypeScript · Vitest (motore) · esbuild (bundle del plugin) · nessun backend, **tutta la conversione avviene in locale, nessun dato esce dalla macchina**.

## Commands

- `npm install` — dipendenze del motore/supporto (root)
- `npm run test` / `npx vitest run` — suite completa (155 test)
- `npm run test:watch` — watch
- Singolo test: `npx vitest run src/converters/mdToDoku.test.ts -t "<nome test>"`
- `npm run typecheck` — solo `tsc -b --noEmit`
- `npm run build` — build del plugin (`npm --prefix obsidian-plugin run build`)
- Plugin: `cd obsidian-plugin && npm install && npm run build` (typecheck + bundle in `main.js`) / `npm run dev` (watch)
- Aggiungere sempre test Vitest per ogni regola toccata e lanciare `npx vitest run` e `npx tsc -b --noEmit` prima di considerare finito un cambiamento.

## Architecture rules (these are the easy things to get wrong)

- Keep the **conversion engine fully separate from any UI/host**. Pure functions returning `ConversionResult` (`{ output, warnings }`) in `src/converters/mdToDoku.ts` and `src/converters/dokuToMd.ts`.
- **No chained/fragile regex.** `mdToDoku.ts` first segments the doc into typed `Block`s (frontmatter, fence, heading, list, table, quote, paragraph) at line level; each text block then goes through `convertInline` in `src/converters/inline.ts`.
- **Code blocks are protected and must never be touched** — fenced code is extracted into `segments[]` and replaced by a placeholder before any formatting rule can see it. Same idea for inline code and `%%comments%%`: `convertInline` swaps each match for an opaque placeholder (`InlineProtector`) and restores it at the end, so one rule can never rewrite another rule's product.
- Rules are evaluated **in a fixed order** (comments → embeds/links → code → del → highlight → bold → italic → tags). Order matters: bold must run before italic or the italic regex eats a `*` of `**`.
- **Warnings, not silent failure.** Anything without a direct equivalent emits a `{ line, kind, message }` (`unsupported` | `degraded` | `info` | `collision`). Line numbers are 1-based and preserved through the frontmatter/footnote pre-passes (footnote definitions are blanked, not deleted, to keep indices stable).
- `Options` and defaults live in `src/converters/types.ts`; both directions share them.
- **Folder paths**: `normalizePath` maps Obsidian `/` folders to DokuWiki `:` namespaces (`[[Guida/Setup]]` → `[[guida:setup]]`), controlled by the `preserveFolders` option. `dokuToMd` inverts this (`:` → `/`) so round-trips stay stable. Media names go through the same normalization as page names.
- `![[...]]` is disambiguated by extension: an image/attachment becomes `{{...}}`, an extensionless target is treated as a **note transclusion** and degrades to a link + warning.
- `src/lib/preview.ts` renders the *output* only. The DokuWiki branch **HTML-escapes everything** before adding its own markup; the Markdown branch uses `markdown-it` with `html: false`. Keep it that way if any host injects it with `dangerouslySetInnerHTML`.
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

- `src/lib/batch.ts` — `buildBatchPlan` (pure) + `zipFromPlan`/`convertBatchToZip`; output is `namespace/pagina.txt`, attachments in `media/`, `LEGGIMI.txt` + warnings, cross-batch internal-link resolution and `missingAttachments`.
- `src/lib/preview.ts` — approximate HTML rendering of the output (`renderDoku`/`renderMarkdown`).
- `src/lib/profiles.ts` — named `Options` sets, export/import JSON, `default` profile always present.
- `src/lib/plugins.ts` — `detectPlugins(fragment)` deduces DokuWiki plugins and returns an `Options` suggestion.
- `src/lib/detect.ts` — `detectFormat(text)` heuristic; return value is only a **suggestion**, direction is always chosen explicitly by the host.
- `src/lib/diff.ts` — LCS line diff (`diffLines`/`diffStats`).
- `src/lib/history.ts` — last 30 conversions in IndexedDB (degrades silently where unavailable; not used by the plugin today).
- `src/lib/text.ts` — counters, slug, `deriveFileName`.
- `src/lib/example.ts` — demo Markdown/DokuWiki documents (used by the round-trip test).
- `obsidian-plugin/` — Obsidian plugin that **bundles `../src`** with esbuild (at runtime only `obsidian` stays external; the bundle now also includes `markdown-it` via `src/lib/preview.ts`, so `main.js` is ~300 KB). Registers a **right-sidebar view** (`src/sidebar-view.ts`, ribbon icon + `open-sidebar` command), an **editor context menu**, a **status bar item**, and commands: convert current note / selection → DokuWiki, selection DokuWiki → MD, paste-import → new MD note, export folder → `namespace/pagina.txt` + `media/`. `export-folder.ts` writes the namespace path as **real subfolders** and copies referenced attachments into `media/` (`app.metadataCache.getFirstLinkpathDest` + `vault.readBinary`). Warnings are surfaced as a **clickable Notice → `WarningsModal`** that jumps to the source line. Settings (`src/settings.ts`) cover all `Options` **plus** plugin-only `outputAction`/`outputExtension`/`convertOnSave` and named **profiles** (persisted in `data.json` via `src/lib/profiles.ts` helpers, not `localStorage`). `convertOnSave` rewrites the sibling `.txt` on every `.md` `vault.on('modify')`. Import preview uses `renderMarkdown` (`markdown-it`, `html: false`). `src/prompt-modal.ts` provides the input modals (text/multiline/confirm). `src/updater.ts` implements the **GitHub self-update**: it fetches `manifest.json`/`main.js`/`styles.css` from `raw.githubusercontent.com/Akkarin9/markdown2dokuwiki/main/obsidian-plugin/` via `requestUrl` (CORS-free, mobile-safe), compares versions, asks for confirmation, and writes them into `${vault.configDir}/plugins/<id>/` with the vault adapter; it is exposed as the `check-updates` command, a settings button and a sidebar button (needs a reload to take effect). Public methods (`runConvertNote`, `runConvertSelectionToDoku`, `runFolderExport`, `openImportModal`, `cycleOutputAction`) are shared by commands and the sidebar. Build/test with `cd obsidian-plugin && npm install && npm run build`. No `"type": "module"` in its `package.json` (the bundle is CJS, as Obsidian expects); `main.js` **is committed** and `versions.json` maps versions to `minAppVersion`. CI is `.github/workflows/ci.yml`.
- `docs/architettura.md` — full technical documentation (engine phases, rule order, decisions). `docs/obsidian-plugin.md` — plugin design notes.

## Working agreement (explicitly requested by the user)

Work in steps and **stop to show state after each**. The engine and the Obsidian plugin (with sidebar) share the same sources. Always run `npx vitest run` and `npx tsc -b --noEmit` before reporting a change as done; for the plugin also `cd obsidian-plugin && npm run build`.

## Decisions taken with the user (do not re-litigate)

- **No DokuWiki plugin is installed** on the target wiki. Therefore the default `calloutStyle` is `'html'` (a plain `> **Label**` quote + a `degraded` warning); `'note'` and `'wrap'` stay selectable for when a plugin is added. Do **not** make `<WRAP>`/`<note>` the default.
- Default namespaces are **empty** for both links and media. The user sets them in the Options panel.
- Frontmatter handling default is **`'comment'`** (`%% ... %%` per line), not remove/keep.
- `internalLinks` default is **`'wikilink'`**, and internal namespaces are **kept** (`[[guide:nota|testo]]` → `[[guide:nota|testo]]`).
- Format **direction is chosen manually**; auto-detection is only a suggestion.
- **`highlightStyle` default is `'fc'`** (`<fc #ffff00>`), because it is native DokuWiki and needs no plugin; `wrap`/`mark`/`bold` are alternatives.
- **`preserveLineBreaks` default is `true`** (single newline → `\\`), since DokuWiki merges consecutive lines and the user wants Obsidian's line structure kept.
- **`codeInLists` default is `'indent'`** (2 spaces per level), so a numbered list keeps its numbering on the wiki.
- **`includeTransclusion` default is `false`**: the include plugin is not assumed; transclusion degrades to a link + warning.
- `cleanupRelated` / `cleanupWhitespace` / `h1FromFileName` default **off** (explicit opt-in, non-destructive).
- The demo round-trip test uses `frontmatter: 'keep'` because the `'comment'` default intentionally collides with Obsidian's `%%` comments (documented as a `collision` warning).
