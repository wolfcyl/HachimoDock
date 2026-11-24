/**
 * [Input] Followed-Agent cards and companion Agent snapshots.
 * [Output] Device queue coverage that keeps the followed Agent first and admits other live local conversations.
 * [Pos] Test node for multi-Agent device session cards.
 * [Sync] If this file changes, update `pc/src/dashboard/.folder.md`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  labelCompanionSession,
  mergeCompanionDeviceSessions,
} from "./useCompanionDeviceSessions.js";

test("device cards keep the followed Agent first and include other live local conversations", () => {
  const merged = mergeCompanionDeviceSessions([
    { id: "cursor-live", state: "working", name: "当前任务" },
    { id: "cursor-done", state: "done", name: "刚才的任务" },
  ], [
    labelCompanionSession("workbuddy", {
      id: "wb-live",
      state: "working",
      displayTitle: "整理表格",
    }),
    labelCompanionSession("codex", {
      id: "codex-live",
      state: "thinking",
      name: "修复同步",
    }),
  ]);

  assert.deepEqual(merged.map((session) => session.id), [
    "cursor-live",
    "wb-live",
    "codex-live",
    "cursor-done",
  ]);
  assert.equal(merged[1].deviceCompanion, true);
  assert.equal(merged[1].displayTitle, "WorkBuddy · 整理表格");
  assert.equal(merged[2].displayTitle, "Codex · 修复同步");
});

test("companion labels are not repeated", () => {
  const session = labelCompanionSession("workbuddy", {
    id: "wb",
    state: "working",
    displayTitle: "WorkBuddy · 已有标题",
  });
  assert.equal(session.displayTitle, "WorkBuddy · 已有标题");
});
