/**
 * [Input] Bound device, useDeviceContext for state, Tauri voice/USB events, API-settings navigation, and useToast for notices.
 * [Output] Priority-ordered four-region device dashboard with runtime-aware Linux/P4 control maps,
 *          twelve exposed P4 button/joystick gestures (SW1-SW3 short/long plus
 *          joystick center short/long and four directions), an internal hold transport for PTT,
 *          shared draft-then-confirm voice enablement with ordered background microphone signals,
 *          fully repeatable hardware actions with optional exit plus versioned default migration,
 *          context-local previous/next selection and SW2 top-level page toggling,
 *          bounded Agent prompt bindings, ACK-gated USB config,
 *          exact-board identity on emergency appearance downlinks,
 *          client-authoritative button reconciliation after serialized board reads,
 *          deduplicated managed-bridge recovery/input injection, device-side Session title sync,
 *          Agent-owned Session state that cannot leak across follow changes,
 *          with polling/reduction and device synchronization delegated to focused hooks,
 *          plus pure routing/merge/terminal-TTL policy in the P4 Session service,
 *          always-on current-Agent conversation visibility with active-only admission,
 *          explicit-transition 60-second done/error retention, serialized P4 downlinks,
 *          empty-queue clearing and full active-ID signals,
 *          exact visible-card encoder selection isolated from background routing,
 *          manual and focus-refreshed local Agent discovery with visible scan feedback,
 *          a default-open status-first voice console,
 *          default-enabled first-run voice input that preserves an explicit user opt-out,
 *          model-v9 P4 defaults that map joystick up/down to Previous/Next,
 *          immediate P4 voice rearming after saved ASR configuration changes,
 *          exact-session-only Codex/Claude Desktop task navigation and voice input for selected P4 conversations,
 *          MiMoCode-only macOS final-text delivery plus Return at the captured current caret,
 *          app-shell/native-operation-owned macOS Accessibility consent,
 *          shared first-visit onboarding state with a reopenable page guide,
 *          an ESP32-P4 A/B firmware update entry, bound USB capability diagnostics,
 *          shared current-key instructions,
 *          a persona editor preserved while visiting API settings,
 *          and compact volume/city controls below voice input with retained city drafts.
 * [Pos] component node in pc/src
 * [Sync] If this file changes, update this header and `pc/src/.folder.md`.
 */

import React, { useLayoutEffect, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw } from "lucide-react";
import DeviceGuideModal from "./DeviceGuideModal.jsx";
import {
  ONBOARDING_PAGE_IDS,
  shouldAutoOpenOnboarding,
} from "./lib/onboarding-state.js";
import PageShell from "./shell/PageShell.jsx";
import Card from "./shell/Card.jsx";
import Button from "./shell/Button.jsx";
import { useDeviceContext } from "./shell/DeviceContext.jsx";
import { buildUsageHelp } from "./lib/usage-help.js";
import { requireButtonReadback } from "./lib/button-readback.js";
import { decodeBluetoothShortcut } from "./lib/bluetooth-shortcut.js";
import PersonaVoiceModal from "./PersonaVoiceModal.jsx";
import { useToast } from "./shell/ToastStack.jsx";
import DeviceStatusBar from "./dashboard/DeviceStatusBar.jsx";
import { useExitProtection } from "./lib/exit-protection.js";
import ChannelMatrixCard from "./dashboard/ChannelMatrixCard.jsx";
import KeyboardConfiguration from "./dashboard/KeyboardConfiguration.jsx";
import BoardButtonPanel from "./dashboard/BoardButtonPanel.jsx";
import VoiceAssistantPanel, { buildVoiceSummary, formatVoiceSessionOption } from "./dashboard/VoiceAssistantPanel.jsx";
import {voiceRuntimeTarget,createVoiceRuntimePoller} from "./dashboard/voice-runtime-target.js";
import RealtimeChatPanel, { realtimeStateLabel } from "./dashboard/RealtimeChatPanel.jsx";
import { isRecoveringAsr, realtimeErrorMessage } from "./lib/realtime-feedback.js";
import { pollWhileVisible } from "./lib/visible-poll.js";
import { agentSessionFeedFresh, P4_SESSION_EVENT_POLL_MS, useAgentSessionFeed } from "./dashboard/useAgentSessionFeed.js";
import { mergeCompanionDeviceSessions, useCompanionDeviceSessions } from "./dashboard/useCompanionDeviceSessions.js";
import { useDeviceVoiceRouter } from "./dashboard/useDeviceVoiceRouter.js";
import { subscribeAsrCredentialUpdates } from "./dashboard/voice-credential-events.js";
import { useP4SessionSync } from "./dashboard/useP4SessionSync.js";
import DashboardActionsMenu from "./dashboard/DashboardActionsMenu.jsx";
import FirmwareUpdateModal from "./dashboard/FirmwareUpdateModal.jsx";
import DeviceDiagnosticsModal from "./dashboard/DeviceDiagnosticsModal.jsx";
import { wifiDeviceControl, wifiDeviceControlReady } from "./lib/wifi-device-control.js";
import { sendTestMessage, testMessageTarget } from "./lib/device-test-message.js";
import { useAppearanceDelivery } from "./lib/use-appearance-delivery.js";
import { readActiveAppearanceId } from "./lib/desktop-pet-assignment.js";
import { appearanceTarget } from "./lib/appearance-delivery.js";
import { observeAppearanceFromMenu, appearanceObservationError } from "./lib/appearance-readonly-observation.js";
import { BUILTIN_TERRIER_APPEARANCE_ID } from "./lib/builtin-appearances.js";
import { ensureBridgeRuntime } from "./lib/bridge-runtime.js";
import { fetchAgentBusStatus } from "./lib/agent-bus-client.js";
export {
  buildP4ConversationQueue,
  buildP4DeviceSessionTransportPayload,
  buildP4RoutingSessions,
  filterDismissedP4Sessions,
  mergeP4SessionEvent,
  mergeP4SessionSnapshot,
  p4SessionActivitySignature,
} from "./lib/p4-session-service.js";
export {
  cycleVoiceSessionId,
  formatDeviceSessionContent,
  formatDeviceSessionTitle,
  isDeviceSessionTargetUnique,
  P4_MANUAL_SESSION_TIMEOUT_MS,
} from "./dashboard/useP4SessionSync.js";
import {
  DEVICE_BUTTON_CONFIG_MODEL_VERSION,
  DEVICE_BUTTON_CONFIG_STORAGE_KEY,
  migrateP4V7ShippedBoardDefaults,
} from "./component-center/button-config.js";

// ---------- Voice config storage + constants (re-exported for BoardButtonPanel) ----------

export const VOICE_CONFIG_STORAGE_KEY = DEVICE_BUTTON_CONFIG_STORAGE_KEY;
export const DEFAULT_VOICE_CONFIG = { enabled: true, trigger: "encoder_button.hold" };
export const P4_RUNTIME_ID = "esp-p4";
export const P4_DEFAULT_VOICE_TRIGGER = "sw1.hold";
export const P4_DEFAULT_PROMPT = "继续当前任务并给出下一步。";

export const DEFAULT_BUTTON_ACTIONS = {
  encoder_button_short: "system_page",
  encoder_button: "system_reset",
  encoder_rotate: "volume_adjust",
  p4_sw1_short: "page_enter",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "component_center",
  p4_sw2_long: "realtime_chat",
  p4_sw3_short: "page_back",
  p4_sw3_long: "system_settings",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
  p4_joystick_up: "session_previous",
  p4_joystick_down: "session_next",
};

export const P4_VOICE_BUTTON_OPTIONS = [
  { id: P4_DEFAULT_VOICE_TRIGGER, rowId: "p4_sw1_long", label: "SW1 长按", detail: "按住 SW1 开始录音，松开后只写入草稿。", event: "button.sw1.hold" },
  { id: "sw2.hold", rowId: "p4_sw2_long", label: "SW2 长按", detail: "按住 SW2 开始录音，松开后只写入草稿。", event: "button.sw2.hold" },
  { id: "sw3.hold", rowId: "p4_sw3_long", label: "SW3 长按", detail: "按住 SW3 开始录音，松开后只写入草稿。", event: "button.sw3.hold" },
  { id: "encoder_button.hold", rowId: "p4_encoder_long", label: "摇杆中按长按", detail: "按住摇杆中键开始录音，松开后只写入草稿。", event: "button.encoder.hold" },
];
export const VOICE_BUTTON_OPTIONS = P4_VOICE_BUTTON_OPTIONS;

export const VOICE_KEY_PRESETS = [
  { id: "win-ctrl", label: "Windows · Ctrl + Win（微信输入法）" },
  { id: "win-h", label: "Windows · Win + H（系统语音输入）" },
  { id: "mac-ctrl-alt-d", label: "macOS · Control + Option + D（先在系统听写设置绑定）" },
];

export const BUTTON_FUNCTION_OPTIONS = [
  { id: "agent_prompt", label: "发送自定义指令", detail: "按下对应手势后，将该按钮下方填写的指令直接发送给当前 Code Agent。" },
  { id: "voice_key_forward", label: "触发电脑语音输入", detail: "在宠物首页按键触发电脑听写。用 USB-C 串口时请保持 Pet Manager 在后台，macOS 需授予辅助功能权限。" },
  { id: "voice_ptt", label: "语音输入", detail: "绑定到长按：按住说话，松开追加到输入框，确认后发送。" },
  { id: "realtime_chat", label: "实时对话", detail: "在宠物界面触发后开始聊天，再次触发结束。组件运行时请先返回宠物界面。" },
  { id: "session_previous", label: "上一个", detail: "宠物界面切换到上一个会话气泡；组件中心切换到上一个组件。" },
  { id: "session_next", label: "下一个", detail: "宠物界面切换到下一个会话气泡；组件中心切换到下一个组件。" },
  { id: "session_clear", label: "清空主页会话", detail: "清除设备主页当前显示的全部会话；新会话或新活动会自动重新显示。" },
  { id: "dsh_interrupt", label: "打断 DSH 当前任务", detail: "仅在跟随 DeepSeek Harness 时可用：取消当前正在执行的回合。" },
  { id: "component_center", label: "切换宠物/组件", detail: "切换宠物界面和组件列表；组件运行时请先返回。" },
  { id: "system_settings", label: "打开系统设置", detail: "从宠物首页或组件列表打开设备设置。" },
  { id: "page_enter", label: "确认", detail: "发送语音输入的文字，或打开选中的组件；组件内按其玩法操作。" },
  { id: "page_back", label: "返回（取消）", detail: "取消当前选择，或从当前组件返回上一级。" },
  { id: "disabled", label: "不绑定", detail: "不为这个操作分配功能。" },
  { id: "system_page", label: "系统切页", detail: "保持 main / stats 页面切换，适合旋钮短按。" },
  { id: "system_reset", label: "系统重置", detail: "保留长按重启或重置配网等板端默认能力。" },
  { id: "volume_adjust", label: "音量调节", detail: "旋钮旋转调节系统总音量，屏幕顶部短暂显示音量条。切页可继续用屏幕滑动。" },
];

