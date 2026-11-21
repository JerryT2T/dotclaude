import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

// The title plan of a Claude Projects thread (lib/project-thread.js): the head
// goes on the thread's own title with rename_thread — never on the session's
// sidebar title, which nobody sees there.
const require = createRequire(import.meta.url);
const { threadTitlePlan, titlePlan } = require("./title-plan.js");

const wake = (text) =>
  '<wake reason="mention" current-time="2026-11-21T21:51:27Z">\n  <project id="chan_01TEST" type="project">\n' +
  `    <message trigger="true" from="human" trust="principal" id="cmsg_01TEST">${text}</message>\n  </project>\n</wake>\n`;
const RELAY = '<relay from="coordinator" session="session_01TEST" reason="spawn">\n  <note>Do it.</note>\n</relay>';
const LONG = "Rename the Star Citizen Companion project folders on this computer";

describe("threadTitlePlan", () => {
  test("first wake, title unknown: the model prefixes the title it sees", () => {
    const plan = threadTitlePlan({ prompt: wake("rename the folders"), current: null });
    expect(plan.context).toContain('mcp__hearthbot__rename_thread {title:"⏳ ➜ 🤖 Solo ┃ " + <this thread\'s current title');
    expect(plan.context).toContain("[prompt.flow.title-work] Project thread, once:");
    expect(plan.sessionTitle).toBeNull();
  });

  test("never names a Desktop tool, a topic limit or a question title", () => {
    for (const current of [null, "👉 ➜ 📦 Ready ┃ " + LONG]) {
      const { context } = threadTitlePlan({ prompt: wake("weiter"), current });
      expect(context).not.toMatch(/set_session_title|get_session|ToolSearch|Desktop app|20 characters|Question/);
    }
  });

  test("an outcome head yields to the hourglass, the topic stays whole", () => {
    const { context } = threadTitlePlan({ prompt: wake("weiter"), current: "👉 ➜ 📊 Analysis ┃ " + LONG });
    expect(context).toContain(`mcp__hearthbot__rename_thread {title:"⏳ ➜ 🤖 Solo ┃ ${LONG}"}`);
    // The same title through the sidebar plan is cut to the 42-character budget.
    expect(titlePlan({ prompt: "weiter", current: "👉 ➜ 📊 Analysis ┃ " + LONG, firstPrompt: false, fresh: false }).context).toContain("…");
  });

  test("a plain title (the coordinator's own) gets the head", () => {
    const { context } = threadTitlePlan({ prompt: wake("weiter"), current: "Rename the project folders" });
    expect(context).toContain('{title:"⏳ ➜ 🤖 Solo ┃ Rename the project folders"}');
  });

  test("already marked → nothing to do", () => {
    expect(threadTitlePlan({ prompt: wake("weiter"), current: "⏳ ➜ 🤖 Solo ┃ Rename the project folders" }).context).toBe("");
    expect(threadTitlePlan({ prompt: wake("weiter"), current: "⏳ ➜ 🚀 Shipping ┃ Rename the project folders" }).context).toBe("");
  });

  test("a ship is read off the person's words, not off the envelope", () => {
    expect(threadTitlePlan({ prompt: wake("ship"), current: "👉 ➜ 📦 Ready ┃ Folder rename" }).context)
      .toContain('{title:"⏳ ➜ 🚀 Shipping ┃ Folder rename"}');
    expect(threadTitlePlan({ prompt: wake("ship"), current: null }).context).toContain('{title:"⏳ ➜ 🚀 Shipping ┃ " + <');
    expect(threadTitlePlan({ prompt: wake("weiter"), current: "👉 ➜ 📦 Ready ┃ Folder rename", resumesShip: true }).context)
      .toContain("⏳ ➜ 🚀 Shipping ┃ Folder rename");
  });

  test("a coordinator note keeps every known head and marks nothing unknown", () => {
    expect(threadTitlePlan({ prompt: RELAY, current: "👉 ➜ 📦 Ready ┃ Folder rename" }).context).toBe("");
    expect(threadTitlePlan({ prompt: RELAY, current: null }).context).toBe("");
    expect(threadTitlePlan({ prompt: RELAY, current: "Folder rename" }).context).toContain('{title:"⏳ ➜ 🤖 Solo ┃ Folder rename"}');
  });
});
