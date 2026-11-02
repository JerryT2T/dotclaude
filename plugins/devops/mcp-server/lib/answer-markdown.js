/**
 * The card's `answer` field (#757): the full answer to the user's question,
 * written as markdown and drawn ABOVE the card body — inside the Desktop
 * widget, so it can no longer be lost when the app rephrases text written
 * before a further tool call.
 *
 * `answerHtml` is a deliberately small markdown subset rendered SAFELY: the
 * whole input is HTML-escaped first, so raw HTML in the answer is shown as
 * text and never injected. Supported: `#`–`###` headings, `-`/`*`/`1.` lists,
 * fenced code blocks, GFM pipe tables (header + `---` separator row, with
 * `:--` / `:-:` / `--:` alignment; #995), `inline code`, **bold**, *italic*,
 * and links whose target is http(s) (anything else stays plain text).
 * Paragraphs split on blank lines; single newlines become `<br>`.
 */

export const ANSWER_MAX = 20000;

// Every element carries its own inline style, like the rest of the card: the
// widget host's base typography is not the card's (reported: the whole answer
// rendered bold and large, lists without bullets, paragraphs without gaps).
// Sizes and tokens follow the card body (14 px text, host tokens only).
const S = {
  box: "margin:0 0 12px;font-size:14px;font-weight:400;line-height:1.55;color:var(--text-primary)",
  p: "margin:0 0 8px",
  list: "margin:0 0 8px;padding-left:20px",
  li: "margin:2px 0",
  strong: "font-weight:600",
  code: "font-family:var(--font-mono, ui-monospace, monospace);font-size:12.5px;padding:1px 4px;border-radius:4px;" +
    "background:color-mix(in srgb, var(--text-primary) 9%, transparent)",
  pre: "margin:0 0 8px;padding:8px 10px;border-radius:6px;overflow-x:auto;" +
    "background:color-mix(in srgb, var(--text-primary) 7%, transparent)",
  h: "margin:10px 0 6px;font-size:14px;font-weight:600",
  tableWrap: "margin:0 0 8px;overflow-x:auto",
  table: "border-collapse:collapse;font-size:13px",
  th: "padding:4px 10px;font-weight:600;border-bottom:1px solid color-mix(in srgb, var(--text-primary) 25%, transparent)",
  td: "padding:4px 10px;border-bottom:1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
};

// A GFM separator row: cells of one or more `-` with optional `:` on either side.
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Cells of one table row: split on unescaped `|`, outer pipes dropped. */
function tableCells(row) {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function tableAlign(sep) {
  return tableCells(sep).map((c) => {
    const l = c.startsWith(":"), r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : "";
  });
}

function tableHtml(header, sep, rows) {
  const align = tableAlign(sep);
  const cols = tableCells(header).length;
  const cell = (tag, style, cells) => Array.from({ length: cols }, (_, i) => {
    const a = align[i] ? `;text-align:${align[i]}` : tag === "th" ? ";text-align:left" : "";
    return `<${tag} style="${style}${a}">${inline(cells[i] || "")}</${tag}>`;
  }).join("");
  const body = rows.map((r) => `<tr>${cell("td", S.td, tableCells(r))}</tr>`).join("");
  return `<div style="${S.tableWrap}"><table style="${S.table}">` +
    `<thead><tr>${cell("th", S.th, tableCells(header))}</tr></thead>` +
    `<tbody>${body}</tbody></table></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** The answer text, trimmed and capped; '' when absent or not a string. */
export function normalizeAnswer(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > ANSWER_MAX ? t.slice(0, ANSWER_MAX) + "…" : t;
}

/** Inline markdown on ALREADY-ESCAPED text. */
function inline(escaped) {
  const codes = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `@@dcCODE${codes.length - 1}@@`;
  });
  // Links: the target was escaped too, so `&quot;` etc. cannot break out of href.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, href) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, `<strong style="${S.strong}">$1</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/@@dcCODE(\d+)@@/g, (m, i) => (codes[Number(i)] !== undefined ? `<code style="${S.code}">${codes[Number(i)]}</code>` : m));
}

/**
 * @param {string} md the answer markdown
 * @returns {string} an HTML fragment, '' for an empty answer
 */
export function answerHtml(md) {
  const text = normalizeAnswer(md);
  if (!text) return "";
  const lines = escapeHtml(text).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null; // { tag, items }
  const flushPara = () => {
    if (para.length) out.push(`<p style="${S.p}">${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const type = list.tag === "ul" ? "disc" : "decimal";
      out.push(`<${list.tag} style="${S.list};list-style:${type}">` +
        `${list.items.map((i) => `<li style="${S.li}">${inline(i)}</li>`).join("")}</${list.tag}>`);
    }
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushPara(); flushList();
      const body = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      out.push(`<pre style="${S.pre}"><code style="font-family:var(--font-mono, ui-monospace, monospace);font-size:12.5px">${body.join("\n")}</code></pre>`);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length + 3; // h4–h6: below the card's own title
      out.push(`<h${level} style="${S.h}">${inline(h[2])}</h${level}>`);
      continue;
    }
    // GFM: the separator must have as many cells as the header, so a lone
    // `---` under a line that merely contains `|` is no table.
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) &&
        tableCells(lines[i + 1]).length === tableCells(line).length) {
      flushPara(); flushList();
      const rows = [];
      let j = i + 2;
      for (; j < lines.length && lines[j].trim() && lines[j].includes("|"); j++) rows.push(lines[j]);
      out.push(tableHtml(line, lines[i + 1], rows));
      i = j - 1;
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((ul || ol)[1]);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return `<div class="dc-answer" style="${S.box}">${out.join("")}</div>`;
}
