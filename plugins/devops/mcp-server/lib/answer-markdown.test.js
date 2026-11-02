import { describe, test, expect } from "vitest";
import { answerHtml, normalizeAnswer, ANSWER_MAX } from "./answer-markdown.js";

// #757: the answer above the card is markdown rendered without HTML injection.
describe("answerHtml", () => {
  test("empty or non-string → ''", () => {
    expect(answerHtml("")).toBe("");
    expect(answerHtml("   ")).toBe("");
    expect(answerHtml(undefined)).toBe("");
    expect(answerHtml(42)).toBe("");
  });

  test("raw HTML is escaped, never injected", () => {
    const h = answerHtml('<img src=x onerror="alert(1)"> & <script>x</script>');
    expect(h).not.toMatch(/<img|<script/);
    expect(h).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;script&gt;");
  });

  test("links: http(s) only, quotes cannot break out of href", () => {
    expect(answerHtml("[PR](https://github.com/o/r/pull/1)")).toContain('<a href="https://github.com/o/r/pull/1" target="_blank" rel="noopener noreferrer">PR</a>');
    expect(answerHtml("[x](javascript:alert(1))")).not.toContain("<a ");
    const h = answerHtml('[x](https://e.com/"onmouseover="a)');
    expect(h).not.toMatch(/href="[^"]*"onmouseover/);
  });

  test("headings, lists, code, emphasis, paragraphs", () => {
    // Structure only — the inline styles are checked in the next test.
    const h = answerHtml("# Titel\n\n- eins\n- **zwei**\n\n1. a\n2. b\n\nText `a<b` und *kursiv*\nneue Zeile\n\n```\nif (a < b) {}\n```")
      .replace(/ style="[^"]*"/g, "");
    expect(h).toContain("<h4>Titel</h4>");
    expect(h).toContain("<ul><li>eins</li><li><strong>zwei</strong></li></ul>");
    expect(h).toContain("<ol><li>a</li><li>b</li></ol>");
    expect(h).toContain("<code>a&lt;b</code>");
    expect(h).toContain("<em>kursiv</em>");
    expect(h).toContain("<br>neue Zeile");
    expect(h).toContain("<pre><code>if (a &lt; b) {}</code></pre>");
    expect(h.startsWith('<div class="dc-answer"')).toBe(true);
  });

  // Reported: unstyled, the answer inherited the widget host's base type —
  // everything bold and large, lists without bullets, no paragraph gaps.
  test("every element carries the card's own typography inline", () => {
    const h = answerHtml("**fett** Text `code`\n\n- eins\n\n1. a");
    expect(h).toMatch(/^<div class="dc-answer" style="[^"]*font-size:14px;font-weight:400;[^"]*color:var\(--text-primary\)/);
    expect(h).toMatch(/<p style="margin:0 0 8px">/);
    expect(h).toMatch(/<strong style="font-weight:600">fett<\/strong>/);
    expect(h).toMatch(/<ul style="[^"]*padding-left:20px;list-style:disc">/);
    expect(h).toMatch(/<ol style="[^"]*list-style:decimal">/);
    expect(h).toMatch(/<li style="margin:2px 0">eins<\/li>/);
    expect(h).toMatch(/<code style="[^"]*font-size:12.5px[^"]*">code<\/code>/);
  });

  test("an oversized answer is capped", () => {
    expect(normalizeAnswer("x".repeat(ANSWER_MAX + 50)).length).toBe(ANSWER_MAX + 1);
  });

  // #995: GFM pipe tables render as real tables.
  describe("tables", () => {
    const md = "| Option | Kosten | Nutzen |\n|:--|:-:|--:|\n| **A** | `1` | [x](https://e.x) |\n| <b>B</b> | 2 |";

    test("header + separator → table with thead/tbody", () => {
      const h = answerHtml(md);
      expect(h).toMatch(/<table[^>]*><thead><tr><th[^>]*>Option<\/th>/);
      expect(h).toContain("<tbody><tr>");
      expect(h.match(/<tr>/g)).toHaveLength(3);
    });

    test("inline markdown works in cells", () => {
      const h = answerHtml(md);
      expect(h).toMatch(/<strong[^>]*>A<\/strong>/);
      expect(h).toMatch(/<code[^>]*>1<\/code>/);
      expect(h).toContain('<a href="https://e.x"');
    });

    test("alignment is applied per column", () => {
      const h = answerHtml(md);
      expect(h).toMatch(/<th style="[^"]*text-align:left">Option/);
      expect(h).toMatch(/<th style="[^"]*text-align:center">Kosten/);
      expect(h).toMatch(/<th style="[^"]*text-align:right">Nutzen/);
    });

    test("raw HTML in a cell stays escaped; short rows are padded", () => {
      const h = answerHtml(md);
      expect(h).not.toContain("<b>");
      expect(h).toContain("&lt;b&gt;B&lt;/b&gt;");
      expect(h.split("<tr>").pop().match(/<td/g)).toHaveLength(3);
    });

    test("escaped pipes stay inside a cell", () => {
      expect(answerHtml("a | b\n--- | ---\nx \\| y | z")).toMatch(/<td[^>]*>x \| y<\/td>/);
    });

    test("a pipe line without separator stays a paragraph", () => {
      const h = answerHtml("a | b\nc | d");
      expect(h).not.toContain("<table");
      expect(h).toContain("<p");
    });

    test("the table ends at a blank line", () => {
      expect(answerHtml("a|b\n---|---\n1|2\n\nafter")).toMatch(/<\/table><\/div><p[^>]*>after<\/p>/);
    });
  });
});
