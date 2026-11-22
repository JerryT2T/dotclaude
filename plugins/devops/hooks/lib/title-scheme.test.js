import { describe, test, expect } from "vitest";
import S from "./title-scheme.js";

const HAIR = String.fromCharCode(0x200A);
const FE0F = String.fromCharCode(0xFE0F);

describe("title-scheme — new grammar", () => {
  test("prefix shape: status, arrow, activity, one space — no keyword, no bar, no fill", () => {
    // The sidebar drops whitespace runs, so a hair-space fill never renders.
    expect(S.prefixOf("aborted-ship")).toBe("🟥 ➜ 🚀 ");
    expect(S.prefixOf("interrupted")).toBe("👉 ➜ ⚡ ");
    expect(S.prefixOf("ready")).not.toContain(HAIR);
  });

  test("head and heading carry the same parts", () => {
    expect(S.head("ready").text).toBe("👉 ➜ 📦");
    expect(S.headingOf("ready", "Shippen?")).toBe("👉 📦 Ready — Shippen?");
    expect(S.head("released-alpha").text).toBe("🟩 ➜ 🚀");
    expect(S.head("released-alpha", { mandatory: true }).text).toBe("👉 ➜ 🚀");
    expect(S.head("paused-restart").text).toBe("🟦 ➜ 🔌");
    expect(S.head("agents").text).toBe("⏳ ➜ 🤖🤖🤖");
  });

  test("the generic work prefix is Solo and classifies as work", () => {
    expect(S.WORK_PREFIX).toBe("⏳ ➜ 🤖 ");
    expect(S.classify(S.WORK_PREFIX + "Fix")).toBe("work");
    expect(S.stripPrefixes(S.WORK_PREFIX + "Fix")).toBe("Fix");
  });

  test("a 2.0.0 title with its hair-space fill is still recognised", () => {
    expect(S.classify("⏳ ┃ " + HAIR.repeat(24) + "Solo 🤖 Fix")).toBe("work");
    expect(S.stripPrefixes("🟩 ┃ " + HAIR.repeat(19) + "Alpha 🚀 Login")).toBe("Login");
  });

  test("the fill the Desktop app stored as plain spaces is recognised too", () => {
    // Observed 2026-10-21: the app keeps the hair-space fill as U+0020, the
    // heads were missed and stacked one per turn.
    const fill = " ".repeat(25);
    expect(S.classify("⏳ ┃" + fill + "Concept 🧭 Anno")).toBe("process");
    expect(S.stripPrefixes(
      "👉 🧪 Test – ┃ Solo 🤖 ┃" + fill + "Solo 🤖 ┃" + fill + "Solo 🤖 Dritte Ebene funktioniert nicht",
    )).toBe("Dritte Ebene funktioniert nicht");
    expect(S.stripPrefixes("🟩 📋 Analysis – ┃" + fill + "Solo 🤖 Fix")).toBe("Fix");
    expect(S.stripPrefixes("⏳ Fix  Login")).toBe("Fix  Login");
  });

  test("the word-first order of v0.287–v0.291 is still recognised", () => {
    expect(S.classify("⏳ ┃ Shipping 🚀 X")).toBe("shipping");
    expect(S.classify("👉 ┃ Concept 🧭 X")).toBe("concept-waiting");
    expect(S.classify("⏳ ┃ Solo 🤖 X")).toBe("work");
    expect(S.stripPrefixes("🟩 ┃ Started 💡 Spiel")).toBe("Spiel");
    expect(S.stripPrefixes("⏳ ➜ 🤖 👉 ┃ Ready 📦 Login")).toBe("Login");
  });

  test("the bare channel word of v0.292 is still recognised", () => {
    expect(S.classify("🟩 ➜ 🚀 Alpha ┃ X")).toBe("outcome");
    expect(S.stripPrefixes("👉 ➜ 🚀 Stable ┃ Login")).toBe("Login");
    expect(S.stripPrefixes("🟩 ┃ Beta 🚀 Login")).toBe("Login");
    expect(S.prefixOf("released-alpha")).toBe("🟩 ➜ 🚀 ");
  });

  test("Started carries the sparkles, not the light bulb", () => {
    expect(S.prefixOf("started")).toBe("🟩 ➜ ✨ ");
  });
});

describe("title-scheme — tolerant matching", () => {
  test("FE0F and any number of hair spaces still match a new prefix", () => {
    const plain = "👉 ➜ ⚠️ Fix";
    const variants = [
      plain,
      "👉 ➜ ⚠️ Fix",
      "👉 ┃ " + HAIR.repeat(3) + "⚠️ Red tests" + FE0F + " Fix",
      "👉 ┃ " + HAIR.repeat(40) + "⚠️ Red tests Fix",
    ];
    for (const v of variants) {
      expect(S.stripPrefixes(v), JSON.stringify(v)).toBe("Fix");
      expect(S.classify(v), JSON.stringify(v)).toBe("outcome");
    }
  });

  test("a title with a different fill count still classifies", () => {
    expect(S.classify("⏳ ┃ " + HAIR.repeat(2) + "🚀 Shipping X")).toBe("shipping");
    expect(S.classify("👉 ➜ 🧭 X")).toBe("concept-waiting");
    expect(S.classify("⏳ ➜ 🧭 X")).toBe("process");
    expect(S.classify("🟦 ➜ 📚 X")).toBe("batch");
  });
});