// Runtime/component compatibility only. These actions remain understood when
// reading an older board snapshot, but are intentionally absent from the P4 UI.
const LEGACY_BUTTON_FUNCTION_OPTIONS = [
  { id: "agent_enter", label: "继续 Agent", detail: "向当前 Agent 会话发送安全的继续指令。" },
  { id: "miniapp_screen_tap", label: "触发当前负一屏点击", detail: "仅在负一屏打开时，触发当前组件已有的屏幕点击动作。" },
  { id: "miniapp_screen_long_press", label: "触发当前负一屏长按", detail: "仅在负一屏打开时，触发当前组件已有的屏幕长按动作。" },
  { id: "miniapp_action", label: "当前组件动作", detail: "由组件中心安装并确认后写入，动作 id 随组件 buttons.json 保存。" },
  { id: "page_toggle", label: "切换屏幕", detail: "在宠物首页与当前负一屏之间切换。" },
  { id: "page_main", label: "切换屏幕", detail: "兼容旧版的首页切换配置。" },
  { id: "page_app", label: "切换屏幕", detail: "兼容旧版的负一屏切换配置。" },
];

export const BOARD_BUTTON_CONTROL_ROWS = [
  { id: "encoder_button_short", label: "前方旋钮短按", event: "button.encoder.short_press", defaultAction: "system_page", actionOptions: ["system_page", "disabled"] },
  { id: "encoder_button", label: "前方旋钮长按", event: "button.encoder.long_press", voiceTriggerId: "encoder_button.hold", defaultAction: "system_reset", actionOptions: ["voice_ptt", "system_reset", "disabled"] },
  { id: "encoder_rotate", label: "前方旋钮旋转", event: "knob.rotate_cw / knob.rotate_ccw", defaultAction: "volume_adjust", actionOptions: ["volume_adjust"] },
];

const P4_CUSTOM_ACTION_OPTIONS = [
  "agent_prompt",
  "realtime_chat",
  "session_previous",
  "session_next",
  "session_clear",
  "dsh_interrupt",
  "component_center",
  "system_settings",
  "page_enter",
  "page_back",
  "disabled",
];
export const P4_BUTTON_CONTROL_ROWS = [
  { id: "p4_sw1_short", controlId: "p4_sw1", label: "SW1 短按", event: "button.sw1.short_press", defaultAction: "page_enter", actionOptions: [...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw1_double", controlId: "p4_sw1", label: "SW1 双击", event: "button.sw1.double_press", defaultAction: "disabled", actionOptions: [...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw1_long", controlId: "p4_sw1", label: "SW1 长按", event: "button.sw1.long_press", holdEvent: "button.sw1.hold", voiceTriggerId: P4_DEFAULT_VOICE_TRIGGER, defaultAction: "voice_ptt", voiceFallbackAction: "disabled", actionOptions: ["voice_ptt", ...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw2_short", controlId: "p4_sw2", label: "SW2 短按", event: "button.sw2.short_press", defaultAction: "component_center", defaultValue: P4_DEFAULT_PROMPT, actionOptions: [...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw2_double", controlId: "p4_sw2", label: "SW2 双击", event: "button.sw2.double_press", defaultAction: "disabled", actionOptions: [...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw2_long", controlId: "p4_sw2", label: "SW2 长按", event: "button.sw2.long_press", holdEvent: "button.sw2.hold", voiceTriggerId: "sw2.hold", defaultAction: "realtime_chat", voiceFallbackAction: "disabled", actionOptions: ["voice_ptt", ...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw3_short", controlId: "p4_sw3", label: "SW3 短按", event: "button.sw3.short_press", defaultAction: "page_back", actionOptions: [...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw3_double", controlId: "p4_sw3", label: "SW3 双击", event: "button.sw3.double_press", defaultAction: "disabled", actionOptions: [...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_sw3_long", controlId: "p4_sw3", label: "SW3 长按", event: "button.sw3.long_press", holdEvent: "button.sw3.hold", voiceTriggerId: "sw3.hold", defaultAction: "system_settings", voiceFallbackAction: "disabled", actionOptions: ["voice_ptt", ...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
  { id: "p4_joystick_up", controlId: "p4_joystick", label: "摇杆向上", event: "joystick.up", defaultAction: "session_previous", actionOptions: P4_CUSTOM_ACTION_OPTIONS, supportsValue: true },
  { id: "p4_joystick_down", controlId: "p4_joystick", label: "摇杆向下", event: "joystick.down", defaultAction: "session_next", actionOptions: P4_CUSTOM_ACTION_OPTIONS, supportsValue: true },
  { id: "p4_encoder_ccw", controlId: "p4_joystick", label: "摇杆向左", event: "knob.rotate_ccw", defaultAction: "session_previous", actionOptions: P4_CUSTOM_ACTION_OPTIONS, supportsValue: true },
  { id: "p4_encoder_cw", controlId: "p4_joystick", label: "摇杆向右", event: "knob.rotate_cw", defaultAction: "session_next", actionOptions: P4_CUSTOM_ACTION_OPTIONS, supportsValue: true },
  { id: "p4_encoder_press", controlId: "p4_joystick", label: "摇杆中按短按", event: "button.encoder.short_press", defaultAction: "page_enter", actionOptions: P4_CUSTOM_ACTION_OPTIONS, supportsValue: true },
  { id: "p4_encoder_long", controlId: "p4_joystick", label: "摇杆中按长按", event: "button.encoder.long_press", holdEvent: "button.encoder.hold", voiceTriggerId: "encoder_button.hold", defaultAction: "disabled", voiceFallbackAction: "disabled", actionOptions: ["voice_ptt", ...P4_CUSTOM_ACTION_OPTIONS, "voice_key_forward"], supportsValue: true },
];

const LEGACY_P4_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "disabled",
  p4_sw2_short: "agent_enter",
  p4_sw3_short: "agent_prompt",
  p4_encoder_press: "disabled",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "page_toggle",
  p4_encoder_ccw: "page_toggle",
};

const P4_V2_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "agent_enter",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "agent_prompt",
  p4_sw2_long: "disabled",
  p4_sw3_short: "disabled",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "page_back",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
};

const P4_V3_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "disabled",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "disabled",
  p4_sw2_long: "disabled",
  p4_sw3_short: "component_center",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "page_back",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
};

const P4_V4_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "disabled",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "component_center",
  p4_sw2_long: "disabled",
  p4_sw3_short: "page_back",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
};

const P4_V5_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "disabled",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "component_center",
  p4_sw2_long: "disabled",
  p4_sw3_short: "page_back",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
  p4_joystick_up: "disabled",
  p4_joystick_down: "disabled",
};

const P4_V6_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "page_enter",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "component_center",
  p4_sw2_long: "disabled",
  p4_sw3_short: "page_back",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
  p4_joystick_up: "disabled",
  p4_joystick_down: "disabled",
};

const P4_V7_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "page_back",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "component_center",
  p4_sw2_long: "disabled",
  p4_sw3_short: "page_enter",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
  p4_joystick_up: "disabled",
  p4_joystick_down: "disabled",
};

const P4_V8_DEFAULT_BUTTON_ACTIONS = {
  p4_sw1_short: "page_enter",
  p4_sw1_long: "voice_ptt",
  p4_sw2_short: "component_center",
  p4_sw2_long: "disabled",
  p4_sw3_short: "page_back",
  p4_sw3_long: "disabled",
  p4_encoder_press: "page_enter",
  p4_encoder_long: "disabled",
  p4_encoder_cw: "session_next",
  p4_encoder_ccw: "session_previous",
  p4_joystick_up: "disabled",
  p4_joystick_down: "disabled",
};

const ALL_BUTTON_CONTROL_ROWS = [...BOARD_BUTTON_CONTROL_ROWS, ...P4_BUTTON_CONTROL_ROWS];

function preferredVoiceRow(rows, buttonActions, trigger) {
  return rows.find((row) => (
    row.voiceTriggerId === trigger && buttonActions[row.id] === "voice_ptt"
  )) || rows.find((row) => row.voiceTriggerId && buttonActions[row.id] === "voice_ptt");
}

export function buttonControlRowsForRuntime(runtime) {
  const runtimeId = String(runtime || "").trim().toLowerCase();
  if (runtimeId === P4_RUNTIME_ID) return P4_BUTTON_CONTROL_ROWS;
  if (["linux", "linux-board", "raspberry-pi", "raspberry", "radxa"].includes(runtimeId)) {
    return BOARD_BUTTON_CONTROL_ROWS;
  }
  return [];
}

export function actionOptionById(actionId) {
  return [...BUTTON_FUNCTION_OPTIONS, ...LEGACY_BUTTON_FUNCTION_OPTIONS]
    .find((option) => option.id === actionId) || BUTTON_FUNCTION_OPTIONS[0];
}

export function clampButtonActionValue(value, maxBytes = 159) {
  let output = "";
  for (const char of String(value || "")) {
    if (new TextEncoder().encode(output + char).length > maxBytes) break;
    output += char;
  }
  return output;
}

export function buildBoardButtonConfigBindings(buttonActions = {}, buttonValues = {}, runtime = "", voiceEnabled = false) {
  const controlRows = buttonControlRowsForRuntime(runtime);
  const normalizedButtonActions = controlRows.reduce((next, row) => {
    next[row.id] = row.actionOptions.includes(buttonActions[row.id])
      ? buttonActions[row.id]
      : row.defaultAction;
    return next;
  }, {});
  const bindings = controlRows.flatMap((row) => {
    const action = row.actionOptions.includes(normalizedButtonActions[row.id])
      ? normalizedButtonActions[row.id]
      : row.defaultAction;
    const binding = { event: row.otaEvent || row.event, action };
    if (action === "voice_key_forward") {
      binding.value = (VOICE_KEY_PRESETS.some(preset => preset.id === buttonValues[row.id])
        || decodeBluetoothShortcut(buttonValues[row.id]))
        ? buttonValues[row.id] : "win-ctrl";
    }
    if (action === "agent_prompt" || action === "miniapp_action") {
      binding.value = clampButtonActionValue(buttonValues[row.id] || row.defaultValue || "");
    }
    if (!row.holdEvent) return [binding];
    if (action === "voice_ptt") {
      return [
        { event: row.event, action: "disabled" },
        { event: row.holdEvent, action: voiceEnabled ? "voice_ptt" : "disabled" },
      ];
    }
    return [binding, { event: row.holdEvent, action: "disabled" }];
  });
  return bindings;
}

