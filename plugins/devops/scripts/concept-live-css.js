/**
 * @module concept-live-css
 * @description Live-Treue rounds (auto-concept deep-knowledge/live-fidelity.md):
 *   bring the live app's own stylesheet into one design of
 *   a round without it restyling the concept page around it.
 *
 *   A round fragment names the file instead of copying it:
 *
 *     <style data-live-css="assets/03/app.css" data-scope="d1"></style>
 *
 *   `concept-build.js build` replaces that element with the file's rules,
 *   every selector scoped under `[data-design="d1"]` (`html`, `body` and
 *   `:root` become the design wrapper itself, so the app's custom properties
 *   still cascade), and every relative `url(…)` rewritten from the CSS
 *   file's folder to the built page's folder. The path is relative to the
 *   concept source folder and must stay inside it. `@import` and external or
 *   root-relative URLs are refused: the page stays self-contained, and the
 *   bridge serves only what lies next to the page.
 *
 *   Why a build step and not authored CSS: copying a live stylesheet by hand
 *   costs the whole file in tokens per round and per design, and an
 *   unscoped `body {}` / `button {}` / `:root {}` rule restyles the engine's
 *   own panel, dock and tabs — the #400 class of bug, which gate P32 cannot
 *   see because it only checks class selectors.
 */

const fs = require('fs');
const path = require('path');

const LIVE_CSS_SOFT_LIMIT = 250 * 1024;

