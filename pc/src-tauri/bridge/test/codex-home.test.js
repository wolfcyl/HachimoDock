"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { selectCodexDataDir } = require("../agents/codex-home");

function touch(file, mtimeMs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  const seconds = mtimeMs / 1000;
  fs.utimesSync(file, seconds, seconds);
}

test("Codex home follows the data directory with the newest live activity", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
  try {
    const now = Date.now();
    touch(path.join(home, ".codex", "logs_2.sqlite"), now - 86_400_000);
    touch(
      path.join(home, ".codex", "sessions", "2026", "08", "10", "rollout-old.jsonl"),
      now - 86_400_000,
    );
    touch(path.join(home, ".tcodex", "logs_2.sqlite-wal"), now - 5_000);
    touch(
      path.join(home, ".tcodex", "sessions", "2026", "11", "18", "rollout-live.jsonl"),
      now - 5_000,
    );
    assert.equal(selectCodexDataDir(home), path.join(home, ".tcodex"));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("Codex home stays on ~/.codex when that store is the live one", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
  try {
    const now = Date.now();
    touch(path.join(home, ".tcodex", "logs_2.sqlite"), now - 86_400_000);
    touch(path.join(home, ".codex", "logs_2.sqlite-wal"), now - 1_000);
    assert.equal(selectCodexDataDir(home), path.join(home, ".codex"));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