describe("title-scheme — legacy generation", () => {
  test("the previous two-slot prefix is still stripped and classified", () => {
    expect(S.stripPrefixes("👉 📦 Ready – Login")).toBe("Login");
    expect(S.stripPrefixes("🟩 🎊 Released Stable – Login")).toBe("Login");
    expect(S.stripPrefixes("⏸️ 🔄 Restart – Login")).toBe("Login");
    expect(S.stripPrefixes("⏸ 🔄 Restart – Login")).toBe("Login");
    expect(S.stripPrefixes("⏳ Login")).toBe("Login");
    expect(S.classify("⏳ 🚀 Shipping – X")).toBe("shipping");
    expect(S.classify("👉 📥 Batch – X")).toBe("batch");
    expect(S.classify("👉 🧭 Concept – X")).toBe("concept-waiting");
    expect(S.classify("⏳ 🤖 Agents – X")).toBe("process");
    expect(S.classify("🟩 📋 Analysis – X")).toBe("outcome");
    expect(S.classify("⏳ X")).toBe("work");
    expect(S.classify("⏳ Working – X")).toBe("work");
    expect(S.classify("📦 Ready – X")).toBe("outcome");
    expect(S.classify("Plain")).toBe("plain");
  });

  test("the 2.2/2.3 bar-first order is still stripped and classified", () => {
    expect(S.stripPrefixes("⏳ ┃ 🤖 Solo README")).toBe("README");
    expect(S.classify("⏳ ┃ 🤖 Solo README")).toBe("work");
    expect(S.classify("⏳ ┃ 🚀 Shipping X")).toBe("shipping");
    expect(S.classify("👉 ┃ 🧭 Concept X")).toBe("concept-waiting");
    expect(S.classify("👉 ┃ 📚 Batch X")).toBe("batch");
    expect(S.stripPrefixes("🟩 ┃ 🚀 Released Alpha " + S.WORK_PREFIX + "Job")).toBe("Job");
  });

  test("the current head is arrow and activity", () => {
    expect(S.WORK_PREFIX).toBe("⏳ ➜ 🤖 ");
    expect(S.prefixOf("ready")).toBe("👉 ➜ 📦 ");
    expect(S.stripPrefixes("➜ 🚀 Orphan")).toBe("Orphan");
  });

  test("a status-less head left by an older plugin's stacking is stripped", () => {
    expect(S.stripPrefixes("⏳ 🧭 Concept – ┃ 🚀 Shipping DevOps backlog")).toBe("DevOps backlog");
    expect(S.stripPrefixes("⏳ 🤖 Agents – ┃ " + " ".repeat(9) + "🚀 Shipping Dev start")).toBe("Dev start");
    expect(S.stripPrefixes("┃ 🤖 Solo Anno")).toBe("Anno");
    expect(S.classify("┃ 🤖 Solo Anno")).toBe("plain");
    expect(S.stripPrefixes("┃ not a head")).toBe("┃ not a head");
  });

  test("stacked old and new prefixes are stripped together", () => {
    expect(S.stripPrefixes(S.prefixOf("ready") + "👉 📦 Ready – ⏳ Working – Job")).toBe("Job");
    expect(S.stripPrefixes("⏳ 🚀 Shipping – " + S.prefixOf("released-alpha") + "Job")).toBe("Job");
  });

  test("free text after a known prefix stays", () => {
    expect(S.stripPrefixes("⏳ Fix Login – Bug")).toBe("Fix Login – Bug");
    expect(S.stripPrefixes(S.prefixOf("ready") + "Fix Login – Bug")).toBe("Fix Login – Bug");
  });
});