function createButtonConfigRequestId() {
  return `button-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeVoiceConfig(value = {}) {
  const triggerIds = new Set(VOICE_BUTTON_OPTIONS.map((o) => o.id));
  const trigger = triggerIds.has(value.trigger) ? value.trigger : DEFAULT_VOICE_CONFIG.trigger;
  const incoming = value.buttonActions && typeof value.buttonActions === "object" ? value.buttonActions : {};
  const incomingValues = value.buttonValues && typeof value.buttonValues === "object" ? value.buttonValues : {};
  const incomingLabels = value.buttonLabels && typeof value.buttonLabels === "object" ? value.buttonLabels : {};
  const storedButtonModelVersion = Number(value.buttonModelVersion || 0);
  const migrateLegacyP4Defaults = storedButtonModelVersion !== DEVICE_BUTTON_CONFIG_MODEL_VERSION
    && Object.keys(incoming).some((key) => key.startsWith("p4_"));
  const previousP4Defaults = storedButtonModelVersion === 8
    ? P4_V8_DEFAULT_BUTTON_ACTIONS
    : storedButtonModelVersion === 7
    ? P4_V7_DEFAULT_BUTTON_ACTIONS
    : storedButtonModelVersion === 6
    ? P4_V6_DEFAULT_BUTTON_ACTIONS
    : storedButtonModelVersion === 5
    ? P4_V5_DEFAULT_BUTTON_ACTIONS
    : storedButtonModelVersion === 4
    ? P4_V4_DEFAULT_BUTTON_ACTIONS
    : storedButtonModelVersion === 3
    ? P4_V3_DEFAULT_BUTTON_ACTIONS
    : storedButtonModelVersion === 2
      ? P4_V2_DEFAULT_BUTTON_ACTIONS
      : LEGACY_P4_DEFAULT_BUTTON_ACTIONS;
  const resolvedButtonActions = ALL_BUTTON_CONTROL_ROWS.reduce((next, row) => {
    const incomingAction = incoming[row.id] ?? (row.legacyId ? incoming[row.legacyId] : undefined);
    const migratedAction = incomingAction === "page_main" || incomingAction === "page_app"
      ? "page_toggle"
      : incomingAction;
    const actionAfterModelMigration = migrateLegacyP4Defaults
      && previousP4Defaults[row.id] === migratedAction
      ? undefined
      : migratedAction;
    next[row.id] = row.actionOptions.includes(actionAfterModelMigration)
      ? actionAfterModelMigration
      : DEFAULT_BUTTON_ACTIONS[row.id] || row.defaultAction;
    return next;
  }, {});
  const buttonActions = resolvedButtonActions;
  const buttonValues = ALL_BUTTON_CONTROL_ROWS.reduce((next, row) => {
    const incomingValue = incomingValues[row.id] ?? (row.legacyId ? incomingValues[row.legacyId] : undefined);
    if (row.supportsValue) next[row.id] = clampButtonActionValue(incomingValue || row.defaultValue || "");
    return next;
  }, {});
  const buttonLabels = ALL_BUTTON_CONTROL_ROWS.reduce((next, row) => {
    const label = incomingLabels[row.id] ?? (row.legacyId ? incomingLabels[row.legacyId] : undefined);
    if (typeof label === "string" && label.trim()) next[row.id] = label.trim().slice(0, 32);
    return next;
  }, {});
  return {
    buttonModelVersion: DEVICE_BUTTON_CONFIG_MODEL_VERSION,
    enabled: typeof value.enabled === "boolean"
      ? value.enabled
      : DEFAULT_VOICE_CONFIG.enabled,
    trigger,
    buttonActions,
    buttonValues,
    buttonLabels,
  };
}

export function mergeBoardButtonConfig(currentConfig = {}, response = {}, runtime = "", migrateDefaults = true) {
  const boardMigration = migrateDefaults ? migrateP4V7ShippedBoardDefaults(response, runtime) : { response };
  const migratedResponse = boardMigration.response;
  const boardConfig = migratedResponse?.config && typeof migratedResponse.config === "object"
    ? migratedResponse.config
    : migratedResponse;
  const bindings = Array.isArray(boardConfig?.bindings) ? boardConfig.bindings : [];
  const bindingsByEvent = new Map(
    bindings
      .filter((binding) => binding && typeof binding === "object")
      .map((binding) => [String(binding.event || "").trim(), binding]),
  );
  const current = normalizeVoiceConfig(currentConfig);
  const buttonActions = { ...current.buttonActions };
  const buttonValues = { ...current.buttonValues };
  const buttonLabels = { ...current.buttonLabels };
  const rows = buttonControlRowsForRuntime(runtime);

  rows.forEach((row) => {
    const primaryBinding = bindingsByEvent.get(row.otaEvent || row.event);
    const holdBinding = row.holdEvent ? bindingsByEvent.get(row.holdEvent) : null;
    const preserveDisabledVoiceMapping = row.voiceTriggerId
      && primaryBinding?.action === "disabled"
      && holdBinding?.action === "disabled"
      && current.buttonActions[row.id] === "voice_ptt";
    const boardBinding = holdBinding?.action === "voice_ptt"
      ? holdBinding
      : preserveDisabledVoiceMapping
        ? { ...primaryBinding, action: "voice_ptt" }
        : primaryBinding;
    const boardAction = String(boardBinding?.action || "").trim();
    const action = row.actionOptions.includes(boardAction) ? boardAction : row.defaultAction;
    const value = clampButtonActionValue(boardBinding?.value || row.defaultValue || "");

    buttonActions[row.id] = action;
    if (row.supportsValue) buttonValues[row.id] = value;
    if (action === "miniapp_action") {
      const cachedValue = String(current.buttonValues[row.id] || "");
      buttonLabels[row.id] = cachedValue === value && current.buttonLabels[row.id]
        ? current.buttonLabels[row.id]
        : value || "当前组件动作";
    } else {
      delete buttonLabels[row.id];
    }
  });

  const runtimeId = String(runtime || "").trim().toLowerCase();
  const p4VoiceBindingEnabled = rows.some((row) => (
    row.voiceTriggerId
    && row.holdEvent
    && bindingsByEvent.get(row.holdEvent)?.action === "voice_ptt"
  ));
  const boardVoiceButton = String(
    boardConfig?.voiceButton || boardConfig?.voice_button || "",
  ).trim();
  const voiceRow = preferredVoiceRow(
    rows,
    buttonActions,
    boardVoiceButton || current.trigger,
  );
  const boardVoiceEnabled = typeof boardConfig?.voiceEnabled === "boolean"
    ? boardConfig.voiceEnabled
    : typeof boardConfig?.voice_enabled === "boolean"
      ? boardConfig.voice_enabled
      : runtimeId === P4_RUNTIME_ID
        ? p4VoiceBindingEnabled
        : Boolean(voiceRow);
  const trigger = runtimeId === P4_RUNTIME_ID
    ? voiceRow?.voiceTriggerId
      || (P4_VOICE_BUTTON_OPTIONS.some((option) => option.id === boardVoiceButton)
        ? boardVoiceButton
        : P4_DEFAULT_VOICE_TRIGGER)
    : VOICE_BUTTON_OPTIONS.some((option) => option.id === boardVoiceButton)
    ? boardVoiceButton
    : voiceRow?.voiceTriggerId || current.trigger;

  const normalized = normalizeVoiceConfig({
    ...current,
    enabled: boardVoiceEnabled,
    trigger,
    buttonActions,
    buttonValues,
    buttonLabels,
  });
  return boardMigration.migrated
    ? { ...normalized, boardDefaultsMigrated: true }
    : normalized;
}

export function resolveButtonConfigForRuntime(value = {}, runtime = "") {
  const config = normalizeVoiceConfig(value);
  const runtimeId = String(runtime || "").trim().toLowerCase();
  if (runtimeId !== P4_RUNTIME_ID) {
    return {
      config,
      voiceButton: config.trigger,
      voiceEnabled: config.enabled,
    };
  }
  const voiceRow = preferredVoiceRow(
    P4_BUTTON_CONTROL_ROWS,
    config.buttonActions,
    config.trigger,
  );
  return {
    config,
    voiceButton: voiceRow?.voiceTriggerId || P4_DEFAULT_VOICE_TRIGGER,
    voiceEnabled: config.enabled && Boolean(voiceRow),
  };
}

function comparableButtonConfig(value = {}, runtime = "") {
  const resolved = resolveButtonConfigForRuntime(value, runtime);
  return {
    bindings: buildBoardButtonConfigBindings(
      resolved.config.buttonActions,
      resolved.config.buttonValues,
      runtime,
      resolved.voiceEnabled,
    ),
    voiceButton: resolved.voiceButton,
    voiceEnabled: resolved.voiceEnabled,
  };
}

export function boardButtonConfigMatchesClient(clientConfig = {}, response = {}, runtime = "", capabilities = null) {
  const boardConfig = mergeBoardButtonConfig(clientConfig, response, runtime, false);
  const client = comparableButtonConfig(clientConfig, runtime);
  const board = comparableButtonConfig(boardConfig, runtime);
  if (capabilities) {
    const deferred = new Set(client.bindings.filter(deferredButtonBindings(capabilities)).map(binding => binding.event));
    client.bindings = client.bindings.filter(binding => !deferred.has(binding.event));
    board.bindings = board.bindings.filter(binding => !deferred.has(binding.event));
  }
  const actual = response?.config?.bindings ?? response?.bindings ?? [];
  if (runtime === P4_RUNTIME_ID) {
    // Compare device evidence before normalization fills in UI defaults. Old
    // firmware may omit unbound gestures; every active mapping needs a receipt.
    if (!Array.isArray(actual)) return false;
    const byEvent = new Map(actual.map(binding => [binding.event, binding]));
    if (byEvent.size !== actual.length || !client.bindings.every(binding => {
      const seen = byEvent.get(binding.event);
      return seen ? seen.action === binding.action && (!("value" in binding) || seen.value === binding.value)
        : binding.action === "disabled";
    })) return false;
  }
  return JSON.stringify(client) === JSON.stringify(board);
}

function buttonDifferenceMessage(config, state, runtime) {
  const observed = mergeBoardButtonConfig(config, state, runtime, false);
  const changed = buttonControlRowsForRuntime(runtime).filter(({id}) =>
    config.buttonActions[id] !== observed.buttonActions[id] || config.buttonValues[id] !== observed.buttonValues[id]);
  const sample = changed.slice(0, 3).map(({label}) => label).join("、");
  const detail = sample ? `（${sample}${changed.length > 3 ? "等" : ""}）` : "";
  return `设备和电脑的按键映射不同${detail}。请选择采用设备配置，或将电脑配置同步到设备。`;
}

export function applyVoiceEnabledForRuntime(value = {}, enabled = false, runtime = "") {
  const next = normalizeVoiceConfig({ ...value, enabled: enabled === true });
  if (String(runtime || "").trim().toLowerCase() === P4_RUNTIME_ID) {
    const voiceRows = P4_BUTTON_CONTROL_ROWS.filter((row) => row.voiceTriggerId);
    const selectedRow = voiceRows.find(
      (row) => row.voiceTriggerId === next.trigger && next.buttonActions[row.id] === "voice_ptt",
    ) || voiceRows.find((row) => row.voiceTriggerId === next.trigger)
      || voiceRows.find((row) => next.buttonActions[row.id] === "voice_ptt")
      || voiceRows[0];
    if (enabled) {
      next.buttonActions[selectedRow.id] = "voice_ptt";
    }
    next.trigger = selectedRow?.voiceTriggerId || P4_DEFAULT_VOICE_TRIGGER;
    return next;
  }
  const voiceRows = buttonControlRowsForRuntime(runtime).filter((row) => row.voiceTriggerId);
  if (voiceRows.length === 0) return next;

  if (enabled) {
    const selectedRow = voiceRows.find(
      (row) => next.buttonActions[row.id] === "voice_ptt",
    ) || voiceRows[0];
    voiceRows.forEach((row) => {
      next.buttonActions[row.id] = row.id === selectedRow.id
        ? "voice_ptt"
        : row.voiceFallbackAction || row.defaultAction || "disabled";
    });
    next.trigger = selectedRow.voiceTriggerId;
    next.enabled = true;
    return next;
  }

  voiceRows.forEach((row) => {
    if (next.buttonActions[row.id] === "voice_ptt") {
      next.buttonActions[row.id] = row.voiceFallbackAction || row.defaultAction || "disabled";
    }
  });
  next.enabled = false;
  return next;
}

export function applyVoiceTriggerForRuntime(value = {}, trigger = "", runtime = "") {
  const next = normalizeVoiceConfig(value);
  const voiceRows = buttonControlRowsForRuntime(runtime).filter((row) => row.voiceTriggerId);
  const selectedRow = voiceRows.find((row) => row.voiceTriggerId === trigger)
    || voiceRows.find((row) => row.voiceTriggerId === next.trigger)
    || voiceRows[0];
  if (!selectedRow) return next;

  next.buttonActions[selectedRow.id] = "voice_ptt";
  next.trigger = selectedRow.voiceTriggerId;
  return next;
}

export function loadVoiceConfigFromStorage() {
  try {
    const raw = localStorage.getItem(VOICE_CONFIG_STORAGE_KEY);
    if (raw) return normalizeVoiceConfig(JSON.parse(raw));
  } catch {}
  return normalizeVoiceConfig({});
}

export function saveVoiceConfigToStorage(next) {
  try {
    localStorage.setItem(VOICE_CONFIG_STORAGE_KEY, JSON.stringify(normalizeVoiceConfig(next)));
    return true;
  } catch { return false; }
}

// Single place that OTAs a button config to the board. Used by both the device
// dashboard's manual "下发" button and the component center's install flow, so
// the invoke shape lives in exactly one spot.
function buttonConfigForDevice(config, supportsVoiceKey, supportsCustomBluetoothKey) {
  const values = Object.values(config.buttonActions);
  if ((supportsVoiceKey || !values.includes("voice_key_forward"))
      && (supportsCustomBluetoothKey || !Object.values(config.buttonValues).some(decodeBluetoothShortcut))) return config;
  const buttonActions = { ...config.buttonActions };
  for (const row of P4_BUTTON_CONTROL_ROWS) {
    if (buttonActions[row.id] === "voice_key_forward"
        && (!supportsVoiceKey || (!supportsCustomBluetoothKey && decodeBluetoothShortcut(config.buttonValues[row.id])))) {
      buttonActions[row.id] = "disabled";
    }
  }
  return { ...config, buttonActions };
}

function deferredButtonBindings(capabilities = {}) {
  return ({ event, action }) =>
    (action === "system_settings" && capabilities.systemSettings !== true) ||
    (event.endsWith(".double_press") && capabilities.inputDoublePress !== true);
}

const SETTINGS_NOT_READY = "设备暂未开放系统设置，所选按键动作已保留在电脑上。";

export async function dispatchBoardButtonConfig({ boardDeviceId, buttonActions, buttonValues, runtime, voiceButton, voiceEnabled, capabilities, expectedConnectionId, wifi }) {
  const bindings = buildBoardButtonConfigBindings(buttonActions, buttonValues, runtime, voiceEnabled)
    .filter(binding => !deferredButtonBindings(capabilities)(binding)
      && !(binding.event.endsWith(".double_press") && binding.action === "disabled"));
  if (wifi) return wifiDeviceControl(invoke, wifi, "writeInput", { bindings });
  const requestId = createButtonConfigRequestId();
  return invoke("button_config_signal", {
    boardDeviceId,
    requestId,
    expectedConnectionId,
    bindings,
    voiceButton,
    voiceEnabled,
  });
}

// ---------- Voice-bus helpers ----------

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function postMockButtonInject(payload) {
  await ensureBridgeRuntime().catch(() => {});

  const result = await invoke("local_bridge_request", { route: "/mock-button-inject", body: payload });
  if (result?.ok === false) throw new Error("Agent request failed; not resent");
  return result;
}

// ---------- Voice reducer (lean — only what VoiceAssistantPanel needs) ----------
const VOICE_INITIAL_STATE = {
  busStatus: null,
  busStatusFingerprint: "",
  voiceRuntime: null,
  voiceRuntimeFingerprint: "",
  audioBridgeEnabled: false,
  audioBridgePending: false,
  audioBridgeMessage: "",
  audioBridgeLastResult: null,
  audioBridgeDeferred: false,
  audioBridgeActivity: "idle",
  mockInjectInput: "",
  mockInjectPending: false,
  mockInjectMessage: "",
  mockInjectReply: "",
  mockInjectOk: null,
};

function voiceReducer(state, action) {
  switch (action.type) {
    case "set_bus_status": {
      const fingerprint = JSON.stringify(action.value ?? null);
      if (fingerprint === state.busStatusFingerprint) return state;
      return { ...state, busStatus: action.value, busStatusFingerprint: fingerprint };
    }
    case "set_voice_runtime": {
      const fingerprint = JSON.stringify(action.value ?? null);
      if (fingerprint === state.voiceRuntimeFingerprint) return state;
      return { ...state, voiceRuntime: action.value, voiceRuntimeFingerprint: fingerprint };
    }
    case "set_mock_inject_input": return { ...state, mockInjectInput: action.value || "" };
    case "set_mock_inject_pending":
      return {
        ...state,
        mockInjectPending: Boolean(action.value),
        ...(action.value ? { mockInjectMessage: "", mockInjectReply: "", mockInjectOk: null } : {}),
      };
    case "set_mock_inject_result":
      return {
        ...state,
        mockInjectPending: false,
        mockInjectOk: action.ok,
        mockInjectMessage: action.message || "",
        mockInjectReply: action.reply || "",
      };
    case "set_audio_bridge_pending": return { ...state, audioBridgePending: action.value };
    case "set_audio_bridge_state":
      return {
        ...state,
        audioBridgeEnabled: action.enabled,
        audioBridgePending: false,
        audioBridgeLastResult: action.deferred ? null : action.ok ? "ok" : "error",
        audioBridgeDeferred: action.deferred === true,
        audioBridgeMessage: action.message || "",
      };
    case "set_audio_bridge_activity":
      return {
        ...state,
        audioBridgeActivity: action.phase || "idle",
        audioBridgeLastResult: action.ok === false
          ? "error"
          : action.phase === "end"
            ? "ok"
            : null,
        audioBridgeMessage: action.message || "",
      };
    default: return state;
  }
}

// ---------- Component ----------

export default function DeviceDashboard({ active = true, keyboardActive = false, binding, onUnbind, onOpenApiSettings, onOpenGallery, onOpenDeviceSettings }) {
  const [editingPersona, setEditingPersona] = useState(null);
  // Native signaling now runs off the UI thread. Keep start/stop ordering
  // across auto-rearm, button configuration and manual toggles.
  const audioSignalQueueRef = useRef(Promise.resolve());
  const sendAudioBridgeSignal = useCallback(({ wifiTarget, ...input }) => {
    const pending = audioSignalQueueRef.current
      .catch(() => {})
      .then(() => wifiTarget
        ? wifiDeviceControl(invoke, wifiTarget, input.action === "start" ? "enableMicrophone" : "disableMicrophone")
        : invoke("audio_bridge_signal", input));
    audioSignalQueueRef.current = pending.catch(() => {});
    return pending;
  }, []);
  const {
    usb,
    wifi,
    pairedStatus,
    onlineBoardDeviceId,
    currentDisplay,
    agentScan,
    refreshAgents,
    realtimeChat,
    appearanceSync,
    setUsageHelp,
  } = useDeviceContext();
  const selectedAgentId = currentDisplay.agentId;
  const { push } = useToast();
  useEffect(() => {
    let active = true;
    const subscription = listen("usb-voice-shortcut-result", ({ payload }) => {
      if (!active || payload?.ok !== false || payload.boardDeviceId !== usb.boardDeviceId) return;
      push({ tone: "error", title: "语音快捷键发送失败", message: payload.message });
    }).catch(() => undefined);
    return () => {
      active = false;
      subscription.then(unlisten => unlisten?.());
    };
  }, [push, usb.boardDeviceId]);

  const [voiceState, voiceDispatch] = useReducer(voiceReducer, VOICE_INITIAL_STATE);
  const onDeviceVoiceAudioActivity = useCallback((activity) => {
    voiceDispatch({ type: "set_audio_bridge_activity", ...activity });
  }, []);
  const { deviceVoiceFlow } = useDeviceVoiceRouter({
    onAudioActivity: onDeviceVoiceAudioActivity,
  });
  const [voiceConfig, setVoiceConfig] = useState(loadVoiceConfigFromStorage);
  const voiceConfigRef = useRef(voiceConfig);
  // 实时对话键是否已绑到某个按键（提示文案用；真正的按键事件由 Rust 处理）
  const realtimeChatKeyBound = Object.values(voiceConfig?.buttonActions || {}).includes("realtime_chat");
  voiceConfigRef.current = voiceConfig;
  const [voiceConfigDirty, setVoiceConfigDirty] = useState(false);
  const usageHelp = useMemo(() => buildUsageHelp(buttonControlRowsForRuntime(usb.runtime), voiceConfig.buttonActions, voiceConfig.enabled, voiceConfigDirty), [usb.runtime, voiceConfig, voiceConfigDirty]);
  useEffect(() => { setUsageHelp(usageHelp); }, [usageHelp, setUsageHelp]);
  const [voiceConfigOtaState, setVoiceConfigOtaState] = useState({ pending: false, tone: "", message: "" });
  const [buttonConfigHydratedFor, setButtonConfigHydratedFor] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [firmwareModalOpen, setFirmwareModalOpen] = useState(false);
  useEffect(() => { if (!active) setFirmwareModalOpen(false); }, [active]);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [firmwareWifiBootId, setFirmwareWifiBootId] = useState("");
  const [firmwareTargetBoardDeviceId, setFirmwareTargetBoardDeviceId] = useState("");
  const [diagnosticsTargetBoardDeviceId, setDiagnosticsTargetBoardDeviceId] = useState("");
  const [diagnosticsWifiTarget, setDiagnosticsWifiTarget] = useState(null);
  const [dismissedP4Sessions, setDismissedP4Sessions] = useState({});
  const buttonConfigRevisionRef = useRef(0);
  const buttonConfigQueryTokenRef = useRef(0);
  const isP4Runtime = String(usb.runtime || "").toLowerCase() === P4_RUNTIME_ID;
  const hasKnownRuntime = buttonControlRowsForRuntime(usb.runtime).length > 0;
  const buttonPanelRuntime = !usb.connected && wifi ? P4_RUNTIME_ID : usb.runtime;
  const buttonPanelCapabilities = usb.connected ? usb.capabilities : wifi;
  const buttonPanelOnWifi = !usb.connected && Boolean(wifi);
  const wifiControlReady = buttonPanelOnWifi && wifiDeviceControlReady(wifi);
  // A panel status poll can change clocks or counters without changing the input configuration.
  const wifiInputTarget = useMemo(() => wifiControlReady ? ({
    boardDeviceId: wifi.boardDeviceId, bootId: wifi.bootId, panelControl: true, controlTrusted: true,
    inputDoublePress: wifi.inputDoublePress, systemSettings: wifi.systemSettings,
  }) : null, [wifiControlReady, wifi?.boardDeviceId, wifi?.bootId, wifi?.inputDoublePress, wifi?.systemSettings]);
  const wifiInputScope = wifiControlReady ? `${wifi.boardDeviceId}:${wifi.bootId}` : "";
  const wifiInputScopeRef = useRef(wifiInputScope);
  wifiInputScopeRef.current = wifiInputScope;
  const voiceTarget = voiceRuntimeTarget(usb, selectedAgentId, wifi);
  const voiceOnWifi = voiceTarget.kind === "wifi";
  const monitorVoiceRuntime = active || voiceTarget.kind === "legacy";
  const p4VoiceRuntime = isP4Runtime || voiceOnWifi;
  const voiceTargetKeyRef = useRef(voiceTarget.key);
  // Update during render: an old Promise may settle before effect cleanup.
  voiceTargetKeyRef.current = voiceTarget.key;
  const p4VoiceRow = p4VoiceRuntime
    ? preferredVoiceRow(P4_BUTTON_CONTROL_ROWS, voiceConfig.buttonActions, voiceConfig.trigger)
    : null;
  const runtimeVoiceEnabled = p4VoiceRuntime
    ? voiceConfig.enabled && Boolean(p4VoiceRow)
    : voiceConfig.enabled;
  const activeVoiceTriggerId = p4VoiceRuntime
    ? p4VoiceRow?.voiceTriggerId || P4_DEFAULT_VOICE_TRIGGER
    : voiceConfig.trigger;
  const runtimeVoiceConfig = useMemo(
    () => p4VoiceRuntime
      ? { ...voiceConfig, enabled: runtimeVoiceEnabled, trigger: activeVoiceTriggerId }
      : voiceConfig,
    [activeVoiceTriggerId, p4VoiceRuntime, runtimeVoiceEnabled, voiceConfig],
  );
  const runtimeVoiceTriggerOptions = p4VoiceRuntime
    ? P4_VOICE_BUTTON_OPTIONS
    : VOICE_BUTTON_OPTIONS.filter((option) => option.id === "encoder_button.hold");
  const selectedVoiceTrigger = runtimeVoiceTriggerOptions.find((option) => option.id === activeVoiceTriggerId)
    || runtimeVoiceTriggerOptions[0];
  const buttonConfigTargetBoardDeviceId = usb.connected ? usb.boardDeviceId : "";
  const agentScanSummary = agentScan?.error
    ? "扫描失败，请重试"
    : agentScan?.pending
      ? "正在读取本机 CLI"
      : agentScan?.scannedAt
        ? `已检测到 ${agentScan.detectedCount} 个 Agent，设备端仅显示当前跟随的 Agent 状态，对话结束后设备气泡保留显示 60 秒`
        : "读取本机已安装的 CLI Agent";

  const handleRefreshAgents = useCallback(async () => {
    try {
      const agents = await refreshAgents();
      const detectedCount = agents.filter((agent) => agent.detected).length;
      push({
        tone: "success",
        title: "Agent 扫描完成",
        message: `检测到 ${detectedCount} 个本机 Agent。`,
        ttl: 3200,
      });
    } catch (error) {
      push({
        tone: "error",
        title: "Agent 扫描失败",
        message: error?.message || String(error),
      });
    }
  }, [push, refreshAgents]);

  // When another surface (e.g. the component center installing a widget) writes
  // a new button config to the shared store and fires a "storage" event, reload
  // it so this panel reflects the applied preset instead of going stale.
  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key || event.key === VOICE_CONFIG_STORAGE_KEY) {
        buttonConfigRevisionRef.current += 1;
        setVoiceConfig(loadVoiceConfigFromStorage());
        setVoiceConfigDirty(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const refreshButtonConfigFromBoard = useCallback(async () => {
    if (!usb.connected || !hasKnownRuntime || !buttonConfigTargetBoardDeviceId) return null;
    const queryToken = ++buttonConfigQueryTokenRef.current;
    const startingRevision = buttonConfigRevisionRef.current;
    const startingScope = voiceTarget.key;
    const queryIsCurrent = () => queryToken === buttonConfigQueryTokenRef.current
      && startingRevision === buttonConfigRevisionRef.current
      && startingScope === voiceTargetKeyRef.current;
    setVoiceConfigOtaState({
      pending: true,
      tone: "",
      message: "正在校验设备与客户端按钮配置...",
    });
    const clientConfig = buttonConfigForDevice(normalizeVoiceConfig(voiceConfigRef.current),
      usb.capabilities?.nativeUsbHid === "p4-hid-keyboard-v1",
      usb.capabilities?.bluetoothShortcutKeys === "hid-usage-v1");
    const settingsPending = usb.capabilities?.systemSettings !== true
      && isP4Runtime && Object.values(clientConfig.buttonActions).includes("system_settings");
    try {
      const boardConfig = await invoke("usb_get_button_config", {
        expectedBoardDeviceId: buttonConfigTargetBoardDeviceId,
      });
      if (!queryIsCurrent()) return null;
      if (isP4Runtime) requireButtonReadback(boardConfig, buttonConfigTargetBoardDeviceId);
      if (boardButtonConfigMatchesClient(clientConfig, boardConfig, usb.runtime, usb.capabilities || {})) {
        setVoiceConfigDirty(false);
        setVoiceConfigOtaState({
          pending: false,
          tone: settingsPending ? "warning" : "success",
          message: settingsPending ? SETTINGS_NOT_READY : "设备按钮配置与客户端一致。",
        });
        setButtonConfigHydratedFor(buttonConfigTargetBoardDeviceId);
        return boardConfig;
      }

      setButtonConfigHydratedFor("");
      setVoiceConfigDirty(true);
      setVoiceConfigOtaState({
        pending: false, tone: "warning", message: buttonDifferenceMessage(clientConfig, boardConfig, usb.runtime),
      });
      return boardConfig;
    } catch (error) {
      if (!queryIsCurrent()) return null;
      setVoiceConfigDirty(true);
      setVoiceConfigOtaState({
        pending: false,
        tone: "warning",
        message: "暂未读到设备按键配置，已停止自动写入。请确认设备就绪后手动同步。",
      });
      return null;
    }
  }, [
    buttonConfigTargetBoardDeviceId,
    hasKnownRuntime,
    isP4Runtime,
    usb.capabilities?.inputDoublePress,
    usb.capabilities?.bluetoothShortcutKeys,
    usb.capabilities?.systemSettings,
    usb.capabilities?.nativeUsbHid,
    usb.connected,
    usb.runtime,
    voiceTarget.key,
    usb.connectionId,
    usb.bootId,
  ]);

  useEffect(() => {
    if (!usb.connected || !hasKnownRuntime || !buttonConfigTargetBoardDeviceId) {
      buttonConfigQueryTokenRef.current += 1;
      setButtonConfigHydratedFor("");
      return undefined;
    }
    setButtonConfigHydratedFor("");
    refreshButtonConfigFromBoard();
    return () => {
      buttonConfigQueryTokenRef.current += 1;
    };
  }, [
    buttonConfigTargetBoardDeviceId,
    hasKnownRuntime,
    refreshButtonConfigFromBoard,
    usb.connected,
  ]);

  // Auto-open the device-guide modal the first time the user lands here.
  useEffect(() => {
    if (!active || !binding || !hasKnownRuntime) return;
    if (shouldAutoOpenOnboarding(ONBOARDING_PAGE_IDS.DEVICE)) setGuideOpen(true);
  }, [active, binding, hasKnownRuntime]);

  const p4TargetBoardDeviceId = isP4Runtime
    ? (usb.boardDeviceId || onlineBoardDeviceId || binding?.boardDeviceId || "")
    : "";

  const mergeDismissedP4Sessions = useCallback((dismissed) => {
    setDismissedP4Sessions((current) => ({ ...current, ...dismissed }));
  }, []);
  const sessionFeed = useAgentSessionFeed({
    agentId: selectedAgentId,
    displayEnabled: true,
    dismissedSessions: dismissedP4Sessions,
  });
  const companionSessions = useCompanionDeviceSessions({
    selectedAgentId,
    enabled: isP4Runtime,
  });
  const deviceVisibleSessions = useMemo(
    () => mergeCompanionDeviceSessions(sessionFeed.sessions, companionSessions.sessions),
    [companionSessions.sessions, sessionFeed.sessions],
  );
  const p4SessionSync = useP4SessionSync({
    enabled: isP4Runtime,
    boardDeviceId: p4TargetBoardDeviceId,
    agentId: selectedAgentId,
    usbConnected: usb.connected,
    usbConnectionId: usb.connectionId,
    usbBootId: usb.bootId || usb.capabilities?.debugBootId || "",
    displayEnabled: true,
    sessions: deviceVisibleSessions,
    routingSessions: sessionFeed.routingSessions,
    sessionsLoaded: sessionFeed.loaded,
    dismissedSessions: dismissedP4Sessions,
    onDismissSessions: mergeDismissedP4Sessions,
    formatSessionOption: formatVoiceSessionOption,
    push,
  });
  const selectedAgentBusSessions = sessionFeed.sessions;
  const selectedAgentRoutingSessions = sessionFeed.routingSessions;
  const selectedAgentSessionsLoaded = sessionFeed.loaded;

  // Poll voice-bus status.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const ctl = new AbortController();
    const run = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        let body;
        try {
          body = await fetchAgentBusStatus(ctl.signal);
        } catch {
          if (cancelled || ctl.signal.aborted) return;
          const runtime = await ensureBridgeRuntime();
          if (!runtime?.running) {
            throw new Error(runtime?.message || "本地 Bridge 未启动");
          }
          body = await fetchAgentBusStatus(ctl.signal);
        }
        if (!cancelled) voiceDispatch({ type: "set_bus_status", value: body });
      } catch {
        if (!cancelled) {
          voiceDispatch({ type: "set_bus_status", value: { ok: false, agents: [] } });
        }
      } finally {
        inFlight = false;
      }
    };
    // A live session feed already proves Bridge reachability. If the feed stalls
    // or no Agent is followed, keep the recovery path available in the tray.
    const check = () => {
      if ((!active || document.hidden) && agentSessionFeedFresh(selectedAgentId, 2 * P4_SESSION_EVENT_POLL_MS)) return;
      void run();
    };
    const resume = () => { if (active && !document.hidden) void run(); };
    check();
    const id = setInterval(check, 5000);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelled = true;
      ctl.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [active, selectedAgentId]);

  // Poll only after reading the connected device's identity and capability.
  useEffect(() => {
    voiceDispatch({type:"set_voice_runtime",value:{mode:"waiting_device",running:false,
      message:"正在等待设备握手确认",agentId:"",targetKey:voiceTarget.key}});
    voiceDispatch({type:"set_audio_bridge_pending",value:false});
  }, [voiceTarget.key]);

  useEffect(() => {
    const poller=createVoiceRuntimePoller({target:voiceTarget,invoke,
      isCurrent:()=>voiceTargetKeyRef.current===voiceTarget.key,
      publish:value=>voiceDispatch({type:"set_voice_runtime",value})});
    // Legacy ensure_voice_runtime owns a service lifecycle. P4 and Wi-Fi read
    // configuration for the displayed panel; microphone rearm is independent.
    if (voiceTarget.kind === "legacy") {
      void poller.poll();
      const timer = setInterval(poller.poll, 5000);
      return () => { clearInterval(timer); poller.cancel(); };
    }
    if (!monitorVoiceRuntime || voiceTarget.kind === "waiting") return () => poller.cancel();
    if (!document.hidden) void poller.poll();
    const stop = pollWhileVisible(poller.poll, 5000);
    return () => { stop(); poller.cancel(); };
  }, [monitorVoiceRuntime, voiceTarget.key]);

  // ---------- Button config update + OTA dispatch ----------
  const updateVoiceConfig = useCallback((patch) => {
    buttonConfigRevisionRef.current += 1;
    setVoiceConfig((prev) => {
      let next = normalizeVoiceConfig({ ...prev, ...patch });
      if (buttonPanelRuntime === P4_RUNTIME_ID) {
        const nextVoiceRow = preferredVoiceRow(
          P4_BUTTON_CONTROL_ROWS,
          next.buttonActions,
          next.trigger,
        );
        next = {
          ...next,
          enabled: next.enabled && Boolean(nextVoiceRow),
          trigger: nextVoiceRow?.voiceTriggerId || P4_DEFAULT_VOICE_TRIGGER,
        };
      }
      saveVoiceConfigToStorage(next);
      setVoiceConfigDirty(true);
      setVoiceConfigOtaState({ pending: false, tone: "warning", message: buttonPanelOnWifi && !wifiControlReady
        ? "修改已保存在电脑上。普通按键配置需要通过 USB 同步。"
        : "修改已保存在电脑上，点击「同步到设备」后生效。" });
      return next;
    });
  }, [buttonPanelOnWifi, buttonPanelRuntime, wifiControlReady]);

  useEffect(() => {
    if (!keyboardActive || !wifiInputScope) return;
    let retired = false;
    const revision = buttonConfigRevisionRef.current;
    const scope = wifiInputScope;
    const current = () => !retired && scope === wifiInputScopeRef.current && revision === buttonConfigRevisionRef.current;
    setVoiceConfigOtaState({ pending: true, message: "正在读取设备按键配置…" });
    wifiDeviceControl(invoke, wifiInputTarget, "readInput").then(readback => {
      if (!current()) return;
      requireButtonReadback(readback, wifiInputTarget.boardDeviceId);
      const matches = boardButtonConfigMatchesClient(voiceConfigRef.current, readback, P4_RUNTIME_ID, wifiInputTarget);
      setVoiceConfigDirty(!matches);
      setVoiceConfigOtaState({ pending: false, tone: matches ? "success" : "warning",
        message: matches ? "设备按钮配置与客户端一致。" : buttonDifferenceMessage(voiceConfigRef.current, readback, P4_RUNTIME_ID) });
    }).catch(error => {
      if (current()) setVoiceConfigOtaState({ pending: false, tone: "warning", message: `无法读取设备按键配置：${error}` });
    });
    return () => { retired = true; };
  }, [keyboardActive, wifiInputTarget, wifiInputScope]);

  const adoptDeviceButtons = async () => {
    const wireless = !usb.connected;
    const board = wireless ? wifiInputTarget?.boardDeviceId : usb.boardDeviceId;
    if (!board) return;
    const revision = ++buttonConfigRevisionRef.current;
    const scope = wireless ? wifiInputScope : voiceTarget.key;
    const current = () => revision === buttonConfigRevisionRef.current && scope ===
      (wireless ? wifiInputScopeRef.current : voiceTargetKeyRef.current);
    setVoiceConfigOtaState({ pending: true, message: "正在读取目标设备按键…" });
    try {
      const state = wireless ? await wifiDeviceControl(invoke, wifiInputTarget, "readInput")
        : await invoke("usb_get_button_config", { expectedBoardDeviceId: board });
      if (!current()) return;
      if (wireless || isP4Runtime) requireButtonReadback(state, board);
      const runtime = wireless ? P4_RUNTIME_ID : usb.runtime;
      const next = mergeBoardButtonConfig(voiceConfigRef.current, state, runtime, false);
      if (!boardButtonConfigMatchesClient(next, state, runtime, wireless ? wifiInputTarget : usb.capabilities)) {
        throw new Error("部分设备映射无法完整载入，请核对固件版本。");
      }
      if (!saveVoiceConfigToStorage(next)) throw new Error("电脑上的按键配置未能保存。");
      setVoiceConfig(next);
      setVoiceConfigDirty(false);
      if (!wireless) setButtonConfigHydratedFor(board);
      setVoiceConfigOtaState({ pending: false, tone: "success", message: "已在电脑上采用当前设备的按键配置。" });
    } catch (error) {
      if (current()) setVoiceConfigOtaState({ pending: false, tone: "error", message: `读取设备按键失败：${error}` });
    }
  };

  const applyButtonConfigOverWifi = useCallback(async (configOverride = null) => {
    if (!wifiInputScope) return;
    const revision = ++buttonConfigRevisionRef.current;
    const current = () => wifiInputScope === wifiInputScopeRef.current && revision === buttonConfigRevisionRef.current;
    const requested = resolveButtonConfigForRuntime(
      configOverride?.buttonActions ? configOverride : voiceConfigRef.current, P4_RUNTIME_ID,
    );
    setVoiceConfigOtaState({ pending: true, message: "正在同步并核对设备按钮配置…" });
    try {
      const readback = await dispatchBoardButtonConfig({
        wifi, runtime: P4_RUNTIME_ID, capabilities: wifi,
        buttonActions: requested.config.buttonActions, buttonValues: requested.config.buttonValues,
        voiceButton: requested.voiceButton, voiceEnabled: requested.voiceEnabled,
      });
      if (!current()) return;
      requireButtonReadback(readback, wifi.boardDeviceId);
      if (!boardButtonConfigMatchesClient(requested.config, readback, P4_RUNTIME_ID, wifi)) {
        throw new Error("设备回读的按键配置与本次下发不一致");
      }
      setVoiceConfigDirty(false);
      setVoiceConfigOtaState({ pending: false, tone: "success", message: "已通过 Wi-Fi 同步并核对设备按钮配置。" });
    } catch (error) {
      if (current()) setVoiceConfigOtaState({ pending: false, tone: "error", message: `按钮配置结果未确认：${error}` });
    }
  }, [wifi, wifiInputScope]);

  const applyVoiceConfigOverUsb = useCallback(async (configOverride = null) => {
    const requestedRevision = buttonConfigRevisionRef.current;
    const requestedScope = voiceTarget.key;
    const isCurrent = () => requestedRevision === buttonConfigRevisionRef.current
      && requestedScope === voiceTargetKeyRef.current;
    const requestedConfigInput = configOverride?.buttonActions
      ? normalizeVoiceConfig(configOverride)
      : voiceConfig;
    const requestedConfig = normalizeVoiceConfig(requestedConfigInput);
    const requested = resolveButtonConfigForRuntime(buttonConfigForDevice(requestedConfig,
      usb.capabilities?.nativeUsbHid === "p4-hid-keyboard-v1",
      usb.capabilities?.bluetoothShortcutKeys === "hid-usage-v1"), usb.runtime);
    const requestedRuntimeVoiceEnabled = requested.voiceEnabled;
    const requestedVoiceTriggerId = requested.voiceButton;
    if (!usb.connected) {
      setVoiceConfigOtaState({ pending: false, tone: "warning", message: "请先通过 USB 连接设备，再同步按键配置。" });
      return;
    }
    const targetBoardDeviceId = usb.boardDeviceId;
    if (!targetBoardDeviceId) {
      setVoiceConfigOtaState({ pending: false, tone: "error", message: "未找到可用的板子 ID，请先完成设备绑定。" });
      return;
    }
    setVoiceConfigOtaState({ pending: true, tone: "", message: "正在同步按键配置，请保持设备连接…" });
    try {
      const ack = await dispatchBoardButtonConfig({
        boardDeviceId: targetBoardDeviceId,
        capabilities: usb.capabilities,
        expectedConnectionId: isP4Runtime ? usb.connectionId : undefined,
        buttonActions: requested.config.buttonActions,
        buttonValues: requested.config.buttonValues,
        runtime: usb.runtime,
        voiceButton: requestedVoiceTriggerId,
        voiceEnabled: requestedRuntimeVoiceEnabled,
      });
      if (!isCurrent()) return;
      const readback = await invoke("usb_get_button_config", {
        expectedBoardDeviceId: targetBoardDeviceId,
      });
      if (!isCurrent()) return;
      if (isP4Runtime) requireButtonReadback(readback, targetBoardDeviceId);
      if (!boardButtonConfigMatchesClient(requested.config, readback, usb.runtime, usb.capabilities || {})) {
        throw new Error("设备回读的按键配置与本次下发不一致");
      }
      const settingsPending = isP4Runtime && usb.capabilities?.systemSettings !== true
        && Object.values(requested.config.buttonActions).includes("system_settings");
      let voiceSetupWarning = "";
      try {
        if (isP4Runtime && requestedRuntimeVoiceEnabled) {
          setVoiceConfigOtaState({ pending: true, tone: "", message: "按钮配置已写入，正在准备设备麦克风识别通道..." });
          const bridgeRuntime = await ensureBridgeRuntime();
          if (!bridgeRuntime?.running) {
            throw new Error(bridgeRuntime?.message || "本地 Bridge 未启动");
          }
          if (!isCurrent()) return;
          const voiceRuntime = await invoke("ensure_device_voice_runtime");
          if (!isCurrent()) return;
          if (!voiceRuntime?.running) {
            throw new Error(voiceRuntime?.message || "设备录音识别通道未就绪");
          }
          const audio = await sendAudioBridgeSignal({
            boardDeviceId: targetBoardDeviceId,
            expectedConnectionId: usb.connectionId,
            action: "start",
            voiceButton: requestedVoiceTriggerId,
          });
          if (!isCurrent()) return;
          if (!audio?.usbSent) throw new Error(audio?.usbError || "设备麦克风信令未通过 USB 送达");
          voiceDispatch({ type: "set_audio_bridge_state", enabled: true, ok: true, message: "设备麦克风已通过 USB 接入" });
        } else if (voiceState.audioBridgeEnabled) {
          await sendAudioBridgeSignal({
            boardDeviceId: targetBoardDeviceId,
            expectedConnectionId: usb.connectionId,
            action: "stop",
            voiceButton: requestedVoiceTriggerId,
          });
          if (!isCurrent()) return;
          voiceDispatch({ type: "set_audio_bridge_state", enabled: false, ok: true, message: "设备麦克风监听已停止" });
        }
      } catch (voiceError) {
        if (!isCurrent()) return;
        voiceSetupWarning = String(voiceError);
        voiceDispatch({
          type: "set_audio_bridge_state",
          enabled: requestedRuntimeVoiceEnabled ? false : voiceState.audioBridgeEnabled,
          ok: false,
          message: `设备麦克风通道未就绪: ${voiceSetupWarning}`,
        });
      }
      if (!isCurrent()) return;
      saveVoiceConfigToStorage(requestedConfig);
      setVoiceConfig(requestedConfig);
      setButtonConfigHydratedFor(targetBoardDeviceId);
      const bindingCount = Number(ack?.bindingCount ?? ack?.ack?.bindingCount ?? 0);
      setVoiceConfigDirty(false);
      setVoiceConfigOtaState({
        pending: false,
        tone: voiceSetupWarning || settingsPending ? "warning" : "success",
        message: voiceSetupWarning
          ? `按钮配置已写入板端（${Number.isFinite(bindingCount) ? bindingCount : 0} 项）；语音通道未就绪：${voiceSetupWarning}`
          : settingsPending ? SETTINGS_NOT_READY : "已同步并核对设备按钮配置。",
      });
    } catch (err) {
      if (!isCurrent()) return;
      setVoiceConfigOtaState({ pending: false, tone: "error", message: `按钮配置下发失败: ${err}` });
    }
  }, [voiceTarget.key, binding.boardDeviceId, isP4Runtime, onlineBoardDeviceId, sendAudioBridgeSignal, usb.boardDeviceId, usb.capabilities, usb.connected, usb.connectionId, usb.runtime, voiceConfig, voiceState.audioBridgeEnabled]);

  const updateVoiceTrigger = useCallback(async (trigger) => {
    buttonConfigRevisionRef.current += 1;
    const next = applyVoiceTriggerForRuntime(voiceConfig, trigger, buttonPanelRuntime);
    saveVoiceConfigToStorage(next);
    setVoiceConfig(next);
    setVoiceConfigDirty(true);
    setVoiceConfigOtaState({
      pending: false,
      tone: voiceOnWifi || usb.connected ? "" : "warning",
      message: voiceOnWifi || usb.connected
        ? "正在切换语音输入的长按按钮并同步到设备..."
        : "语音输入按键已保存到客户端，连接支持语音输入的设备后可同步。",
    });
    if (voiceOnWifi) await applyButtonConfigOverWifi(next);
    else if (usb.connected) await applyVoiceConfigOverUsb(next);
  }, [applyButtonConfigOverWifi, applyVoiceConfigOverUsb, buttonPanelRuntime, usb.connected, voiceConfig, voiceOnWifi]);

  const updateVoiceEnabled = useCallback(async (enabled) => {
    buttonConfigRevisionRef.current += 1;
    const next = applyVoiceEnabledForRuntime(voiceConfig, enabled, buttonPanelRuntime);
    saveVoiceConfigToStorage(next);
    setVoiceConfig(next);
    setVoiceConfigDirty(true);
    setVoiceConfigOtaState({
      pending: false,
      tone: voiceOnWifi || usb.connected ? "" : "warning",
      message: voiceOnWifi || usb.connected
        ? "正在同步按键语音设置…"
        : "按键语音设置已保存到客户端，连接支持语音输入的设备后可同步。",
    });
    if (voiceOnWifi) await applyButtonConfigOverWifi(next);
    else if (usb.connected) await applyVoiceConfigOverUsb(next);
  }, [applyButtonConfigOverWifi, applyVoiceConfigOverUsb, buttonPanelRuntime, usb.connected, voiceConfig, voiceOnWifi]);

  useEffect(() => {
    if (
      !runtimeVoiceEnabled
      || (!voiceOnWifi && (!isP4Runtime || !usb.connected || !p4TargetBoardDeviceId
        || buttonConfigHydratedFor !== p4TargetBoardDeviceId))
    ) return undefined;
    let cancelled = false;
    const wifiTarget = voiceOnWifi ? wifi : null;
    const runtimeKey = voiceTarget.key;
    const current = () => !cancelled && voiceTargetKeyRef.current === runtimeKey;

    const rearmDeviceVoice = async () => {
      try {
        const bridgeRuntime = await ensureBridgeRuntime();
        if (!current()) return;
        if (bridgeRuntime?.running === false) {
          throw new Error(bridgeRuntime?.message || "本地 Bridge 未启动");
        }
        const voiceRuntime = await invoke("ensure_device_voice_runtime", {
          input: { interactive: false },
        });
        if (!current()) return;
        if (voiceRuntime?.deferred) {
          if (!cancelled) {
            voiceDispatch({
              type: "set_audio_bridge_state",
              enabled: false,
              ok: null,
              deferred: true,
              message: voiceRuntime?.message || "打开语音输入区域后将继续恢复设备麦克风",
            });
          }
          return;
        }
        if (!voiceRuntime?.running) {
          throw new Error(voiceRuntime?.message || "设备录音识别通道未就绪");
        }
        const audio = await sendAudioBridgeSignal({
          wifiTarget,
          boardDeviceId: p4TargetBoardDeviceId,
          expectedConnectionId: usb.connectionId,
          action: "start",
          voiceButton: activeVoiceTriggerId,
        });
        if (!wifiTarget && !audio?.usbSent) throw new Error(audio?.usbError || "设备麦克风信令未通过 USB 送达");
        if (current()) {
          voiceDispatch({ type: "set_audio_bridge_state", enabled: true, ok: true, message: "设备麦克风已自动恢复" });
        }
      } catch (error) {
        if (current()) {
          voiceDispatch({ type: "set_audio_bridge_state", enabled: false, ok: false, message: `设备麦克风自动恢复失败: ${error}` });
        }
      }
    };

    rearmDeviceVoice();
    return () => {
      cancelled = true;
    };
  }, [
    activeVoiceTriggerId,
    buttonConfigHydratedFor,
    isP4Runtime,
    p4TargetBoardDeviceId,
    runtimeVoiceEnabled,
    sendAudioBridgeSignal,
    usb.connected,
    usb.connectionId,
    voiceOnWifi,
    voiceTarget.key,
    wifi,
  ]);

  // ---------- Audio bridge toggle ----------
  const toggleAudioBridge = useCallback(async (action) => {
    const requestedEnabled = action === "start";
    const targetKey=voiceTarget.key;
    const current=()=>voiceTargetKeyRef.current===targetKey;
    if(voiceTarget.kind==="waiting")return;
    const wifiTarget = voiceOnWifi ? wifi : null;
    const targetBoardDeviceId = wifiTarget?.boardDeviceId || usb.boardDeviceId;
    voiceDispatch({ type: "set_audio_bridge_pending", value: true });
    try {
      if (!targetBoardDeviceId) throw new Error("未找到可用的板子 ID，请先完成设备绑定。");
      if (action === "start") {
        const bridgeRuntime = await ensureBridgeRuntime();
        if (!current()) return;
        if (bridgeRuntime?.running === false) throw new Error(bridgeRuntime?.message || "本地 Bridge 未启动，无法下发板子音频信令。");
        const voiceRuntime = await invoke(
          p4VoiceRuntime ? "ensure_device_voice_runtime" : "ensure_voice_runtime",
        );
        if (!current()) return;
        if (!voiceRuntime?.running) throw new Error(voiceRuntime?.message || "voice-service 未启动，无法接入板子音频。");
      }
      if (!current()) return;
      const res = await sendAudioBridgeSignal({
        wifiTarget,
        boardDeviceId: targetBoardDeviceId,
        expectedConnectionId: usb.connectionId,
        action,
        voiceButton: activeVoiceTriggerId,
      });
      if (!current()) return;
      if (!wifiTarget && !res?.usbSent) throw new Error(res?.usbError || "设备麦克风信令未通过 USB 送达");
      const transport = wifiTarget ? "Wi-Fi" : "USB";
      voiceDispatch({ type: "set_audio_bridge_state", enabled: requestedEnabled, ok: true, message: `已通过 ${transport} 同步到设备` });
    } catch (err) {
      if (!current()) return;
      voiceDispatch({ type: "set_audio_bridge_state", enabled: !requestedEnabled, ok: false, message: `${action === "start" ? "启动" : "关闭"}板子音频失败: ${err}` });
    }
  }, [voiceTarget.key, activeVoiceTriggerId, p4VoiceRuntime, sendAudioBridgeSignal, usb.boardDeviceId, usb.connectionId, voiceOnWifi, wifi]);

  const resumeDeviceVoiceAfterCredentialAccess = useCallback(() => {
    if (!runtimeVoiceEnabled || (!voiceOnWifi && (!isP4Runtime || !usb.connected || !p4TargetBoardDeviceId))) {
      return undefined;
    }
    return toggleAudioBridge("start");
  }, [
    isP4Runtime,
    p4TargetBoardDeviceId,
    runtimeVoiceEnabled,
    toggleAudioBridge,
    usb.connected,
    voiceOnWifi,
  ]);

  // This controller stays mounted across tabs; VoiceAssistantPanel does not.
  // Read native readiness again after a successful save, then restore the
  // transport and replace any old "please configure" recovery error.
  useEffect(() => subscribeAsrCredentialUpdates(window, resumeDeviceVoiceAfterCredentialAccess),
    [resumeDeviceVoiceAfterCredentialAccess]);

  const sendMockButtonInject = useCallback(() => {
    const text = (voiceState.mockInjectInput || "").trim();
    if (!text || !selectedAgentId) return;
    voiceDispatch({ type: "set_mock_inject_pending", value: true });
    const request = selectedAgentId === "workbuddy"
      ? invoke("write_workbuddy_voice_test_draft", { text })
      : postMockButtonInject({
      agentId: selectedAgentId,
      sessionId: p4SessionSync.sessionId || "auto",
      text,
    });
    request
      .then((response) => {
        const sessionId =
          response?.sessionId
          || response?.done?.sessionId
          || response?.ready?.sessionId
          || p4SessionSync.sessionId
          || "auto";
        voiceDispatch({
          type: "set_mock_inject_result",
          ok: true,
          message: selectedAgentId === "workbuddy"
            ? "已追加到 WorkBuddy 草稿，未发送；请核对文字是否一致、有无截图蒙层。"
            : `已发送到当前会话 · ${sessionId}`,
          reply: response?.tokenPreview || "",
        });
      })
      .catch((err) => {
        voiceDispatch({
          type: "set_mock_inject_result",
          ok: false,
          message: err?.message || String(err),
          reply: "",
        });
      });
  }, [p4SessionSync.sessionId, selectedAgentId, voiceState.mockInjectInput]);

  const [appearanceObservationBusy, setAppearanceObservationBusy] = useState(false);
  const appearanceObservationOwnerRef = useRef(null);
  const observationTarget = appearanceTarget(usb, wifi, binding?.boardDeviceId);
  const observationKey = JSON.stringify(observationTarget);
  const observationScope = useRef(null);
  useLayoutEffect(() => {
    const scope = { key: observationKey, target: JSON.parse(observationKey) };
    observationScope.current = scope;
    return () => { observationScope.current = null; };
  }, [observationKey]);
  const onReconcileAppearance = useCallback(async () => {
    const scope = observationScope.current;
    if (!scope?.target || appearanceObservationOwnerRef.current || appearanceSync?.pending) return;
    const owner = scope.target;
    appearanceObservationOwnerRef.current = owner;
    setAppearanceObservationBusy(true);
    const isCurrent = () => appearanceObservationOwnerRef.current === owner && observationScope.current === scope;
    try {
      const result = await observeAppearanceFromMenu({ invoke, boardDeviceId: owner.boardDeviceId, wifiBootId: owner.transport === "wifi" ? owner.bootId : null, isCurrent });
      if (isCurrent()) push({ tone: "info", ...result });
    } catch (error) {
      if (isCurrent()) push({ tone: "warning", title: "形象状态尚未确认", message: appearanceObservationError(error) });
    } finally {
      if (appearanceObservationOwnerRef.current === owner) {
        appearanceObservationOwnerRef.current = null;
        setAppearanceObservationBusy(false);
      }
    }
  }, [appearanceSync?.pending, push]);

  // ---------- Action-menu callbacks ----------
  const testTarget = testMessageTarget(usb, wifi, binding?.boardDeviceId);
  const testScope = JSON.stringify(testTarget);
  const testOwner = useRef(null);
  useEffect(() => {
    const owner = { target: testTarget };
    testOwner.current = owner;
    return () => { testOwner.current = null; };
  }, [testScope]);
  const onSendTest = useCallback(async () => {
    const owner = testOwner.current;
    if (!owner?.target) return;
    try {
      const message = await sendTestMessage(invoke, owner.target);
      if (testOwner.current === owner) push({ tone: owner.target.legacy ? "info" : "success", title: "测试消息", message });
    } catch (error) {
      if (testOwner.current === owner) push({ tone: "warning", title: "测试消息", message: String(error?.message || error) });
    }
  }, [push]);

  const onCopyDesktopId = useCallback(() => {
    try {
      navigator.clipboard?.writeText(binding.desktopDeviceId || "");
      push({ tone: "success", title: "已复制桌面设备 ID" });
    } catch {
      push({ tone: "error", title: "复制失败" });
    }
  }, [binding.desktopDeviceId, push]);

  const onUnbindClick = useCallback(() => {
    invoke("remove_device_binding", { boardDeviceId: binding.boardDeviceId })
      .then(() => onUnbind?.())
      .catch((err) => push({ tone: "error", title: "解绑失败", message: String(err) }));
  }, [binding.boardDeviceId, onUnbind, push]);

  /* 应急：负一屏物理按键失灵切不回主屏时，远程把设备 .screen-page 写成 main */
  const onDeviceReturnHome = useCallback(async () => {
    try {
      if (wifiControlReady) await wifiDeviceControl(invoke, wifi, "returnHome");
      else await invoke("usb_set_screen_page", { page: "main", expectedBoardDeviceId: usb.boardDeviceId });
      push({ tone: "success", title: "已请求设备切回主屏" });
    } catch (err) {
      push({ tone: "error", title: "切回主屏失败", message: typeof err === "string" ? err : String(err) });
    }
  }, [push, usb.boardDeviceId, wifi, wifiControlReady]);

  const recoveryAppearanceId = (wifi && currentDisplay.appearance?.id)
    || readActiveAppearanceId()
    || BUILTIN_TERRIER_APPEARANCE_ID;
  const { available: canDeliverAppearance, send: sendAppearance } = useAppearanceDelivery(
    usb, wifi, binding?.boardDeviceId, recoveryAppearanceId,
  );
  const onForceSyncAppearance = useCallback(async () => {
    try {
      const message = await sendAppearance();
      if (message !== null) push({ tone: "success", title: "设备形象已核对", message });
    } catch (err) {
      push({ tone: "error", title: "重新同步形象失败", message: String(err?.message || err) });
    }
  }, [push, sendAppearance]);

  const onInputConfigReset = useCallback(async (wirelessReadback) => {
    const revision = ++buttonConfigRevisionRef.current;
    const usbScope = voiceTarget.key;
    const readback = wirelessReadback ?? await invoke("usb_get_button_config", {
      expectedBoardDeviceId: diagnosticsTargetBoardDeviceId,
    });
    if (revision !== buttonConfigRevisionRef.current || (wirelessReadback
      ? wifiInputScope !== wifiInputScopeRef.current || readback.boardDeviceId !== diagnosticsTargetBoardDeviceId
      : usbScope !== voiceTargetKeyRef.current)) return;
    if (wirelessReadback || usb.runtime === P4_RUNTIME_ID) requireButtonReadback(readback, diagnosticsTargetBoardDeviceId);
    const next = mergeBoardButtonConfig(voiceConfigRef.current, readback, wirelessReadback ? P4_RUNTIME_ID : usb.runtime);
    saveVoiceConfigToStorage(next);
    setVoiceConfig(next);
    setVoiceConfigDirty(false);
    setVoiceConfigOtaState({ pending: false, tone: "success", message: "已读取设备恢复后的按键配置。" });
  }, [diagnosticsTargetBoardDeviceId, usb.runtime, voiceTarget.key, wifiInputScope]);

  // Session, voice, and device synchronization must keep running across tabs,
  // but the dashboard's large control tree and media previews do not.
  return (
    <>
    {keyboardActive && <KeyboardConfiguration usb={usb} wifi={wifi} boardDeviceId={onlineBoardDeviceId || binding?.boardDeviceId}>
      <Card>
        <BoardButtonPanel
          selectedAgentId={selectedAgentId}
          voiceConfig={runtimeVoiceConfig}
          buttonActions={voiceConfig.buttonActions}
          buttonValues={voiceConfig.buttonValues}
          buttonLabels={voiceConfig.buttonLabels}
          runtime={buttonPanelRuntime}
          voiceConfigDirty={voiceConfigDirty}
          voiceConfigOtaState={voiceConfigOtaState}
          usbConnected={Boolean(usb.connected)}
          wifiConnected={buttonPanelOnWifi}
          wifiSyncAvailable={wifiControlReady}
          doublePressSupported={buttonPanelCapabilities?.inputDoublePress === true}
          systemSettingsSupported={buttonPanelCapabilities?.systemSettings === true}
          voiceKeySupported={usb.connected && usb.capabilities?.nativeUsbHid === "p4-hid-keyboard-v1"}
          selectedTrigger={selectedVoiceTrigger}
          onVoiceConfigChange={updateVoiceConfig}
          onAdoptDeviceButtons={adoptDeviceButtons}
          onApplyVoiceConfig={wifiControlReady ? applyButtonConfigOverWifi : applyVoiceConfigOverUsb}
        />
      </Card>
    </KeyboardConfiguration>}
    {active && <PageShell
      title="桌宠伙伴"
      help={hasKnownRuntime ? () => setGuideOpen(true) : undefined}
      actions={
        <DashboardActionsMenu
          onSendTest={testTarget ? onSendTest : undefined}
          onCopyDesktopId={binding.desktopDeviceId ? onCopyDesktopId : undefined}
          onUnbind={onUnbind ? onUnbindClick : undefined}
          onDeviceReturnHome={usb.connected || wifiControlReady ? onDeviceReturnHome : undefined}
          onForceSyncAppearance={canDeliverAppearance && !appearanceSync?.pending ? onForceSyncAppearance : undefined}
          onReconcileAppearance={onReconcileAppearance}
          canReconcileAppearance={Boolean(observationTarget) && !appearanceSync?.pending && !appearanceObservationBusy}
          onUpdateFirmware={(usb.connected
            ? usb.boardDeviceId && usb.connectionId && usb.runtime === P4_RUNTIME_ID
            : wifi?.controlTrusted && wifi?.wirelessOta && wifi?.boardDeviceId && wifi?.bootId)
            ? () => {
              setFirmwareWifiBootId(usb.connected ? "" : wifi.bootId);
              setFirmwareTargetBoardDeviceId(usb.connected ? usb.boardDeviceId : wifi.boardDeviceId);
              setFirmwareModalOpen(true);
            }
            : undefined}
          onDiagnostics={usb.connected && usb.runtime === P4_RUNTIME_ID || wifiControlReady
            ? () => {
              setDiagnosticsWifiTarget(wifiControlReady ? wifi : null);
              setDiagnosticsTargetBoardDeviceId(wifiControlReady ? wifi.boardDeviceId : usb.boardDeviceId || "");
              setDiagnosticsModalOpen(true);
            }
            : undefined}
        />
      }
    >
      {usb.boardWedged && (
        <div
          role="alert"
          style={{
            margin: "10px 16px",
            padding: "10px 14px",
            borderRadius: 8,
            background: "#7f1d1d",
            color: "#fff",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          设备已挂死（板端死锁）：请重插 USB 线恢复，应用会自动重连。
        </div>
      )}
      <ChannelMatrixCard
        onOpenPersona={setEditingPersona}
        subtitle={agentScanSummary}
        actions={(
          <Button
            variant="ghost"
            size="small"
            loading={agentScan?.pending === true}
            loadingLabel="扫描中…"
            onClick={handleRefreshAgents}
            aria-label="重新扫描本机 CLI Agent"
          >
            <RefreshCw size={14} />
            重新扫描
          </Button>
        )}
      >
        <DeviceStatusBar onOpenDeviceSettings={onOpenDeviceSettings} />

        {realtimeChat?.error && !isRecoveringAsr(realtimeChat) && <div role="alert" className="message-banner message-banner--error">
          实时对话失败：{realtimeErrorMessage(realtimeChat)}。详情与诊断日志见下方「实时对话」。
        </div>}
      </ChannelMatrixCard>


      <Card.Collapsible
        title="语音输入"
        summary={buildVoiceSummary(runtimeVoiceConfig, selectedVoiceTrigger)}
        defaultOpen
      >
        <VoiceAssistantPanel
          state={{
            ...voiceState,
            deviceVoiceFlow,
            busSessions: selectedAgentBusSessions,
            busRoutingSessions: selectedAgentRoutingSessions,
            busSessionsLoaded: selectedAgentSessionsLoaded,
            busSessionId: p4SessionSync.sessionId,
            selectedAgentId,
            deviceOnline: Boolean(usb.connected || wifi),
            wifiConnected: Boolean(wifi),
            voiceOnWifi,
            voiceRuntimeTargetKey: voiceTarget.key,
            voiceRuntimeTargetReady: voiceTarget.kind !== "waiting",
          }}
          dispatch={voiceDispatch}
          toggleAudioBridge={toggleAudioBridge}
          sendMockButtonInject={sendMockButtonInject}
          voiceConfig={runtimeVoiceConfig}
          selectedTrigger={selectedVoiceTrigger}
          voiceTriggerOptions={runtimeVoiceTriggerOptions}
          onVoiceConfigChange={updateVoiceConfig}
          onVoiceTriggerChange={updateVoiceTrigger}
          onVoiceEnabledChange={updateVoiceEnabled}
          onOpenApiSettings={onOpenApiSettings}
        />
      </Card.Collapsible>



      <Card.Collapsible
        title="实时对话"
        summary={realtimeChat?.active ? `进行中 · ${realtimeStateLabel(realtimeChat.state)}` : "按设备上的「实时对话」键和当前形象聊天"}
        defaultOpen
      >
        <RealtimeChatPanel keyBound={realtimeChatKeyBound} onOpenApiSettings={onOpenApiSettings} onOpenGallery={onOpenGallery} onOpenPersona={() => setEditingPersona(currentDisplay?.appearance)} />
      </Card.Collapsible>

      <DeviceGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        runtime={buttonPanelRuntime}
        usb={usb}
        wifi={wifi}
        wifiEntry={!hasKnownRuntime && !usb.connected && wifi?.wifiConnected === true}
        setGuideOpen={setGuideOpen}
      />
      <DeviceDiagnosticsModal
        open={diagnosticsModalOpen}
        onClose={() => {
          setDiagnosticsModalOpen(false);
          setDiagnosticsTargetBoardDeviceId("");
          setDiagnosticsWifiTarget(null);
        }}
        onInputConfigReset={onInputConfigReset}
        expectedBoardDeviceId={diagnosticsTargetBoardDeviceId}
        wifiTarget={diagnosticsWifiTarget}
        usb={usb}
        pairedStatus={pairedStatus}
        wasmCapabilities={usb.connected && diagnosticsTargetBoardDeviceId
          && usb.boardDeviceId === diagnosticsTargetBoardDeviceId
          ? usb.capabilities : null}
      />
    </PageShell>}
    <FirmwareUpdateModal
      open={active && firmwareModalOpen}
      onClose={() => {
        setFirmwareModalOpen(false);
        setFirmwareTargetBoardDeviceId("");
      }}
      usb={usb}
      wifi={wifi}
      expectedWifiBootId={firmwareWifiBootId}
      expectedBoardDeviceId={firmwareTargetBoardDeviceId}
    />
    {editingPersona && <div hidden={!active}><PersonaVoiceModal
      appearance={editingPersona} onClose={() => setEditingPersona(null)}
      onOpenApiSettings={onOpenApiSettings}
      onSaved={() => { setEditingPersona(null); push({ tone: "success", title: "人设与声音已保存", message: "正在对话时，将从下一轮回复开始使用新设置。" }); }}
    /></div>}
    </>
  );
}
