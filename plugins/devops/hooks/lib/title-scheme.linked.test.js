import { describe, test, expect } from "vitest";
import S from "./title-scheme.js";

describe("title-scheme - side-session states (2.6)", () => {
  test("heads of linked, linked-waiting, delivered and agents-waiting", () => {
    expect(S.head("linked").text).toBe("⏳ ➜ 🔗 Linked ┃");
    expect(S.head("linked-waiting").text).toBe("👉 ➜ 🔗 Linked ┃");
    expect(S.head("delivered").text).toBe("🟩 ➜ 📦 Delivered ┃");
    expect(S.head("delivered", { mandatory: true }).text).toBe("👉 ➜ 📦 Delivered ┃");
    expect(S.head("agents-waiting").text).toBe("👉 ➜ 🤖 Team ┃");
    expect(S.headingOf("linked", "x")).toBe("⏳ 🔗 Linked — x");
    expect(S.headingOf("agents-waiting", "x")).toBe("👉 🤖 Team — x");
    expect(S.headingOf("delivered", "Teil fertig")).toBe("🟩 📦 Delivered — Teil fertig");
  });

  test("classify and strip recognise them", () => {
    expect(S.classify("⏳ ➜ 🔗 Linked ┃ Doku")).toBe("process");
    expect(S.classify("👉 ➜ 🔗 Linked ┃ Doku")).toBe("outcome");
    expect(S.classify("🟩 ➜ 📦 Delivered ┃ Teil A")).toBe("outcome");
    expect(S.classify("👉 ➜ 🤖 Team ┃ Teil A")).toBe("approval");
    expect(S.stripPrefixes("⏳ ➜ 🔗 Linked ┃ Doku")).toBe("Doku");
    expect(S.stripPrefixes("👉 ➜ 🔗 Linked ┃ ⏳ ➜ 🔗 Linked ┃ Doku")).toBe("Doku");
    expect(S.stripPrefixes("🟩 ➜ 📦 Delivered ┃ Teil A")).toBe("Teil A");
  });
});