describe("title-scheme 3.0 — the title head carries no keyword and no bar", () => {
  const BAR = String.fromCharCode(0x2503);

  test("no state emits a keyword or the bar; the card heading still spells the keyword", () => {
    for (const [id, [, word, act]] of Object.entries(S.STATES)) {
      for (const mandatory of [false, true]) {
        const p = S.prefixOf(id, { mandatory });
        expect(p, id).toMatch(/^\S+ ➜ \S+ $/u);
        expect(p, id).not.toContain(BAR);
        expect(p, id).not.toContain(word);
      }
      expect(S.headingOf(id, "x"), id).toContain(`${act} ${word} — x`);
    }
  });

  test("Team shows three robots in the title, one in the card heading", () => {
    expect(S.prefixOf("agents")).toBe("⏳ ➜ 🤖🤖🤖 ");
    expect(S.prefixOf("aborted-agents")).toBe("🟥 ➜ 🤖🤖🤖 ");
    expect(S.headingOf("agents", "läuft")).toBe("⏳ 🤖 Team — läuft");
    expect(S.head("agents").activity).toBe("🤖");
    expect(S.titleActivity("Team", "🤖")).toBe("🤖🤖🤖");
    expect(S.titleActivity("Solo", "🤖")).toBe("🤖");
  });

  test("Solo and Team stay apart: work vs process, neither is a prefix of the other", () => {
    expect(S.classify("⏳ ➜ 🤖 X")).toBe("work");
    expect(S.classify("⏳ ➜ 🤖🤖🤖 X")).toBe("process");
    expect(S.stripPrefixes("⏳ ➜ 🤖🤖🤖 X")).toBe("X");
    expect(S.leadingPrefix("⏳ ➜ 🤖🤖🤖 X").prefix).toBe(S.prefixOf("agents"));
    expect(S.leadingPrefix("⏳ ➜ 🤖 X").prefix).toBe(S.WORK_PREFIX);
  });

  test("classify reads the icons alone", () => {
    expect(S.classify("⏳ ➜ 🚀 X")).toBe("shipping");
    expect(S.classify("🟩 ➜ 🚀 X")).toBe("outcome");
    expect(S.classify("👉 ➜ 🚀 X")).toBe("outcome");
    expect(S.classify("👉 ➜ 🧭 X")).toBe("concept-waiting");
    expect(S.classify("⏳ ➜ 🧭 X")).toBe("process");
    expect(S.classify("🔴 ➜ 🧭 X")).toBe("outcome");
    expect(S.classify("👉 ➜ 📚 X")).toBe("batch");
    expect(S.classify("🟥 ➜ 📚 X")).toBe("batch");
    expect(S.classify("⏳ ➜ 🧪 X")).toBe("process");
    expect(S.classify("👉 ➜ 🧪 X")).toBe("outcome");
    expect(S.classify("⏳ ➜ 🔗 X")).toBe("process");
    expect(S.classify("👉 ➜ ⚠️ X")).toBe("outcome");
    expect(S.classify("👉 ➜ ⚠ X")).toBe("outcome");
    expect(S.classify("👉 ➜ 🤖 X")).toBe("approval");
    expect(S.classify("👉 ➜ 🤖🤖🤖 X")).toBe("approval");
    expect(S.classify("🟥 ➜ 🤖🤖🤖 X")).toBe("outcome");
  });

  test("the worded head of 2.4–2.8 is stripped and classified like the current one", () => {
    const worded = (id, mandatory) => {
      const h = S.head(id, { mandatory });
      return `${h.status} ➜ ${h.activity} ${h.word} ${BAR} `;
    };
    for (const id of Object.keys(S.STATES)) {
      for (const mandatory of [false, true]) {
        const old = worded(id, mandatory);
        expect(S.stripPrefixes(old + "My task"), old).toBe("My task");
        const now = S.classify(S.prefixOf(id, { mandatory }) + "My task");
        // Testing waiting on an approval was its own category; without the keyword 👉 ➜ 🧪 is the Test outcome.
        expect(S.classify(old + "My task"), old).toBe(now);
      }
    }
    expect(S.stripPrefixes("⏳ ➜ 🤖 Solo ┃ My task")).toBe("My task");
    expect(S.classify("⏳ ➜ 🤖 Solo ┃ My task")).toBe("work");
    expect(S.classify("👉 ➜ 🤖 Solo ┃ My task")).toBe("approval");
    expect(S.classify("👉 ➜ 🧪 Testing ┃ My task")).toBe("outcome");
  });

  test("a worded head stacked with a current one, and its status-less rest, are stripped", () => {
    expect(S.stripPrefixes("⏳ ➜ 🤖 🟩 ➜ 🚀 Released Alpha ┃ Job")).toBe("Job");
    expect(S.stripPrefixes("🟩 ➜ 🚀 Released Alpha ┃ ⏳ ➜ 🤖🤖🤖 Job")).toBe("Job");
    expect(S.stripPrefixes("⏳ 🧭 Concept – ➜ 🚀 Shipping ┃ Backlog")).toBe("Backlog");
    expect(S.stripPrefixes("⏳ 🧭 Concept – ➜ 🤖🤖🤖 Backlog")).toBe("Backlog");
  });

  test("the sub marker rides in front of the short head", () => {
    expect(S.withSubMark("⏳ ➜ 🤖 X")).toBe("🔗 ⏳ ➜ 🤖 X");
    expect(S.hasSubMark("🔗 ⏳ ➜ 🤖🤖🤖 X")).toBe(true);
    expect(S.classify("🔗 ⏳ ➜ 🔗 X")).toBe("process");
    expect(S.stripPrefixes("🔗 🟩 ➜ 🚀 X")).toBe("X");
  });
});