const stripComments = css => String(css).replace(/\/\*[\s\S]*?\*\//g, '');

/** Split a selector list on top-level commas (`:is(a, b)` stays whole). */
function splitSelectors(list) {
  const out = [];
  let depth = 0, buf = '', quote = '';
  for (const ch of list) {
    if (quote) { buf += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { if (buf.trim()) out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const ROOT_TOKEN = /^(html|body|:root)(?![\w-])((?:[.#[:][^\s>+~]*)?)\s*(?:>\s*)?/i;

/** One selector → the same selector inside `scope`. */
function scopeSelector(sel, scope) {
  let rest = sel.trim();
  let lead = '';
  let consumed = false;
  for (let m = ROOT_TOKEN.exec(rest); m; m = ROOT_TOKEN.exec(rest)) {
    consumed = true;
    lead += m[2] || '';
    rest = rest.slice(m[0].length);
  }
  if (consumed) return rest ? `${scope}${lead} ${rest}` : `${scope}${lead}`;
  return `${scope} ${rest}`;
}

/** Index of the `}` that closes the block opened at `open` (string-aware). */
function blockEnd(src, open) {
  let depth = 0, quote = '';
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) return i; }
  }
  return -1;
}

/**
 * Scope every style rule of `css` under `scope` (a selector such as
 * `[data-design="d1"]`). Grouping at-rules recurse; @font-face, @keyframes,
 * @property, @page, @counter-style stay as written. `@import` is dropped and
 * reported.
 * @returns {{ css: string, problems: string[] }}
 */
function scopeCss(css, scope) {
  const problems = [];
  const walk = src => {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const brace = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (brace < 0 && semi < 0) break;
      // A statement at-rule (`@import …;`, `@charset …;`, `@layer a, b;`) ends before any block.
      if (semi >= 0 && (brace < 0 || semi < brace)) {
        const stmt = src.slice(i, semi + 1).trim();
        if (/^@import\b/i.test(stmt)) problems.push(`@import is not inlined ("${stmt.slice(0, 60)}") — copy that file into assets/ and name it in its own data-live-css`);
        else if (stmt.startsWith('@')) out += stmt + '\n';
        i = semi + 1;
        continue;
      }
      const prelude = src.slice(i, brace).trim();
      const end = blockEnd(src, brace);
      if (end < 0) { problems.push(`unbalanced braces after "${prelude.slice(0, 40)}"`); break; }
      const body = src.slice(brace + 1, end);
      if (prelude.startsWith('@')) {
        if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) out += `${prelude} {\n${walk(body)}}\n`;
        else out += `${prelude} {${body}}\n`;
      } else if (prelude) {
        out += `${splitSelectors(prelude).map(s => scopeSelector(s, scope)).join(', ')} {${body}}\n`;
      }
      i = end + 1;
    }
    return out;
  };
  return { css: walk(stripComments(css)), problems };
}

const toPosix = p => p.split(path.sep).join('/');
const inside = (root, p) => {
  const rel = path.relative(root, p);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * Relative `url(…)` in a CSS file → relative to the built page. External,
 * root-relative and out-of-folder URLs are reported, never rewritten.
 * @returns {{ css: string, problems: string[] }}
 */
function rewriteUrls(css, { cssFile, sourceDir, pageDir }) {
  const problems = [];
  const out = String(css).replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, q, raw) => {
    const u = raw.trim();
    if (!u || /^(data:|#)/i.test(u)) return whole;
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) { problems.push(`external url(${u}) — copy the file into assets/ and point at it relatively`); return whole; }
    if (u.startsWith('/')) { problems.push(`root-relative url(${u}) — the bridge serves the project root, not the app's; copy the file into assets/`); return whole; }
    const [file, suffix = ''] = u.split(/(?=[?#])/);
    const abs = path.resolve(path.dirname(cssFile), file);
    if (!inside(sourceDir, abs)) { problems.push(`url(${u}) leaves the concept source folder`); return whole; }
    return `url("${toPosix(path.relative(pageDir, abs))}${suffix}")`;
  });
  return { css: out, problems };
}

const LIVE_STYLE_RE = /<style\b((?:[^>"']|"[^"]*"|'[^']*')*)\bdata-live-css=("|')([^"']*)\2((?:[^>"']|"[^"]*"|'[^']*')*)>[\s\S]*?<\/style\s*>/gi;

/**
 * Replace every `<style data-live-css="…" data-scope="…">` of one round
 * fragment with the scoped file content.
 * @param {string} fragment
 * @param {{ sourceDir: string, pageDir: string, round?: number }} opts
 * @returns {{ html: string, problems: string[], warnings: string[] }}
 */
function inlineLiveCss(fragment, { sourceDir, pageDir, round = '?' }) {
  const problems = [];
  const warnings = [];
  const html = String(fragment).replace(LIVE_STYLE_RE, (whole, before, q, rel, after) => {
    const attrs = before + after;
    const scopeM = /\bdata-scope=("|')([^"']*)\1/i.exec(attrs);
    const scopeId = scopeM ? scopeM[2].trim() : '';
    if (!/^[\w-]+$/.test(scopeId)) { problems.push(`round ${round}: <style data-live-css="${rel}"> needs data-scope="<design id>"`); return whole; }
    const file = path.resolve(sourceDir, rel);
    if (!inside(sourceDir, file)) { problems.push(`round ${round}: data-live-css="${rel}" leaves the concept source folder`); return whole; }
    if (!fs.existsSync(file)) { problems.push(`round ${round}: data-live-css="${rel}" not found in the concept source folder`); return whole; }
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.length > LIVE_CSS_SOFT_LIMIT) warnings.push(`round ${round}: live CSS ${rel} is ${Math.round(raw.length / 1024)} KB — trim it to the rules the view uses`);
    const urls = rewriteUrls(raw, { cssFile: file, sourceDir, pageDir });
    const scoped = scopeCss(urls.css, `[data-design="${scopeId}"]`);
    for (const p of [...urls.problems, ...scoped.problems]) problems.push(`round ${round}: ${rel}: ${p}`);
    return `<style data-live-src="${toPosix(rel)}" data-scope="${scopeId}">\n${scoped.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  });
  return { html, problems, warnings };
}

module.exports = { scopeCss, scopeSelector, rewriteUrls, inlineLiveCss, LIVE_CSS_SOFT_LIMIT };
