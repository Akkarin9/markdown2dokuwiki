"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => Md2DokuPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian7 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");

// ../src/converters/types.ts
var DEFAULT_OPTIONS = {
  linkNamespace: "",
  mediaNamespace: "",
  calloutStyle: "html",
  frontmatter: "comment",
  tags: "remove",
  removeObsidianComments: true,
  convertHighlight: true,
  highlightStyle: "fc",
  convertTasks: true,
  internalLinks: "wikilink",
  preserveFolders: true,
  preserveLineBreaks: true,
  codeInLists: "indent",
  includeTransclusion: false,
  cleanupRelated: false,
  cleanupWhitespace: false,
  h1FromFileName: false
};
function normalizePageName(raw) {
  const accented = "\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFD\xFF";
  const plain = "aaaaaaaceeeeiiiinoooooouuuuyy";
  let out = "";
  for (const ch of raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) {
    const idx = accented.indexOf(ch);
    out += idx >= 0 ? plain[idx] : ch;
  }
  return out.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_:\-.]/g, "");
}
function joinNamespace(namespace, page) {
  const ns = namespace.trim().replace(/^:|:$/g, "");
  return ns ? `${ns}:${page}` : page;
}
function normalizePath(raw, preserveFolders) {
  const segments = raw.split("/").map((segment) => normalizePageName(segment)).filter((segment) => segment !== "");
  return segments.join(preserveFolders ? ":" : "");
}

// ../src/converters/inline.ts
var PH = (index) => `\0${index}`;
var InlineProtector = class {
  out = [];
  /** Registra l'output renderizzato e restituisce il placeholder che lo rappresenta. */
  keep(rendered) {
    const index = this.out.length;
    this.out.push(rendered);
    return PH(index);
  }
  /** Sostituisce tutti i placeholder con il loro output renderizzato. */
  restore(text) {
    return text.replace(/\u0000(\d+)\u0001/g, (_, digits) => this.out[Number(digits)] ?? "");
  }
};
function applyRule(text, rule, protector) {
  const source = rule.pattern.source;
  const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
  const re = new RegExp(source, flags);
  let result = "";
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index === re.lastIndex) re.lastIndex += 1;
    result += text.slice(last, match.index);
    result += protector.keep(rule.replace(match, protector));
    last = match.index + match[0].length;
  }
  result += text.slice(last);
  return result;
}
function convertInline(text, rules) {
  const protector = new InlineProtector();
  let current = text;
  for (const rule of rules) current = applyRule(current, rule, protector);
  return protector.restore(current);
}
var SEGMENT_OPEN = "";
var SEGMENT_CLOSE = "";
function segmentPlaceholder(index) {
  return `${SEGMENT_OPEN}${index}${SEGMENT_CLOSE}`;
}
function isSegmentPlaceholder(line) {
  const m = /^\u0002(\d+)\u0003$/.exec(line);
  return m ? Number(m[1]) : null;
}

