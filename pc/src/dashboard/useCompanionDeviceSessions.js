/**
 * [Input] The followed Agent id and local Agent Bus session snapshots.
 * [Output] Recent conversations from other local Agents, labeled for the device card queue.
 * [Pos] Device-visible companion sessions. Voice routing stays on the followed Agent.
 * [Sync] If this file changes, update `pc/src/dashboard/.folder.md` and `pc/src/.folder.md`.
 */

import { useEffect, useState } from "react";
import { fetchAgentSessions } from "../lib/agent-bus-client.js";
import { isActiveDeviceSession, isTerminalDeviceSession } from "../lib/session-display.js";

export const COMPANION_DEVICE_AGENTS = Object.freeze([
  "claude-code",
  "codex",
  "openclaw",
  "mimocode",
  "deepseek-harness",
  "workbuddy",
  "hermes",
  "cursor-agent",
]);

const COMPANION_AGENT_LABELS = Object.freeze({
  "claude-code": "Claude",
  codex: "Codex",
  openclaw: "OpenClaw",
  mimocode: "MiMoCode",
  "deepseek-harness": "DeepSeek",
  workbuddy: "WorkBuddy",
  hermes: "Hermes",
  "cursor-agent": "Cursor",
});

export const COMPANION_DEVICE_POLL_MS = 2000;
export const COMPANION_TERMINAL_HOLD_MS = 60_000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function companionAgentLabel(agentId) {
  return COMPANION_AGENT_LABELS[agentId] || normalizeText(agentId) || "Agent";
}

export function companionSessionVisible(session, nowMs = Date.now()) {
  if (isActiveDeviceSession(session)) return true;
  if (!isTerminalDeviceSession(session)) return false;
  const updated = Number(session?.statusUpdatedAt || session?.lastModified || 0);
  return updated > 0 && nowMs - updated <= COMPANION_TERMINAL_HOLD_MS;
}

export function labelCompanionSession(agentId, session) {
  const label = companionAgentLabel(agentId);
  const current = [session?.displayTitle, session?.name, session?.summary]
    .map(normalizeText)
    .find(Boolean) || "";
  const title = current.startsWith(`${label} · `) || current.startsWith(`${label} `)
    ? current
    : `${label} · ${current || "会话"}`;
  return {
    ...session,
    agentId,
    deviceCompanion: true,
    name: title,
    displayTitle: title,
  };
}

export function mergeCompanionDeviceSessions(primarySessions, companionSessions, limit = 8) {
  const seen = new Set();
  const ordered = [];
  const push = (session) => {
    const id = normalizeText(session?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(session);
  };
  const primary = (Array.isArray(primarySessions) ? primarySessions : [])
    .filter((session) => session?.deviceCompanion !== true);
  const companions = Array.isArray(companionSessions) ? companionSessions : [];
  for (const session of primary) {
    if (isActiveDeviceSession(session)) push(session);
  }
  for (const session of companions) {
    if (isActiveDeviceSession(session)) push(session);
  }
  for (const session of primary) {
    if (!isActiveDeviceSession(session)) push(session);
  }
  for (const session of companions) {
    if (!isActiveDeviceSession(session)) push(session);
  }
  return ordered.slice(0, limit);
}

export function useCompanionDeviceSessions({ selectedAgentId, enabled }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      return undefined;
    }
    const agents = COMPANION_DEVICE_AGENTS.filter((agentId) => agentId !== selectedAgentId);
    let cancelled = false;
    const ctl = new AbortController();

    const refresh = async () => {
      const now = Date.now();
      const snapshots = await Promise.all(agents.map(async (agentId) => {
        try {
          const rows = await fetchAgentSessions(agentId, ctl.signal);
          return rows
            .filter((session) => companionSessionVisible(session, now))
            .map((session) => labelCompanionSession(agentId, session));
        } catch {
          return [];
        }
      }));
      if (!cancelled) setSessions(snapshots.flat());
    };

    void refresh();
    const timer = setInterval(() => { void refresh(); }, COMPANION_DEVICE_POLL_MS);
    return () => {
      cancelled = true;
      ctl.abort();
      clearInterval(timer);
    };
  }, [enabled, selectedAgentId]);

  return { sessions };
}
