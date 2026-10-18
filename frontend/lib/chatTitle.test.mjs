import { strict as assert } from "node:assert";
import { test } from "node:test";

// Plain ESM reimplementation mirroring chatTitle.ts for node:test without ts loader
function chatTitleFromDraft(draft, maxLen = 48) {
  const title = (draft || "").trim().replace(/\s+/g, " ").slice(0, maxLen);
  return title || "Новый чат";
}

test("empty draft → Новый чат", () => {
  assert.equal(chatTitleFromDraft(""), "Новый чат");
  assert.equal(chatTitleFromDraft("   "), "Новый чат");
  assert.equal(chatTitleFromDraft(undefined), "Новый чат");
});

test("trims and collapses whitespace", () => {
  assert.equal(chatTitleFromDraft("  привет   мир  "), "привет мир");
});

test("truncates long messages", () => {
  const long = "а".repeat(100);
  assert.equal(chatTitleFromDraft(long).length, 48);
});
