"use strict";

/*
 * [Input] Codex data directories under the user home, including TCodex's ~/.tcodex.
 * [Output] The data directory whose logs or recent rollouts were written last.
 * [Pos] Shared Codex home selection for the status monitor and Agent Bus.
 * [Sync] If Codex home discovery changes, update `pc/.folder.md`.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const CODEX_DATA_DIR_NAMES = [".codex", ".tcodex"];

function considerMtime(best, target) {
  try {
    const stat = fs.statSync(target);
    return Math.max(best, stat.mtimeMs);
  } catch {
    return best;
  }
}

function newestJsonlMtime(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let best = 0;
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    best = considerMtime(best, path.join(dir, name));
  }
  return best;
}

function codexDataDirActivityMs(dir) {
  let best = 0;
  for (const name of [
    "logs_2.sqlite-wal",
    "logs_2.sqlite",
    "thread_history_1.sqlite-wal",
    "state_5.sqlite-wal",
  ]) {
    best = considerMtime(best, path.join(dir, name));
  }
  const sessions = path.join(dir, "sessions");
  let years;
  try {
    years = fs.readdirSync(sessions);
  } catch {
    return best;
  }
  years.sort();
  for (const year of years.slice(-3)) {
    const yearPath = path.join(sessions, year);
    let yearStat;
    try {
      yearStat = fs.statSync(yearPath);
    } catch {
      continue;
    }
    if (!yearStat.isDirectory()) {
      if (year.endsWith(".jsonl")) best = Math.max(best, yearStat.mtimeMs);
      continue;
    }
    best = Math.max(best, newestJsonlMtime(yearPath));
    let months;
    try {
      months = fs.readdirSync(yearPath);
    } catch {
      continue;
    }
    months.sort();
    for (const month of months.slice(-2)) {
      const monthPath = path.join(yearPath, month);
      let monthStat;
      try {
        monthStat = fs.statSync(monthPath);
      } catch {
        continue;
      }
      if (!monthStat.isDirectory()) continue;
      best = Math.max(best, newestJsonlMtime(monthPath));
      let days;
      try {
        days = fs.readdirSync(monthPath);
      } catch {
        continue;
      }
      days.sort();
      for (const day of days.slice(-2)) {
        best = Math.max(best, newestJsonlMtime(path.join(monthPath, day)));
      }
    }
  }
  return best;
}

function selectCodexDataDir(homeDir = os.homedir()) {
  let selected = path.join(homeDir, CODEX_DATA_DIR_NAMES[0]);
  let best = -1;
  for (const name of CODEX_DATA_DIR_NAMES) {
    const dir = path.join(homeDir, name);
    const activity = codexDataDirActivityMs(dir);
    if (activity > best) {
      selected = dir;
      best = activity;
    }
  }
  return selected;
}

module.exports = {
  CODEX_DATA_DIR_NAMES,
  codexDataDirActivityMs,
  selectCodexDataDir,
};