// ../src/converters/mdToDoku.ts
var FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
var HEADING_RE = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
var HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
var LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
var QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
var TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
var FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:\s*(.*)$/;
var FRONTMATTER_DELIM = /^---\s*$/;
var MATH_DELIM_RE = /^\s*\$\$\s*$/;
var OBSIDIAN_BLOCK_LANGS = {
  mermaid: "degraded",
  dataview: "unsupported",
  dataviewjs: "unsupported",
  tasks: "unsupported",
  math: "degraded",
  tex: "degraded",
  latex: "degraded"
};
var KNOWN_HTML = /* @__PURE__ */ new Set(["sub", "sup", "del", "code", "nowiki", "br", "u"]);
function handleFrontmatter(lines, options, prefix, warnings) {
  if (lines.length < 2 || !FRONTMATTER_DELIM.test(lines[0])) return lines;
  const closing = lines.findIndex((line, i) => i > 0 && FRONTMATTER_DELIM.test(line));
  if (closing < 0) {
    warnings.push({
      line: 1,
      kind: "degraded",
      message: "Frontmatter YAML aperto ma mai chiuso: lasciato invariato."
    });
    return lines;
  }
  const yaml = lines.slice(1, closing);
  switch (options.frontmatter) {
    case "remove":
      break;
    case "keep":
      prefix.push("---", ...yaml, "---");
      break;
    case "comment":
    default:
      for (const line of yaml) prefix.push(line ? `%% ${line} %%` : "%% %%");
      if (options.removeObsidianComments) {
        warnings.push({
          line: 1,
          kind: "collision",
          message: "Frontmatter reso come commenti `%%...%%`: sono anche commenti Obsidian, quindi verranno rimossi in una conversione di ritorno."
        });
      }
      break;
  }
  return lines.slice(closing + 1);
}
function extractFootnotes(lines) {
  const defs = /* @__PURE__ */ new Map();
  const body = lines.map((line) => {
    const m = FOOTNOTE_DEF_RE.exec(line);
    if (!m) return line;
    defs.set(m[1].trim(), m[2].trim());
    return "";
  });
  return { defs, body };
}
function collectBlocks(lines, segments, warnings) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[2][0];
      const closingRe = new RegExp(`^\\s{0,3}${marker === "`" ? "`" : "~"}{${fence[2].length},}\\s*$`);
      const body = [];
      let j2 = i + 1;
      while (j2 < lines.length && !closingRe.test(lines[j2])) {
        body.push(lines[j2]);
        j2 += 1;
      }
      if (j2 >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: "degraded",
          message: "Blocco di codice recintato non chiuso: chiuso automaticamente a fine documento."
        });
      }
      const segmentIndex = segments.length;
      segments.push({ content: body.join("\n"), lang: fence[3] || "" });
      blocks.push({ type: "code", line: lineNo, lines: body, segmentIndex });
      i = j2 < lines.length ? j2 + 1 : j2;
      continue;
    }
    if (MATH_DELIM_RE.test(line)) {
      const body = [];
      let j2 = i + 1;
      while (j2 < lines.length && !MATH_DELIM_RE.test(lines[j2])) {
        body.push(lines[j2]);
        j2 += 1;
      }
      if (j2 >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: "degraded",
          message: "Blocco matematico `$$` non chiuso: chiuso automaticamente a fine documento."
        });
      }
      warnings.push({
        line: lineNo,
        kind: "degraded",
        message: "Blocco matematico `$$`: reso come `<code math>` (DokuWiki non renderizza LaTeX senza plugin)."
      });
      const segmentIndex = segments.length;
      segments.push({ content: body.join("\n"), lang: "math" });
      blocks.push({ type: "code", line: lineNo, lines: body, segmentIndex });
      i = j2 < lines.length ? j2 + 1 : j2;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: "heading", line: lineNo, lines: [line] });
      i += 1;
      continue;
    }
    if (HR_RE.test(line) && !LIST_RE.test(line)) {
      blocks.push({ type: "hr", line: lineNo, lines: [line] });
      i += 1;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      const rows = [line, lines[i + 1]];
      let j2 = i + 2;
      while (j2 < lines.length && lines[j2].includes("|") && lines[j2].trim() !== "") {
        rows.push(lines[j2]);
        j2 += 1;
      }
      blocks.push({ type: "table", line: lineNo, lines: rows });
      i = j2;
      continue;
    }
    if (LIST_RE.test(line)) {
      const rows = [];
      let j2 = i;
      while (j2 < lines.length) {
        const candidate = lines[j2];
        if (candidate.trim() === "") {
          let k = j2;
          while (k < lines.length && lines[k].trim() === "") k += 1;
          if (k >= lines.length) break;
          const next = lines[k];
          const nextFence = /^(\s+)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.test(next);
          const continues = nextFence || LIST_RE.test(next) || /^\s{2,}\S/.test(next);
          if (!continues) break;
          for (let b = j2; b < k; b += 1) rows.push("");
          j2 = k;
          continue;
        }
        const indentedFence = /^(\s+)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.exec(candidate);
        if (indentedFence) {
          const marker = indentedFence[2][0];
          const closingRe = new RegExp(`^\\s{0,3}${marker === "`" ? "`" : "~"}{${indentedFence[2].length},}\\s*$`);
          const body = [];
          let k = j2 + 1;
          while (k < lines.length && !closingRe.test(lines[k])) {
            body.push(lines[k].replace(/^\s{1,4}/, ""));
            k += 1;
          }
          const segmentIndex = segments.length;
          segments.push({ content: body.join("\n"), lang: indentedFence[3] || "" });
          rows.push(segmentPlaceholder(segmentIndex));
          j2 = k < lines.length ? k + 1 : k;
          continue;
        }
        if (LIST_RE.test(candidate)) {
          rows.push(candidate);
          j2 += 1;
          continue;
        }
        if (/^\s{2,}\S/.test(candidate) && !HEADING_RE.test(candidate)) {
          rows.push(candidate);
          j2 += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", line: lineNo, lines: rows });
      i = j2;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const rows = [];
      let j2 = i;
      while (j2 < lines.length && QUOTE_RE.test(lines[j2])) {
        rows.push(lines[j2]);
        j2 += 1;
      }
      blocks.push({ type: "quote", line: lineNo, lines: rows });
      i = j2;
      continue;
    }
    const para = [line];
    let j = i + 1;
    while (j < lines.length) {
      const candidate = lines[j];
      if (candidate.trim() === "" || FENCE_RE.test(candidate) || MATH_DELIM_RE.test(candidate) || HEADING_RE.test(candidate) || QUOTE_RE.test(candidate) || LIST_RE.test(candidate) || HR_RE.test(candidate) && !LIST_RE.test(candidate) || candidate.includes("|") && TABLE_SEPARATOR_RE.test(lines[j + 1] ?? "")) {
        break;
      }
      para.push(candidate);
      j += 1;
    }
    blocks.push({ type: "paragraph", line: lineNo, lines: para });
    i = j;
  }
  return blocks;
}
var MEDIA_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|ogv|mov|ogg|mp3|wav|flac|m4a|pdf)$/i;
function buildInlineRules(options, footnotes, warnings, line, tagSet) {
  const mediaFile = (name) => joinNamespace(options.mediaNamespace, normalizePageName(name.trim().replace(/\s+/g, "_")));
  const rules = [
    // Commenti Obsidian: rimossi (default) oppure protetti cosi' le regole
    // successive non ne toccano il contenuto.
    options.removeObsidianComments ? { pattern: /%%[\s\S]*?%%/g, replace: () => "" } : { pattern: /%%[\s\S]*?%%/g, replace: (m) => m[0] },
    // Embed Obsidian: ![[img.png]], ![[img.png|300]], ![[img.png|didascalia]].
    // `![[...]]` in Obsidian puo' essere un'immagine/allegato O una transclusione
    // di nota; li distinguiamo per estensione.
    {
      pattern: /!\[\[([^\]|]+?)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g,
      replace: (m) => {
        const raw = m[1].trim();
        const anchor = m[2] ? normalizePath(m[2], options.preserveFolders) : "";
        const alias = (m[3] ?? "").trim();
        if (!MEDIA_EXT_RE.test(raw)) {
          const page = joinNamespace(options.linkNamespace, normalizePath(raw, options.preserveFolders));
          if (options.includeTransclusion) {
            warnings.push({
              line,
              kind: "degraded",
              message: `Embed di nota ![[${raw}]]: reso con il plugin include {{page>${page}}}.`
            });
            return `{{page>${page}}}`;
          }
          warnings.push({
            line,
            kind: "degraded",
            message: `Embed di nota ![[${raw}]]: reso come link alla pagina (nessun equivalente di transclusione).`
          });
          const target2 = page + (anchor ? `#${anchor}` : "");
          return alias ? `[[${target2}|${alias}]]` : `[[${target2}]]`;
        }
        const target = mediaFile(raw);
        if (!alias) return `{{${target}}}`;
        if (/^\d+(x\d+)?$/.test(alias)) return `{{${target}?${alias}}}`;
        return `{{${target}|${alias}}}`;
      }
    },
    // Wikilink Obsidian: [[Pagina]], [[Pagina|alias]], [[Pagina#Sezione]].
    // Le `/` di Obsidian sono cartelle -> namespace DokuWiki.
    {
      pattern: /\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g,
      replace: (m) => {
        const rawPage = m[1].trim();
        const page = normalizePath(m[1], options.preserveFolders);
        const anchor = m[2] ? normalizePageName(m[2]) : "";
        let alias = m[3]?.trim();
        const target = joinNamespace(options.linkNamespace, page) + (anchor ? `#${anchor}` : "");
        if (!alias && anchor) alias = `${rawPage} > ${m[2].trim()}`;
        return alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
      }
    },
    // Immagine Markdown: ![alt](src "titolo")
    {
      pattern: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      replace: (m) => `{{${m[2]}${m[1].trim() ? `|${m[1].trim()}` : ""}}}`
    },
    // Link Markdown: [testo](url "titolo")
    {
      pattern: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      replace: (m) => `[[${m[2]}|${m[1]}]]`
    },
    // Footnote: [^label] -> ((testo)) se definito, altrimenti degrada.
    {
      pattern: /\[\^([^\]]+)\]/g,
      replace: (m) => {
        const label = m[1].trim();
        const text = footnotes.get(label);
        if (text === void 0) {
          warnings.push({
            line,
            kind: "degraded",
            message: `Riferimento a footnote [^${label}] senza definizione: lasciato invariato.`
          });
          return m[0];
        }
        return `((${text}))`;
      }
    },
    // Codice inline: `x` -> ''x''  (DokuWiki usa apici doppi, non backtick)
    { pattern: /`([^`]+)`/g, replace: (m) => `''${m[1]}''` },
    // Barrato: ~~x~~ -> <del>x</del>
    { pattern: /~~(?=\S)(.+?)(?<=\S)~~/g, replace: (m) => `<del>${m[1]}</del>` }
  ];
  if (options.convertHighlight) {
    const highlight = (inner) => {
      switch (options.highlightStyle) {
        case "wrap":
          return `<wrap hi>${inner}</wrap>`;
        case "mark":
          return `<mark>${inner}</mark>`;
        case "bold":
          return `**${inner}**`;
        case "fc":
        default:
          return `<fc #ffff00>${inner}</fc>`;
      }
    };
    rules.push({
      pattern: /(?<!=)==(?=\S)([^=\n]+?)(?<=\S)==(?!=)/g,
      replace: (m) => highlight(m[1])
    });
  }
  rules.push(
    { pattern: /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, replace: (m) => `**//${m[1]}//**` },
    { pattern: /___(?=\S)(.+?)(?<=\S)___/g, replace: (m) => `**//${m[1]}//**` },
    { pattern: /\*\*(?=\S)(.+?)(?<=\S)\*\*/g, replace: (m) => `**${m[1]}**` },
    { pattern: /__(?=\S)(.+?)(?<=\S)__/g, replace: (m) => `**${m[1]}**` },
    { pattern: /(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, replace: (m) => `//${m[1]}//` },
    { pattern: /(?<![_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![_\w])/g, replace: (m) => `//${m[1]}//` }
  );
  rules.push({
    pattern: /(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu,
    replace: (m) => {
      if (options.tags === "note") tagSet.add(m[2]);
      return "";
    }
  });
  return rules;
}
function renderCode(segment, lineNo, warnings) {
  const lang = segment.lang.toLowerCase();
  const kind = OBSIDIAN_BLOCK_LANGS[lang];
  if (kind && lang !== "math" && lang !== "tex" && lang !== "latex") {
    warnings.push({
      line: lineNo,
      kind,
      message: `Blocco \`${segment.lang}\`: plugin Obsidian senza equivalente DokuWiki, reso come <code>.`
    });
  }
  const open = segment.lang ? `<code ${segment.lang}>` : "<code>";
  return `${open}
${segment.content}
</code>`;
}
function renderHeading(text, lineNo, warnings) {
  const m = HEADING_RE.exec(text);
  if (!m) return text;
  let level = m[1].length;
  const title = m[2].trim();
  if (level >= 6) {
    level = 5;
    warnings.push({
      line: lineNo,
      kind: "unsupported",
      message: "Heading H6 non supportato da DokuWiki (max 5 livelli): convertito in H5."
    });
  }
  const eq = "=".repeat(7 - level);
  return `${eq} ${title} ${eq}`;
}
function splitRow(row) {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  for (let k = 0; k < trimmed.length; k += 1) {
    const ch = trimmed[k];
    if (ch === "\\" && trimmed[k + 1] === "|") {
      current += "|";
      k += 1;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}
function parseAlignments(separator) {
  return splitRow(separator).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}
function dokuCell(cell, align) {
  if (align === "right") return `  ${cell} `;
  if (align === "center") return `  ${cell}  `;
  return ` ${cell} `;
}
function cleanLine(text) {
  return text.replace(/[ \t]+$/, "");
}
function renderTable(block, options, footnotes, warnings, tagSet) {
  const [headerRow, separator, ...bodyRows] = block.lines;
  const aligns = parseAlignments(separator);
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet);
  const convert = (text) => {
    if (/<br\s*\/?>/i.test(text)) {
      warnings.push({
        line: block.line,
        kind: "degraded",
        message: "Cella multi-riga (`<br>`): DokuWiki non supporta le righe nelle celle, resa su una sola riga."
      });
    }
    return convertInline(text, rules);
  };
  const render = (cells, isHeader) => {
    const sep = isHeader ? "^" : "|";
    const body = cells.map((cell, idx) => dokuCell(convert(cell), aligns[idx] ?? null)).join(sep);
    return `${sep}${body}${sep}`;
  };
  const out = [render(splitRow(headerRow), true)];
  for (const row of bodyRows) out.push(render(splitRow(row), false));
  return out.join("\n");
}
function renderList(block, options, footnotes, warnings, tagSet, segments) {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet);
  const out = [];
  let pendingLevel = 0;
  for (const raw of block.lines) {
    if (raw.trim() === "") {
      out.push("");
      continue;
    }
    const ph = isSegmentPlaceholder(raw);
    if (ph !== null) {
      const segment = segments[ph];
      const open = segment.lang ? `<code ${segment.lang}>` : "<code>";
      const codeBlock = `${open}
${segment.content}
</code>`;
      if (options.codeInLists === "break") {
        warnings.push({
          line: block.line,
          kind: "degraded",
          message: "Blocco di codice dentro una lista: emesso a colonna 0, la lista ripartir\xE0 da 1 in DokuWiki."
        });
        out.push(codeBlock);
      } else if (options.codeInLists === "wrap") {
        const cls = segment.lang ? `code ${segment.lang}` : "code";
        out.push(`<WRAP ${cls}>
${segment.content}
</WRAP>`);
      } else {
        const indent2 = "  ".repeat(Math.max(0, pendingLevel));
        const indented = codeBlock.split("\n").map((l) => l === "" ? l : indent2 + l).join("\n");
        out.push(indented);
      }
      continue;
    }
    const m = LIST_RE.exec(raw);
    if (!m) {
      out.push(`  ${convertInline(raw.trim(), rules)}`);
      continue;
    }
    const indent = m[1].replace(/\t/g, "  ").length;
    const level = Math.floor(indent / 2) + 1;
    pendingLevel = level;
    const ordered = /\d/.test(m[2]);
    const marker = ordered ? "-" : "*";
    let content = m[3];
    const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
    if (task && options.convertTasks) {
      content = `${task[1].toLowerCase() === "x" ? "\u2611" : "\u2610"} ${task[2]}`;
    }
    out.push(cleanLine(`${"  ".repeat(level)}${marker} ${convertInline(content, rules)}`));
  }
  return out.join("\n");
}
var CALLOUT_RE = /^\[!([\w-]+)\]([+-])?(?:\s+(.*))?$/;
var CALLOUT_LABEL = {
  note: "Nota",
  info: "Info",
  tip: "Suggerimento",
  hint: "Suggerimento",
  warning: "Attenzione",
  caution: "Attenzione",
  danger: "Pericolo",
  error: "Errore",
  important: "Importante",
  success: "Fatto",
  question: "Domanda",
  example: "Esempio",
  quote: "Citazione"
};
var NOTE_PLUGIN_TAG = {
  note: "note",
  info: "note",
  tip: "tip",
  hint: "tip",
  success: "tip",
  warning: "warning",
  caution: "warning",
  danger: "important",
  error: "important",
  important: "important"
};
var WRAP_CLASS = {
  note: "note",
  info: "info",
  tip: "tip",
  hint: "tip",
  success: "tip",
  warning: "warning",
  caution: "warning",
  danger: "danger",
  error: "danger",
  important: "important"
};
function renderCallout(type, title, body, options, footnotes, warnings, line, tagSet) {
  const key = type.toLowerCase();
  const rules = buildInlineRules(options, footnotes, warnings, line, tagSet);
  const renderBody = () => body.map((l) => l.trim() === "" ? "" : convertInline(l, rules)).join("\n");
  const label = title.trim() || CALLOUT_LABEL[key] || type;
  switch (options.calloutStyle) {
    case "wrap": {
      const cls = WRAP_CLASS[key] ?? "note";
      return `<WRAP ${cls} ${label}>
${renderBody()}
</WRAP>`;
    }
    case "note": {
      const tag = NOTE_PLUGIN_TAG[key] ?? "note";
      return `<${tag} ${label}>
${renderBody()}
</${tag}>`;
    }
    case "html":
    default: {
      warnings.push({
        line,
        kind: "degraded",
        message: `Callout "${key}" reso come citazione: nessun plugin callout installato.`
      });
      const head = `> **${label}**`;
      const rest = body.map((l) => l.trim() === "" ? ">" : `> ${convertInline(l, rules)}`).join("\n");
      return rest ? `${head}
${rest}` : head;
    }
  }
}
function renderQuote(block, options, footnotes, warnings, tagSet) {
  const inner = block.lines.map((l) => QUOTE_RE.exec(l)?.[1] ?? l);
  const callout = CALLOUT_RE.exec(inner[0].trim());
  if (callout) {
    const fold = callout[2];
    if (fold) {
      warnings.push({
        line: block.line,
        kind: "degraded",
        message: `Callout pieghevole (\`[!${callout[1]}]${fold}\`): DokuWiki non supporta il collasso, reso come callout normale.`
      });
    }
    const nested = inner.slice(1).some((l) => /^\s*>/.test(l));
    if (nested) {
      warnings.push({
        line: block.line,
        kind: "degraded",
        message: "Callout annidato: reso come citazione interna al callout."
      });
    }
    return renderCallout(callout[1], callout[3] ?? "", inner.slice(1), options, footnotes, warnings, block.line, tagSet);
  }
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet);
  return inner.map((l) => l.trim() === "" ? ">" : cleanLine(`> ${convertInline(l, rules)}`)).join("\n");
}
function renderParagraph(block, options, footnotes, warnings, tagSet) {
  const rules = buildInlineRules(options, footnotes, warnings, block.line, tagSet);
  const converted = block.lines.map((l) => {
    const cleaned = cleanLine(l);
    return cleaned.endsWith("\\") ? cleaned.slice(0, -1).replace(/[ \t]+$/, "") : cleaned;
  }).map((l) => convertInline(l, rules));
  if (options.preserveLineBreaks && converted.length > 1) {
    return converted.map((l, idx) => idx < converted.length - 1 ? `${l} \\\\` : l).join("\n");
  }
  return converted.join("\n");
}
function scanUnsupportedHtml(blocks, warnings) {
  const tagRe = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
  for (const block of blocks) {
    if (block.type === "code") continue;
    for (let i = 0; i < block.lines.length; i += 1) {
      const line = block.lines[i];
      let m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(line)) !== null) {
        if (!KNOWN_HTML.has(m[1].toLowerCase())) {
          warnings.push({
            line: block.line + i,
            kind: "unsupported",
            message: `Tag HTML <${m[1]}> senza equivalente DokuWiki: lasciato invariato.`
          });
        }
      }
    }
  }
}
function preCleanup(lines, options) {
  let out = lines;
  if (options.cleanupRelated) {
    const filtered = [];
    let skipping = false;
    for (const line of lines) {
      if (/^\s*(#{1,6}\s*)?(related|correlati|backlinks?|link correlati)\s*:?\s*$/i.test(line)) {
        skipping = true;
        continue;
      }
      if (skipping && /^#{1,6}\s+\S/.test(line)) skipping = false;
      if (!skipping) filtered.push(line);
    }
    out = filtered;
  }
  if (options.cleanupWhitespace) {
    const cleaned = [];
    let blanks = 0;
    let inFence = false;
    for (const line of out) {
      if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence;
      if (inFence) {
        cleaned.push(line);
        continue;
      }
      const trimmed = line.replace(/[ \t]+$/, "");
      if (trimmed === "") {
        blanks += 1;
        if (blanks > 1) continue;
      } else {
        blanks = 0;
      }
      cleaned.push(trimmed);
    }
    out = cleaned;
  }
  return out;
}
function mdToDoku(input, options = {}, context = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings = [];
  const normalized = input.replace(/\r\n?/g, "\n");
  const rawLines = preCleanup(normalized.split("\n"), opts);
  const { defs: footnotes, body: withoutDefs } = extractFootnotes(rawLines);
  const frontmatterComments = [];
  const bodyLines = handleFrontmatter(withoutDefs, opts, frontmatterComments, warnings);
  const tagSet = /* @__PURE__ */ new Set();
  const segments = [];
  const blocks = collectBlocks(bodyLines, segments, warnings);
  scanUnsupportedHtml(blocks, warnings);
  const outBlocks = [];
  if (opts.h1FromFileName && context.fileName) {
    const hasH1 = blocks.some(
      (b) => b.type === "heading" && HEADING_RE.exec(b.lines[0])?.[1].length === 1
    );
    if (!hasH1) {
      const title = context.fileName.replace(/\.[^.]+$/, "");
      outBlocks.push(`====== ${title} ======`);
      warnings.push({
        line: 1,
        kind: "info",
        message: `H1 aggiunto dal nome file "${title}".`
      });
    }
  }
  for (const block of blocks) {
    switch (block.type) {
      case "code":
        outBlocks.push(renderCode(segments[block.segmentIndex ?? 0], block.line, warnings));
        break;
      case "heading":
        outBlocks.push(renderHeading(block.lines[0], block.line, warnings));
        break;
      case "hr":
        outBlocks.push("----");
        break;
      case "table":
        outBlocks.push(renderTable(block, opts, footnotes, warnings, tagSet));
        break;
      case "list":
        outBlocks.push(renderList(block, opts, footnotes, warnings, tagSet, segments));
        break;
      case "quote":
        outBlocks.push(renderQuote(block, opts, footnotes, warnings, tagSet));
        break;
      case "paragraph":
      default:
        outBlocks.push(renderParagraph(block, opts, footnotes, warnings, tagSet));
        break;
    }
  }
  if (frontmatterComments.length > 0) outBlocks.unshift(frontmatterComments.join("\n"));
  if (tagSet.size > 0) {
    outBlocks.push(`{{tag>${[...tagSet].join(" ")}}}`);
    warnings.push({
      line: rawLines.length,
      kind: "info",
      message: "Tag Obsidian convertiti in `{{tag>...}}`: richiede il plugin tag di DokuWiki."
    });
  }
  const joined = outBlocks.join("\n\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
  const output = joined ? `${joined}
` : "";
  warnings.sort((a, b) => a.line - b.line);
  return { output, warnings };
}

// ../src/converters/dokuToMd.ts
var CODE_OPEN_RE = /^\s*<(code|file)\b([^>]*)>/i;
var CODE_CLOSE_RE = /^\s*<\/(code|file)>\s*$/i;
var CALLOUT_OPEN_RE = /^\s*<(WRAP|note|tip|warning|important|alert|danger)\b([^>]*)>/i;
var WRAP_SPECIAL_RE = /^\s*<wrap\s+(hi|code)\b([^>]*)>/i;
var HEADING_RE2 = /^(\s*)(={2,6})\s+(.*?)\s*=*\s*$/;
var HR_RE2 = /^\s*-{4,}\s*$/;
var LIST_RE2 = /^(\s*)([*-])\s+(.*)$/;
var QUOTE_RE2 = /^\s*(>+)\s?(.*)$/;
var TABLE_ROW_RE = /^\s*[|^]/;
var INDENTED_RE = /^\s{2,}\S/;
var KNOWN_HTML2 = /* @__PURE__ */ new Set(["sub", "sup", "del", "code", "nowiki", "br", "u", "fc", "mark"]);
var NOTE_TAG_TO_TYPE = {
  note: "note",
  tip: "tip",
  warning: "warning",
  important: "important",
  alert: "warning",
  danger: "danger"
};
var WRAP_CLASS_TO_TYPE = {
  note: "note",
  info: "info",
  tip: "tip",
  warning: "warning",
  danger: "danger",
  important: "important",
  alert: "warning"
};
function isCalloutClose(line, tag) {
  return new RegExp(`^\\s*</${tag}>\\s*$`, "i").test(line);
}
function collectBlocks2(lines, codeSegments, calloutSegments, warnings) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const codeOpen = CODE_OPEN_RE.exec(line);
    if (codeOpen) {
      const tag = codeOpen[1].toLowerCase();
      const attrs = codeOpen[2].trim().split(/\s+/).filter(Boolean);
      const lang = attrs[0] && attrs[0] !== "-" ? attrs[0] : "";
      const fileName = attrs[1];
      if (fileName) {
        warnings.push({
          line: lineNo,
          kind: "degraded",
          message: `Nome file "${fileName}" nel blocco <${tag}>: non rappresentabile in Markdown.`
        });
      }
      const body = [];
      let j2 = i + 1;
      while (j2 < lines.length && !CODE_CLOSE_RE.test(lines[j2])) {
        body.push(lines[j2]);
        j2 += 1;
      }
      if (j2 >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: "degraded",
          message: `Blocco <${tag}> non chiuso: chiuso automaticamente a fine documento.`
        });
      }
      const segmentIndex = codeSegments.length;
      codeSegments.push({ lang, content: body.join("\n"), fileName });
      blocks.push({ type: "code", line: lineNo, lines: body, segmentIndex });
      i = j2 < lines.length ? j2 + 1 : j2;
      continue;
    }
    if (/^\s*<wrap\s+hi>\s*$/i.test(line)) {
      const body = [];
      let j2 = i + 1;
      while (j2 < lines.length && !/^\s*<\/wrap>\s*$/i.test(lines[j2])) {
        body.push(lines[j2].trim());
        j2 += 1;
      }
      blocks.push({ type: "paragraph", line: lineNo, lines: [`<wrap hi>${body.join(" ")}</wrap>`] });
      i = j2 < lines.length ? j2 + 1 : j2;
      continue;
    }
    const wrapSpecial = WRAP_SPECIAL_RE.exec(line);
    if (wrapSpecial && /^code$/i.test(wrapSpecial[1])) {
      const body = [];
      let j2 = i + 1;
      while (j2 < lines.length && !/^\s*<\/wrap>\s*$/i.test(lines[j2])) {
        body.push(lines[j2]);
        j2 += 1;
      }
      const segmentIndex = codeSegments.length;
      codeSegments.push({ lang: "", content: body.join("\n") });
      blocks.push({ type: "code", line: lineNo, lines: body, segmentIndex });
      i = j2 < lines.length ? j2 + 1 : j2;
      continue;
    }
    const calloutOpen = CALLOUT_OPEN_RE.exec(line);
    if (calloutOpen && !wrapSpecial) {
      const tag = calloutOpen[1];
      const isWrap = /^wrap$/i.test(tag);
      const attrs = calloutOpen[2].trim();
      const body = [];
      let j2 = i + 1;
      while (j2 < lines.length && !isCalloutClose(lines[j2], tag)) {
        body.push(lines[j2]);
        j2 += 1;
      }
      if (j2 >= lines.length) {
        warnings.push({
          line: lineNo,
          kind: "degraded",
          message: `Blocco <${tag}> non chiuso: chiuso automaticamente a fine documento.`
        });
      }
      let type;
      let title = "";
      if (isWrap) {
        const parts = attrs.split(/\s+/).filter(Boolean);
        type = WRAP_CLASS_TO_TYPE[(parts[0] ?? "").toLowerCase()] ?? "note";
        title = parts.slice(1).join(" ");
      } else {
        type = NOTE_TAG_TO_TYPE[tag.toLowerCase()] ?? "note";
        title = attrs;
      }
      if (!title && body.length > 0) {
        const m = /^\*\*(.+?)\*\*$/.exec(body[0].trim());
        if (m) {
          title = m[1];
          body.shift();
          if (body[0] !== void 0 && body[0].trim() === "") body.shift();
        }
      }
      const calloutIndex = calloutSegments.length;
      calloutSegments.push({ type, title, body });
      blocks.push({ type: "callout", line: lineNo, lines: body, calloutIndex });
      i = j2 < lines.length ? j2 + 1 : j2;
      continue;
    }
    const heading = HEADING_RE2.exec(line);
    if (heading) {
      blocks.push({ type: "heading", line: lineNo, lines: [line] });
      i += 1;
      continue;
    }
    if (HR_RE2.test(line)) {
      blocks.push({ type: "hr", line: lineNo, lines: [line] });
      i += 1;
      continue;
    }
    if (TABLE_ROW_RE.test(line)) {
      const rows = [];
      let j2 = i;
      while (j2 < lines.length && TABLE_ROW_RE.test(lines[j2]) && lines[j2].trim() !== "") {
        rows.push(lines[j2]);
        j2 += 1;
      }
      blocks.push({ type: "table", line: lineNo, lines: rows });
      i = j2;
      continue;
    }
    if (LIST_RE2.test(line)) {
      const rows = [];
      let j2 = i;
      while (j2 < lines.length) {
        const candidate = lines[j2];
        if (candidate.trim() === "") {
          let k = j2;
          while (k < lines.length && lines[k].trim() === "") k += 1;
          if (k >= lines.length) break;
          const next = lines[k];
          const continues = LIST_RE2.test(next) || INDENTED_RE.test(next) || CODE_OPEN_RE.test(next);
          if (!continues) break;
          for (let b = j2; b < k; b += 1) rows.push("");
          j2 = k;
          continue;
        }
        if (LIST_RE2.test(candidate)) {
          rows.push(candidate);
          j2 += 1;
          continue;
        }
        const codeOpen2 = CODE_OPEN_RE.exec(candidate);
        if (codeOpen2 && INDENTED_RE.test(candidate)) {
          const attrs = codeOpen2[2].trim().split(/\s+/).filter(Boolean);
          const lang = attrs[0] && attrs[0] !== "-" ? attrs[0] : "";
          const body = [];
          let k = j2 + 1;
          while (k < lines.length && !CODE_CLOSE_RE.test(lines[k])) {
            body.push(lines[k].replace(/^\s{2}/, ""));
            k += 1;
          }
          const segmentIndex = codeSegments.length;
          codeSegments.push({ lang, content: body.join("\n") });
          rows.push(segmentPlaceholder(segmentIndex));
          j2 = k < lines.length ? k + 1 : k;
          continue;
        }
        if (INDENTED_RE.test(candidate)) {
          rows.push(candidate);
          j2 += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", line: lineNo, lines: rows });
      i = j2;
      continue;
    }
    const previousBlank = i === 0 || lines[i - 1].trim() === "";
    if (INDENTED_RE.test(line) && previousBlank) {
      const body = [];
      let j2 = i;
      while (j2 < lines.length && INDENTED_RE.test(lines[j2])) {
        body.push(lines[j2].replace(/^ {2}/, ""));
        j2 += 1;
      }
      warnings.push({
        line: lineNo,
        kind: "collision",
        message: "Blocco indentato di 2+ spazi: in DokuWiki e' un blocco di codice, ma un'indentazione identica puo' anche essere la continuazione di una lista."
      });
      const segmentIndex = codeSegments.length;
      codeSegments.push({ lang: "", content: body.join("\n") });
      blocks.push({ type: "code", line: lineNo, lines: body, segmentIndex });
      i = j2;
      continue;
    }
    const quote = QUOTE_RE2.exec(line);
    if (quote) {
      const depth = quote[1].length;
      const rows = [];
      let j2 = i;
      while (j2 < lines.length && QUOTE_RE2.test(lines[j2])) {
        rows.push(lines[j2]);
        j2 += 1;
      }
      blocks.push({ type: "quote", line: lineNo, lines: rows, quoteDepth: depth });
      i = j2;
      continue;
    }
    const para = [line];
    let j = i + 1;
    while (j < lines.length) {
      const candidate = lines[j];
      if (candidate.trim() === "" || CODE_OPEN_RE.test(candidate) || CALLOUT_OPEN_RE.test(candidate) || HEADING_RE2.test(candidate) || HR_RE2.test(candidate) && !LIST_RE2.test(candidate) || LIST_RE2.test(candidate) && !INDENTED_RE.test(candidate) || TABLE_ROW_RE.test(candidate) || QUOTE_RE2.test(candidate)) {
        break;
      }
      para.push(candidate);
      j += 1;
    }
    blocks.push({ type: "paragraph", line: lineNo, lines: para });
    i = j;
  }
  return blocks;
}
function buildInlineRules2(options, footnotes, warnings, line, externalLink, internalLink) {
  return [
    // Blocchi "no formatting" di DokuWiki: contenuto protetto e preservato.
    {
      pattern: /%%[\s\S]*?%%/g,
      replace: (m) => {
        warnings.push({
          line,
          kind: "info",
          message: "Testo `%%...%%`: in Obsidian e' un commento, in DokuWiki disattiva la formattazione."
        });
        return m[0];
      }
    },
    // <nowiki>: mostra il contenuto letterale.
    {
      pattern: /<nowiki>([\s\S]*?)<\/nowiki>/gi,
      replace: (m) => m[1]
    },
    // <code> inline (raro): codice racchiuso tra apici inversi.
    {
      pattern: /<code>([\s\S]*?)<\/code>/gi,
      replace: (m) => "`" + m[1] + "`"
    },
    // Codice inline: ''x'' -> `x`
    { pattern: /''([^']+?)''/g, replace: (m) => "`" + m[1] + "`" },
    // Footnote inline: ((testo)) -> [^n] (definizioni accodate a fine documento).
    {
      pattern: /\(\((?=\S)([\s\S]+?)(?<=\S)\)\)/g,
      replace: (m) => {
        footnotes.push(m[1].trim());
        return `[^${footnotes.length}]`;
      }
    },
    // Riga di tag del plugin tag: {{tag>a b}} -> #a #b. DEVE precedere la
    // regola media, altrimenti verrebbe interpretata come un'immagine.
    {
      pattern: /\{\{tag>([^}]*)\}\}/gi,
      replace: (m) => {
        if (options.tags !== "note") return "";
        const tags = m[1].trim().split(/\s+/).filter(Boolean);
        warnings.push({
          line,
          kind: "info",
          message: "Riga `{{tag>...}}` convertita in tag Obsidian: era generata dal plugin tag di DokuWiki."
        });
        return tags.map((t) => `#${t}`).join(" ");
      }
    },
    // Transclusione del plugin include: {{page>ns:pagina}} -> ![[ns/pagina]].
    // DEVE precedere la regola media.
    {
      pattern: /\{\{page>([^{}]+?)\}\}/gi,
      replace: (m) => {
        const target = m[1].trim();
        warnings.push({
          line,
          kind: "info",
          message: `Transclusione {{page>${target}}}: resa come embed Obsidian ![[${target}]].`
        });
        return `![[${target}]]`;
      }
    },
    // Media: {{file}}, {{file|alt}}, {{file?WxH}}, {{file?W|alt}}
    {
      pattern: /\{\{([^{}]*?)\}\}/g,
      replace: (m) => renderMedia(m[1], warnings, line)
    },
    // Link: [[target|testo]] oppure [[target]]
    {
      pattern: /\[\[([^\]]+?)\]\]/g,
      replace: (m) => {
        const raw = m[1];
        const bar = raw.indexOf("|");
        const target = (bar >= 0 ? raw.slice(0, bar) : raw).trim();
        const text = bar >= 0 ? raw.slice(bar + 1).trim() : target;
        if (/^(https?|ftp|mailto|tel|file):/i.test(target) || /^www\./i.test(target) || target.includes(">")) {
          if (target.includes(">")) {
            warnings.push({
              line,
              kind: "degraded",
              message: `Interwiki link [[${target}]]: reso come link Markdown generico.`
            });
          }
          return externalLink(target, text);
        }
        return internalLink(target, text);
      }
    },
    // Barrato
    { pattern: /<del>([\s\S]*?)<\/del>/gi, replace: (m) => `~~${m[1]}~~` },
    // Highlight: `<fc ...>` (nativo), `<mark>` e il plugin `<wrap hi>`.
    { pattern: /<fc\s+[^>]+>([\s\S]*?)<\/fc>/gi, replace: (m) => `==${m[1]}==` },
    { pattern: /<mark>([\s\S]*?)<\/mark>/gi, replace: (m) => `==${m[1]}==` },
    { pattern: /<wrap\s+hi>([\s\S]*?)<\/wrap>/gi, replace: (m) => `==${m[1]}==` },
    // Macro di controllo: rimosse.
    {
      pattern: /~~(NOTOC|NOCACHE)~~/gi,
      replace: (m) => {
        warnings.push({ line, kind: "info", message: `Macro DokuWiki ${m[0]} rimossa.` });
        return "";
      }
    },
    // Grassetto prima del corsivo.
    { pattern: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, replace: (m) => `**${m[1]}**` },
    // Corsivo //x// (escluso lo `//` interno a un URL: protetto da un `:` o
    // da un carattere di parola prima).
    { pattern: /(?<![:\w])\/\/(?=\S)([^/\n]+?)(?<=\S)\/\//g, replace: (m) => `*${m[1]}*` },
    // Sottolineato __x__: nessun equivalente Markdown.
    {
      pattern: /__(?=\S)([\s\S]+?)(?<=\S)__/g,
      replace: (m) => {
        warnings.push({
          line,
          kind: "degraded",
          message: "Sottolineato `__x__`: reso come HTML `<u>`, non supportato da Markdown puro."
        });
        return `<u>${m[1]}</u>`;
      }
    },
    // Interruzione di riga forzata \\ -> backslash di fine riga.
    { pattern: /[ \t]*\\\\[ \t]*/g, replace: () => "\\" }
  ];
}
function renderMedia(inner, warnings, line) {
  const bar = inner.indexOf("|");
  const targetRaw = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
  const alias = bar >= 0 ? inner.slice(bar + 1).trim() : "";
  const q = targetRaw.indexOf("?");
  const file = (q >= 0 ? targetRaw.slice(0, q) : targetRaw).trim();
  const query = q >= 0 ? targetRaw.slice(q + 1).trim() : "";
  const external = /^(https?|ftp):/i.test(file);
  if (query) {
    warnings.push({
      line,
      kind: "info",
      message: `Dimensione immagine "?${query}" preservata come embed Obsidian.`
    });
    return `![[${file}|${query}]]`;
  }
  if (external || alias) {
    return `![${alias || file}](${file})`;
  }
  return `![[${file}]]`;
}
function fenceFor(content) {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}
function renderCode2(segment) {
  const fence = fenceFor(segment.content);
  return `${fence}${segment.lang}
${segment.content}
${fence}`;
}
function renderHeading2(line, lineNo, warnings) {
  const m = HEADING_RE2.exec(line);
  if (!m) return line;
  const count = m[2].length;
  const level = Math.min(5, Math.max(1, 7 - count));
  if (count < 2) {
    warnings.push({ line: lineNo, kind: "degraded", message: "Heading DokuWiki con meno di due `=`: normalizzato." });
  }
  return `${"#".repeat(level)} ${m[3].trim()}`;
}
function splitDokuRow(row) {
  const body = row.trim().replace(/^[|^]/, "").replace(/[|^]\s*$/, "");
  return body.split(/[|^]/);
}
function detectAlign(cell) {
  const leading = /^\s{2,}/.test(cell);
  const trailing = /\s{2,}$/.test(cell);
  if (leading && trailing) return "center";
  if (leading) return "right";
  if (trailing) return "left";
  return null;
}
function renderTable2(block, options, footnotes, warnings, ext, int) {
  const rules = buildInlineRules2(options, footnotes, warnings, block.line, ext, int);
  const convert = (text) => convertInline(text, rules).trim();
  const first = block.lines[0].trim();
  const hasHeader = first.startsWith("^");
  const normalizeRow = (row) => {
    const raw = splitDokuRow(row);
    const cells = [];
    const aligns2 = [];
    for (const cell of raw) {
      const text = cell.trim();
      if (text === "") {
        if (cells.length > 0) {
          warnings.push({
            line: block.line,
            kind: "degraded",
            message: "Cella unita orizzontalmente (colspan `||`): degradata in celle vuote in Markdown."
          });
          cells.push("");
          aligns2.push(null);
        }
        continue;
      }
      if (text === ":::") {
        warnings.push({
          line: block.line,
          kind: "degraded",
          message: "Cella unita verticalmente (rowspan `:::`): degradata in cella vuota in Markdown."
        });
        cells.push("");
        aligns2.push(null);
        continue;
      }
      cells.push(convert(text));
      aligns2.push(detectAlign(cell));
    }
    return { cells, aligns: aligns2 };
  };
  const header = normalizeRow(block.lines[0]);
  const bodyRows = block.lines.slice(1).map(normalizeRow);
  const columnCount = Math.max(header.cells.length, ...bodyRows.map((r) => r.cells.length), 1);
  const aligns = Array.from({ length: columnCount }, (_, idx) => header.aligns[idx] ?? bodyRows.find((r) => r.aligns[idx])?.aligns[idx] ?? null);
  const pad = (cells) => Array.from({ length: columnCount }, (_, idx) => cells[idx] ?? "");
  const renderRow = (cells) => `| ${pad(cells).join(" | ")} |`;
  const separator = `| ${aligns.map((a) => a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---").join(" | ")} |`;
  const out = [];
  if (hasHeader) {
    out.push(renderRow(header.cells), separator);
  } else {
    out.push(renderRow(Array(columnCount).fill("")), separator);
    out.push(renderRow(header.cells));
  }
  for (const row of bodyRows) out.push(renderRow(row.cells));
  return out.join("\n");
}
function renderList2(block, options, footnotes, warnings, ext, int, codeSegments) {
  const rules = buildInlineRules2(options, footnotes, warnings, block.line, ext, int);
  const out = [];
  for (const raw of block.lines) {
    if (raw.trim() === "") {
      out.push("");
      continue;
    }
    const ph = isSegmentPlaceholder(raw);
    if (ph !== null) {
      const segment = codeSegments[ph];
      const fence = fenceFor(segment.content);
      const indent = "   ";
      const block2 = `${fence}${segment.lang}
${segment.content}
${fence}`;
      out.push(
        block2.split("\n").map((l) => l === "" ? l : indent + l).join("\n")
      );
      continue;
    }
    const m = LIST_RE2.exec(raw);
    if (!m) {
      out.push(`  ${convertInline(raw.trim(), rules)}`);
      continue;
    }
    const indentLen = m[1].replace(/\t/g, "  ").length;
    const depth = Math.max(0, Math.floor(indentLen / 2) - 1);
    const ordered = m[2] === "-";
    let content = m[3];
    const task = /^([☐☑])\s+(.*)$/.exec(content.trim());
    if (task) content = `[${task[1] === "\u2611" ? "x" : " "}] ${task[2]}`;
    const marker = ordered ? "1." : "-";
    out.push(`${"  ".repeat(depth)}${marker} ${convertInline(content, rules)}`);
  }
  return out.join("\n");
}
function renderCallout2(segment, options, footnotes, warnings, line, ext, int) {
  const rules = buildInlineRules2(options, footnotes, warnings, line, ext, int);
  const body = segment.body.map((l) => l.trim() === "" ? ">" : `> ${convertInline(l, rules)}`);
  const head = `> [!${segment.type}]${segment.title ? ` ${segment.title}` : ""}`;
  return [head, ...body].join("\n");
}
function renderQuote2(block, options, footnotes, warnings, ext, int) {
  const rules = buildInlineRules2(options, footnotes, warnings, block.line, ext, int);
  return block.lines.map((raw) => {
    const m = QUOTE_RE2.exec(raw);
    if (!m) return `> ${convertInline(raw, rules)}`;
    const prefix = "> ".repeat(m[1].length);
    return m[2].trim() === "" ? prefix.trimEnd() : `${prefix}${convertInline(m[2], rules)}`;
  }).join("\n");
}
function cleanLine2(text) {
  return text.replace(/[ \t]+$/, "");
}
function renderParagraph2(block, options, footnotes, warnings, ext, int) {
  const rules = buildInlineRules2(options, footnotes, warnings, block.line, ext, int);
  return block.lines.map((l) => cleanLine2(convertInline(l, rules))).join("\n");
}
function scanUnsupportedHtml2(blocks, warnings) {
  const tagRe = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
  for (const block of blocks) {
    if (block.type === "code" || block.type === "callout") continue;
    for (let i = 0; i < block.lines.length; i += 1) {
      const line = block.lines[i];
      let m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(line)) !== null) {
        if (!KNOWN_HTML2.has(m[1].toLowerCase())) {
          warnings.push({
            line: block.line + i,
            kind: "unsupported",
            message: `Tag HTML <${m[1]}> senza equivalente Markdown: lasciato invariato.`
          });
        }
      }
    }
  }
}
function dokuToMd(input, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings = [];
  const rawLines = input.replace(/\r\n?/g, "\n").split("\n");
  const codeSegments = [];
  const calloutSegments = [];
  const footnotes = [];
  const blocks = collectBlocks2(rawLines, codeSegments, calloutSegments, warnings);
  scanUnsupportedHtml2(blocks, warnings);
  const externalLink = (url, text) => `[${text || url}](${url})`;
  const internalLink = (target, text) => {
    const plain = opts.preserveFolders ? target.replace(/:/g, "/") : target.replace(/:/g, "");
    if (opts.internalLinks === "wikilink") {
      return text && text !== target ? `[[${plain}|${text}]]` : `[[${plain}]]`;
    }
    return `[${text || target}](${target})`;
  };
  const outBlocks = [];
  for (const block of blocks) {
    let rendered = "";
    switch (block.type) {
      case "code":
        rendered = renderCode2(codeSegments[block.segmentIndex ?? 0]);
        break;
      case "heading":
        rendered = renderHeading2(block.lines[0], block.line, warnings);
        break;
      case "hr":
        rendered = "---";
        break;
      case "table":
        rendered = renderTable2(block, opts, footnotes, warnings, externalLink, internalLink);
        break;
      case "list":
        rendered = renderList2(block, opts, footnotes, warnings, externalLink, internalLink, codeSegments);
        break;
      case "callout":
        rendered = renderCallout2(
          calloutSegments[block.calloutIndex ?? 0],
          opts,
          footnotes,
          warnings,
          block.line,
          externalLink,
          internalLink
        );
        break;
      case "quote":
        rendered = renderQuote2(block, opts, footnotes, warnings, externalLink, internalLink);
        break;
      case "paragraph":
      default:
        rendered = renderParagraph2(block, opts, footnotes, warnings, externalLink, internalLink);
        break;
    }
    if (rendered !== "") outBlocks.push(rendered);
  }
  if (footnotes.length > 0) {
    outBlocks.push(footnotes.map((text, idx) => `[^${idx + 1}]: ${text}`).join("\n"));
  }
  const joined = outBlocks.join("\n\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/, "");
  const output = joined ? `${joined}
` : "";
  warnings.sort((a, b) => a.line - b.line);
  return { output, warnings };
}

// src/settings.ts
var DEFAULT_SETTINGS = {
  ...DEFAULT_OPTIONS,
  outputAction: "clipboard",
  outputExtension: ".txt"
};
var Md2DokuSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  save() {
    void this.plugin.saveSettings();
    this.plugin.refreshOpenViews();
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Markdown \u21C4 DokuWiki" });
    new import_obsidian.Setting(containerEl).setName("Output").setHeading();
    new import_obsidian.Setting(containerEl).setName("Dove mettere il risultato").setDesc("Cosa fare quando converti la nota corrente.").addDropdown(
      (drop) => drop.addOption("clipboard", "Copia negli appunti").addOption("file", "Scrivi un file accanto alla nota").addOption("both", "Entrambe").setValue(this.plugin.settings.outputAction).onChange((value) => {
        this.plugin.settings.outputAction = value;
        this.save();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Estensione dei file esportati").addText(
      (text) => text.setPlaceholder(".txt").setValue(this.plugin.settings.outputExtension).onChange((value) => {
        this.plugin.settings.outputExtension = value.trim() || ".txt";
        this.save();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Namespace").setHeading();
    this.textField(
      "Namespace dei link",
      "Anteposto ai wikilink (vuoto = nessun namespace).",
      this.plugin.settings.linkNamespace,
      (v) => this.plugin.settings.linkNamespace = v
    );
    this.textField(
      "Namespace dei media",
      "Anteposto a immagini ed embed.",
      this.plugin.settings.mediaNamespace,
      (v) => this.plugin.settings.mediaNamespace = v
    );
    this.toggle(
      "Preserva le cartelle nei link",
      "[[Guida/Setup]] \u2192 [[guida:setup]].",
      this.plugin.settings.preserveFolders,
      (v) => this.plugin.settings.preserveFolders = v
    );
    new import_obsidian.Setting(containerEl).setName("Callout e plugin").setHeading();
    new import_obsidian.Setting(containerEl).setName("Stile callout").setDesc("Nessun plugin installato: usa \xABCitazione (HTML)\xBB.").addDropdown(
      (drop) => drop.addOption("html", "Citazione (HTML, nessun plugin)").addOption("note", "Plugin note <note>").addOption("wrap", "Plugin wrap <WRAP>").setValue(this.plugin.settings.calloutStyle).onChange((value) => {
        this.plugin.settings.calloutStyle = value;
        this.save();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Stile evidenziazione").setDesc("Come rendere ==x== in DokuWiki.").addDropdown(
      (drop) => drop.addOption("fc", "DokuWiki nativo <fc #ffff00>").addOption("wrap", "Plugin wrap <wrap hi>").addOption("mark", "HTML <mark>").addOption("bold", "Grassetto (nessun plugin)").setValue(this.plugin.settings.highlightStyle).onChange((value) => {
        this.plugin.settings.highlightStyle = value;
        this.save();
      })
    );
    this.toggle(
      "Converti ==evidenziato==",
      "Disattiva per lasciare ==x== invariato.",
      this.plugin.settings.convertHighlight,
      (v) => this.plugin.settings.convertHighlight = v
    );
    this.toggle(
      "Transclusione con plugin include",
      "![[Nota]] \u2192 {{page>ns:nota}} (richiede il plugin include).",
      this.plugin.settings.includeTransclusion,
      (v) => this.plugin.settings.includeTransclusion = v
    );
    new import_obsidian.Setting(containerEl).setName("Codice dentro le liste").setDesc("DokuWiki: un <code> a colonna 0 interrompe la lista.").addDropdown(
      (drop) => drop.addOption("indent", "Indenta di 2 spazi per livello").addOption("wrap", "Avvolgi in <WRAP code>").addOption("break", "Accetta la rottura (con avviso)").setValue(this.plugin.settings.codeInLists).onChange((value) => {
        this.plugin.settings.codeInLists = value;
        this.save();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Testo e pulizia").setHeading();
    this.toggle(
      "A capo singoli \u2192 \\\\",
      "DokuWiki fonde le righe consecutive; attivo conserva gli a capo Obsidian.",
      this.plugin.settings.preserveLineBreaks,
      (v) => this.plugin.settings.preserveLineBreaks = v
    );
    this.toggle(
      "Rimuovi le sezioni Related/backlink",
      "Pulizia pre-conversione.",
      this.plugin.settings.cleanupRelated,
      (v) => this.plugin.settings.cleanupRelated = v
    );
    this.toggle(
      "Normalizza spazi e righe vuote",
      "Pulizia pre-conversione.",
      this.plugin.settings.cleanupWhitespace,
      (v) => this.plugin.settings.cleanupWhitespace = v
    );
    this.toggle(
      "H1 dal nome file se manca il titolo",
      "Utile per l'esportazione di cartelle.",
      this.plugin.settings.h1FromFileName,
      (v) => this.plugin.settings.h1FromFileName = v
    );
    new import_obsidian.Setting(containerEl).setName("Estensioni Obsidian").setHeading();
    new import_obsidian.Setting(containerEl).setName("Frontmatter YAML").addDropdown(
      (drop) => drop.addOption("comment", "Converti in commento").addOption("remove", "Rimuovi").addOption("keep", "Mantieni").setValue(this.plugin.settings.frontmatter).onChange((value) => {
        this.plugin.settings.frontmatter = value;
        this.save();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Tag Obsidian (#tag)").addDropdown(
      (drop) => drop.addOption("remove", "Rimuovi").addOption("note", "Riga di tag {{tag>\u2026}}").setValue(this.plugin.settings.tags).onChange((value) => {
        this.plugin.settings.tags = value;
        this.save();
      })
    );
    this.toggle(
      "Rimuovi i commenti %%\u2026%%",
      "Come nella webapp.",
      this.plugin.settings.removeObsidianComments,
      (v) => this.plugin.settings.removeObsidianComments = v
    );
    this.toggle(
      "Converti le attivit\xE0 \u2610/\u2611",
      "Converte - [ ] / - [x].",
      this.plugin.settings.convertTasks,
      (v) => this.plugin.settings.convertTasks = v
    );
    new import_obsidian.Setting(containerEl).setName("Link interni (Doku \u2192 Markdown)").addDropdown(
      (drop) => drop.addOption("wikilink", "Wikilink Obsidian").addOption("markdown", "Link Markdown").setValue(this.plugin.settings.internalLinks).onChange((value) => {
        this.plugin.settings.internalLinks = value;
        this.save();
      })
    );
    new import_obsidian.Setting(containerEl).addButton(
      (btn) => btn.setButtonText("Ripristina predefiniti").onClick(async () => {
        this.plugin.settings = { ...DEFAULT_SETTINGS, ...this.plugin.settings, ...DEFAULT_OPTIONS };
        await this.plugin.saveSettings();
        this.display();
        this.plugin.refreshOpenViews();
      })
    );
  }
  textField(name, desc, value, set) {
    new import_obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addText(
      (text) => text.setValue(value).onChange((v) => {
        set(v);
        this.save();
      })
    );
  }
  toggle(name, desc, value, set) {
    new import_obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addToggle(
      (toggle) => toggle.setValue(value).onChange((v) => {
        set(v);
        this.save();
      })
    );
  }
};

// src/operations.ts
var import_obsidian2 = require("obsidian");
function engineOptions(settings) {
  return {
    linkNamespace: settings.linkNamespace,
    mediaNamespace: settings.mediaNamespace,
    calloutStyle: settings.calloutStyle,
    frontmatter: settings.frontmatter,
    tags: settings.tags,
    removeObsidianComments: settings.removeObsidianComments,
    convertHighlight: settings.convertHighlight,
    highlightStyle: settings.highlightStyle,
    convertTasks: settings.convertTasks,
    internalLinks: settings.internalLinks,
    preserveFolders: settings.preserveFolders,
    preserveLineBreaks: settings.preserveLineBreaks,
    codeInLists: settings.codeInLists,
    includeTransclusion: settings.includeTransclusion,
    cleanupRelated: settings.cleanupRelated,
    cleanupWhitespace: settings.cleanupWhitespace,
    h1FromFileName: settings.h1FromFileName
  };
}
function convertMarkdownToDoku(markdown, settings, fileName) {
  const result = mdToDoku(markdown, engineOptions(settings), fileName ? { fileName } : {});
  return { output: result.output, warnings: result.warnings.length };
}
function convertDokuToMarkdown(doku, settings) {
  const result = dokuToMd(doku, engineOptions(settings));
  return { output: result.output, warnings: result.warnings.length };
}
async function copyToClipboard(text, message = "Copiato negli appunti") {
  try {
    await navigator.clipboard.writeText(text);
    new import_obsidian2.Notice(message);
  } catch {
    new import_obsidian2.Notice("Copia non riuscita");
  }
}
function dokuSiblingPath(notePath, extension) {
  const base = notePath.replace(/\.[^./\\]+$/, "");
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return `${base}${ext}`;
}
async function writeSibling(app, notePath, output, extension) {
  const target = dokuSiblingPath(notePath, extension);
  await ensureParentFolder(app, target);
  const existing = app.vault.getAbstractFileByPath(target);
  if (existing instanceof import_obsidian2.TFile) {
    await app.vault.modify(existing, output);
    return existing;
  }
  return app.vault.create(target, output);
}
async function createMarkdownNote(app, markdown, pageName) {
  const base = `import-${normalizePageName(pageName) || "dokuwiki"}`;
  let path = `${base}.md`;
  let counter = 1;
  while (app.vault.getAbstractFileByPath(path)) {
    path = `${base}-${counter}.md`;
    counter += 1;
  }
  return app.vault.create(path, markdown);
}
async function ensureParentFolder(app, path) {
  const parts = path.split("/");
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

// src/import-modal.ts
var import_obsidian3 = require("obsidian");
var ImportDokuModal = class extends import_obsidian3.Modal {
  plugin;
  input = "";
  previewEl;
  warningEl;
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("md2doku-import-modal");
    this.titleEl.setText("Importa da DokuWiki");
    contentEl.createEl("p", {
      cls: "md2doku-hint",
      text: "Incolla un documento DokuWiki: verr\xE0 convertito in Markdown e salvato come nuova nota."
    });
    const inputEl = contentEl.createEl("textarea", {
      cls: "md2doku-textarea",
      attr: { placeholder: "====== Titolo ======\n\nTesto con **grassetto** e //corsivo//\u2026", rows: "10" }
    });
    inputEl.addEventListener("input", () => {
      this.input = inputEl.value;
      this.updatePreview();
    });
    this.warningEl = contentEl.createEl("div", { cls: "md2doku-warnings" });
    contentEl.createEl("h4", { text: "Anteprima" });
    this.previewEl = contentEl.createEl("pre", { cls: "md2doku-preview" });
    new import_obsidian3.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Crea nota").setCta().onClick(() => void this.createNote())
    ).addButton(
      (btn) => btn.setButtonText("Copia Markdown").onClick(() => void copyToClipboard(this.previewEl.textContent ?? ""))
    ).addButton((btn) => btn.setButtonText("Chiudi").onClick(() => this.close()));
    this.updatePreview();
  }
  onClose() {
    this.contentEl.empty();
  }
  updatePreview() {
    if (this.input.trim() === "") {
      this.previewEl.setText("L'anteprima appare qui");
      this.warningEl.setText("");
      return;
    }
    const { output, warnings } = convertDokuToMarkdown(this.input, this.plugin.settings);
    this.previewEl.setText(output);
    this.warningEl.setText(warnings > 0 ? `\u26A0 ${warnings} avvisi di conversione` : "\u2713 nessun avviso");
  }
  async createNote() {
    if (this.input.trim() === "") {
      new import_obsidian3.Notice("Incolla prima un documento DokuWiki");
      return;
    }
    const { output } = convertDokuToMarkdown(this.input, this.plugin.settings);
    const pageName = firstDokuHeading(this.input) || "dokuwiki";
    await this.plugin.createImportedNote(output, pageName);
    this.close();
  }
};
function firstDokuHeading(text) {
  const m = /^\s*={2,6}\s+(.+?)\s*=+\s*$/m.exec(text);
  return m ? m[1].trim() : null;
}

// src/export-folder.ts
var import_obsidian5 = require("obsidian");

// ../src/lib/batch.ts
function pageNameFromFile(name) {
  return normalizePageName(name.replace(/\.[^.]+$/, "").replace(/[/\\]/g, ":"));
}
function outputPathFor(name, direction, namespace) {
  const page = pageNameFromFile(name) || "documento";
  const ext = direction === "md-to-doku" ? "txt" : "md";
  const fileName = `${page}.${ext}`;
  return namespace ? `${namespace.replace(/:+$/, "")}/${fileName}` : fileName;
}
var MEDIA_EXT_RE2 = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|ogv|mov|ogg|mp3|wav|flac|m4a|pdf)$/i;
function findAttachments(content) {
  const out = /* @__PURE__ */ new Set();
  const re = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const target = (m[1] ?? m[2] ?? "").trim();
    if (!target || /^https?:/i.test(target)) continue;
    if (MEDIA_EXT_RE2.test(target)) out.add(target);
  }
  return [...out];
}
function mediaName(name) {
  const base = name.split(/[/\\]/).pop() ?? name;
  return normalizePageName(base).replace(/^_+/, "") || base;
}
function rewriteAttachmentRefs(content, available, mediaNs) {
  return content.replace(
    /!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]|!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (full, wikiTarget, wikiAlias, mdAlt, mdSrc) => {
      const target = (wikiTarget ?? mdSrc ?? "").trim();
      if (!target || /^https?:/i.test(target)) return full;
      const norm = available.get(normalizePageName(target.split("/").pop() ?? target));
      if (!norm) return full;
      const nsTarget = joinNamespace(mediaNs, norm);
      if (wikiTarget !== void 0) {
        return wikiAlias ? `![[${nsTarget}|${wikiAlias}]]` : `![[${nsTarget}]]`;
      }
      return `![${mdAlt ?? ""}](${nsTarget})`;
    }
  );
}
function buildBatchPlan(files, direction, options, attachments = [], planOptions = { namespace: "", mediaNamespace: "" }) {
  const items = [];
  const used = /* @__PURE__ */ new Map();
  const knownPages = new Set(files.map((f) => pageNameFromFile(f.name)));
  const availableAttachments = new Map(
    attachments.map((a) => [normalizePageName(a.name.split(/[/\\]/).pop() ?? a.name), mediaName(a.name)])
  );
  for (const file of files) {
    let content = file.content;
    const referenced = direction === "md-to-doku" ? findAttachments(content) : [];
    if (referenced.length > 0) {
      content = rewriteAttachmentRefs(content, availableAttachments, planOptions.mediaNamespace);
    }
    const result = direction === "md-to-doku" ? mdToDoku(content, options, { fileName: file.name }) : dokuToMd(content, options);
    const unresolved = [];
    if (direction === "md-to-doku") {
      const re = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
      let m;
      while ((m = re.exec(file.content)) !== null) {
        const raw = m[1].trim();
        if (MEDIA_EXT_RE2.test(raw)) continue;
        const page = normalizePageName(raw.split("/").pop() ?? raw);
        if (!knownPages.has(page)) unresolved.push(raw);
      }
    }
    let target = outputPathFor(file.name, direction, planOptions.namespace);
    const seen = used.get(target) ?? 0;
    used.set(target, seen + 1);
    if (seen > 0) {
      const dot = target.lastIndexOf(".");
      target = `${target.slice(0, dot)}-${seen}${target.slice(dot)}`;
    }
    items.push({ name: file.name, outputPath: target, result, unresolved });
  }
  const allReferenced = direction === "md-to-doku" ? files.flatMap((f) => findAttachments(f.content)) : [];
  const missingAttachments = [
    ...new Set(
      allReferenced.filter((r) => !availableAttachments.has(normalizePageName(r.split("/").pop() ?? r)))
    )
  ];
  return {
    items,
    attachments: attachments.map((a) => mediaName(a.name)),
    missingAttachments
  };
}
function renderReadme(report, direction, namespace) {
  const lines = [];
  lines.push(direction === "md-to-doku" ? "LEGGIMI \u2014 conversione da caricare su DokuWiki" : "LEGGIMI \u2014 conversione verso Markdown");
  lines.push("=".repeat(50));
  lines.push("");
  if (namespace) lines.push(`Namespace di destinazione: ${namespace}`);
  lines.push(`File convertiti: ${report.items.length}`);
  lines.push("");
  lines.push("File:");
  for (const item of report.items) {
    lines.push(`  - ${item.outputPath}  (da ${item.name})`);
  }
  lines.push("");
  const withWarnings = report.items.filter((i) => i.result.warnings.length > 0);
  if (withWarnings.length > 0) {
    lines.push("Avvisi:");
    for (const item of withWarnings) {
      for (const w of item.result.warnings) {
        lines.push(`  - ${item.name} \xB7 riga ${w.line} [${w.kind}] ${w.message}`);
      }
    }
    lines.push("");
  }
  const unresolved = report.items.flatMap((i) => i.unresolved.map((u) => `${i.name} \u2192 ${u}`));
  if (unresolved.length > 0) {
    lines.push("Link verso note non incluse nel batch:");
    for (const u of unresolved) lines.push(`  - ${u}`);
    lines.push("");
  }
  if (report.attachments.length > 0) {
    lines.push("Allegati inclusi (cartella media/):");
    for (const a of report.attachments) lines.push(`  - media/${a}`);
    lines.push("");
  }
  if (report.missingAttachments.length > 0) {
    lines.push("Allegati referenziati ma NON caricati:");
    for (const a of report.missingAttachments) lines.push(`  - ${a}`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

// src/vault-utils.ts
var import_obsidian4 = require("obsidian");
async function ensureFolder(app, folderPath) {
  if (!folderPath || app.vault.getAbstractFileByPath(folderPath)) return;
  const parts = folderPath.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}
async function writeTextFile(app, path, content) {
  const dir = path.split("/").slice(0, -1).join("/");
  if (dir) await ensureFolder(app, dir);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof import_obsidian4.TFile) {
    await app.vault.modify(existing, content);
    return existing;
  }
  return app.vault.create(path, content);
}

// src/export-folder.ts
async function exportFolder(app, folder, settings) {
  const markdownFiles = collectMarkdown(folder);
  if (markdownFiles.length === 0) {
    throw new Error("Nessun file Markdown nella cartella");
  }
  const contents = await Promise.all(
    markdownFiles.map(async (file) => ({ name: file.name, content: await app.vault.read(file) }))
  );
  const report = buildBatchPlan(contents, "md-to-doku", engineOptions(settings), [], {
    namespace: settings.linkNamespace,
    mediaNamespace: settings.mediaNamespace
  });
  const outFolder = joinPath(folder.path === "/" ? "" : folder.path, "dokuwiki-out");
  await ensureFolder(app, outFolder);
  for (const item of report.items) {
    const fileName = item.outputPath.split("/").pop() ?? item.outputPath;
    await writeTextFile(app, joinPath(outFolder, fileName), item.result.output);
  }
  await writeTextFile(app, joinPath(outFolder, "LEGGIMI.txt"), renderReadme(report, "md-to-doku", settings.linkNamespace));
  const notes = report.items.reduce((sum, item) => sum + item.result.warnings.length, 0);
  new import_obsidian5.Notice(`Esportati ${report.items.length} file in ${outFolder}/ (${notes} avvisi)`);
  return { converted: report.items.length, outputFolder: outFolder };
}
function collectMarkdown(folder) {
  const out = [];
  for (const entry of folder.children) {
    if (entry instanceof import_obsidian5.TFolder) out.push(...collectMarkdown(entry));
    else if (entry instanceof import_obsidian5.TFile && entry.extension === "md") out.push(entry);
  }
  return out;
}
function joinPath(a, b) {
  return a ? `${a.replace(/\/+$/, "")}/${b}` : b;
}

// src/sidebar-view.ts
var import_obsidian6 = require("obsidian");
var VIEW_TYPE_MD2DOKU = "md2doku-sidebar";
var Md2DokuView = class extends import_obsidian6.ItemView {
  plugin;
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_MD2DOKU;
  }
  getDisplayText() {
    return "Markdown \u21C4 DokuWiki";
  }
  getIcon() {
    return "repeat";
  }
  async onOpen() {
    this.plugin.registerOpenView(this);
    this.refresh();
  }
  async onClose() {
    this.plugin.unregisterOpenView(this);
  }
  /** Ridisegna il pannello (chiamato anche al cambio della nota attiva). */
  refresh() {
    const root = this.contentEl;
    root.empty();
    root.addClass("md2doku-sidebar");
    const active = this.plugin.activeMarkdownFile();
    root.createEl("h4", { text: "Markdown \u21C4 DokuWiki", cls: "md2doku-title" });
    root.createEl("p", {
      cls: "md2doku-hint",
      text: active ? `Nota attiva: ${active.basename}` : "Nessuna nota Markdown attiva"
    });
    this.renderActions(root, [
      {
        label: "Converti la nota in DokuWiki",
        icon: "repeat",
        disabled: !active,
        onClick: () => void this.plugin.runConvertNote()
      },
      {
        label: "Converti la selezione in DokuWiki",
        icon: "text-cursor-input",
        onClick: () => void this.plugin.runConvertSelectionToDoku()
      },
      {
        label: "Converti la selezione da DokuWiki",
        icon: "text-cursor-input",
        onClick: () => void this.plugin.runConvertSelectionFromDoku()
      }
    ]);
    root.createEl("h5", { text: "Import" });
    this.renderActions(root, [
      {
        label: "Importa da DokuWiki\u2026",
        icon: "clipboard-paste",
        onClick: () => this.plugin.openImportModal()
      }
    ]);
    const folder = this.plugin.activeFolder();
    root.createEl("h5", { text: "Cartella" });
    root.createEl("p", { cls: "md2doku-hint", text: `Destinazione: ${folder?.path || "/"}` });
    this.renderActions(root, [
      {
        label: "Esporta la cartella in DokuWiki",
        icon: "folder-output",
        disabled: !folder,
        onClick: () => void this.plugin.runFolderExport()
      }
    ]);
    root.createEl("h5", { text: "Configurazione" });
    this.renderActions(root, [
      {
        label: "Apri le impostazioni",
        icon: "settings",
        onClick: () => this.plugin.openSettings()
      },
      {
        label: "Dove va il risultato",
        icon: "clipboard",
        onClick: () => void this.plugin.cycleOutputAction()
      }
    ]);
    root.createEl("p", {
      cls: "md2doku-hint",
      text: `Output: ${OUTPUT_LABELS[this.plugin.settings.outputAction]}`
    });
  }
  renderActions(root, actions) {
    for (const action of actions) {
      const btn = root.createEl("button", { cls: "md2doku-action" });
      btn.disabled = action.disabled ?? false;
      const iconEl = btn.createSpan({ cls: "md2doku-action-icon" });
      (0, import_obsidian6.setIcon)(iconEl, action.icon);
      btn.createSpan({ text: action.label });
      btn.addEventListener("click", () => {
        if (!(action.disabled ?? false)) action.onClick();
      });
    }
  }
};
var OUTPUT_LABELS = {
  clipboard: "appunti",
  file: "file accanto alla nota",
  both: "appunti + file"
};

// main.ts
var Md2DokuPlugin = class extends import_obsidian7.Plugin {
  settings = DEFAULT_SETTINGS;
  openViews = /* @__PURE__ */ new Set();
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new Md2DokuSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_MD2DOKU, (leaf) => new Md2DokuView(leaf, this));
    this.addRibbonIcon("repeat", "Markdown \u21C4 DokuWiki", () => void this.activateView());
    this.addCommand({
      id: "open-sidebar",
      name: "Apri il pannello laterale",
      callback: () => void this.activateView()
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshOpenViews())
    );
    this.addCommand({
      id: "convert-note-to-doku",
      name: "Converti la nota corrente in DokuWiki",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.runConvertNote();
        return true;
      }
    });
    this.addCommand({
      id: "convert-selection-to-doku",
      name: "Converti la selezione in DokuWiki",
      editorCallback: (editor) => void this.convertSelection(editor)
    });
    this.addCommand({
      id: "import-doku",
      name: "Importa da DokuWiki (incolla un documento)",
      callback: () => this.openImportModal()
    });
    this.addCommand({
      id: "convert-selection-from-doku",
      name: "Converti la selezione da DokuWiki in Markdown",
      editorCallback: (editor) => void this.convertSelectionFromDoku(editor)
    });
    this.addCommand({
      id: "export-folder-to-doku",
      name: "Esporta la cartella corrente in DokuWiki",
      checkCallback: (checking) => {
        const folder = this.activeFolder();
        if (!folder) return false;
        if (!checking) void this.runFolderExport();
        return true;
      }
    });
  }
  onunload() {
    this.openViews.clear();
  }
  // ------------------------------------------------------------------ settings
  async loadSettings() {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data ?? {} };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /** Usato dal pannello impostazioni per aggiornare le viste aperte. */
  refreshOpenViews() {
    for (const view of this.openViews) view.refresh();
  }
  registerOpenView(view) {
    this.openViews.add(view);
  }
  unregisterOpenView(view) {
    this.openViews.delete(view);
  }
  // ------------------------------------------------------------ API per la vista
  /** Apre (o rivela) la vista laterale nello spazio di destra. */
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_MD2DOKU)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_MD2DOKU, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  /** La nota markdown attiva, se c'è. */
  activeMarkdownFile() {
    const file = this.app.workspace.getActiveFile();
    return file && file.extension === "md" ? file : null;
  }
  /** La cartella della nota attiva (o la radice). */
  activeFolder() {
    const file = this.app.workspace.getActiveFile();
    if (file?.parent instanceof import_obsidian7.TFolder) return file.parent;
    const root = this.app.vault.getRoot();
    return root instanceof import_obsidian7.TFolder ? root : null;
  }
  /** Apre la scheda impostazioni del plugin. */
  openSettings() {
    const setting = this.app.setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }
  /** Cambia ciclicamente la destinazione dell'output (appunti → file → entrambe). */
  async cycleOutputAction() {
    const order = ["clipboard", "file", "both"];
    const idx = order.indexOf(this.settings.outputAction);
    this.settings.outputAction = order[(idx + 1) % order.length];
    await this.saveSettings();
    this.refreshOpenViews();
  }
  // ---------------------------------------------------- azioni (comandi + vista)
  /** Converte la nota Markdown attiva in DokuWiki. */
  async runConvertNote() {
    const file = this.activeMarkdownFile();
    if (!file) {
      new import_obsidian7.Notice("Nessuna nota Markdown attiva");
      return;
    }
    await this.convertActiveFile(file);
  }
  /** Converte la selezione nell'editor attivo (Markdown → DokuWiki). */
  async runConvertSelectionToDoku() {
    const editor = this.activeEditor();
    if (!editor) return void new import_obsidian7.Notice("Nessun editor attivo");
    await this.convertSelection(editor);
  }
  /** Converte la selezione nell'editor attivo (DokuWiki → Markdown). */
  async runConvertSelectionFromDoku() {
    const editor = this.activeEditor();
    if (!editor) return void new import_obsidian7.Notice("Nessun editor attivo");
    await this.convertSelectionFromDoku(editor);
  }
  /** Esporta in DokuWiki la cartella della nota attiva. */
  async runFolderExport() {
    const folder = this.activeFolder();
    if (!folder) {
      new import_obsidian7.Notice("Nessuna cartella attiva");
      return;
    }
    try {
      await exportFolder(this.app, folder, this.settings);
    } catch (error) {
      new import_obsidian7.Notice(error instanceof Error ? error.message : "Esportazione non riuscita");
    }
  }
  openImportModal() {
    new ImportDokuModal(this.app, this).open();
  }
  activeEditor() {
    return this.app.workspace.activeEditor?.editor ?? null;
  }
  /** Crea una nuova nota Markdown dal testo DokuWiki importato. */
  async createImportedNote(markdown, pageName) {
    const file = await createMarkdownNote(this.app, markdown, pageName);
    await this.app.workspace.getLeaf(false).openFile(file);
    new import_obsidian7.Notice(`Nota importata: ${file.path}`);
    return file;
  }
  // ------------------------------------------------------------------ privati
  async convertActiveFile(file) {
    const markdown = await this.app.vault.read(file);
    const { output, warnings } = convertMarkdownToDoku(markdown, this.settings, file.name);
    const action = this.settings.outputAction;
    if (action === "clipboard" || action === "both") {
      await copyToClipboard(output, warnings > 0 ? `Copiato (${warnings} avvisi)` : "Copiato negli appunti");
    }
    if (action === "file" || action === "both") {
      const written = await writeSibling(this.app, file.path, output, this.settings.outputExtension);
      new import_obsidian7.Notice(`Scritto ${written.path}`);
    }
  }
  async convertSelection(editor) {
    const selection = editor.getSelection();
    if (selection.trim() === "") {
      new import_obsidian7.Notice("Nessuna selezione");
      return;
    }
    const { output, warnings } = convertMarkdownToDoku(selection, this.settings);
    editor.replaceSelection(output);
    new import_obsidian7.Notice(warnings > 0 ? `Convertito (${warnings} avvisi)` : "Selezione convertita");
  }
  async convertSelectionFromDoku(editor) {
    const selection = editor.getSelection();
    if (selection.trim() === "") {
      new import_obsidian7.Notice("Nessuna selezione");
      return;
    }
    const { output, warnings } = convertDokuToMarkdown(selection, this.settings);
    editor.replaceSelection(output);
    new import_obsidian7.Notice(warnings > 0 ? `Importato (${warnings} avvisi)` : "Selezione importata");
  }
};
