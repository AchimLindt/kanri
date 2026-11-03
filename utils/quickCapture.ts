/* SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, AchimLindt

SPDX-License-Identifier: GPL-3.0-or-later

Kanri is an offline Kanban board app made using Tauri and Nuxt.
Copyright (C) 2022-2026 trobonox <hello@trobo.dev>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Pure helpers for the tray quick capture (spec docs/specs/tray-quick-capture.md).
// No store, DOM or Tauri access here, so the logic can be smoke-tested with Node.

import type { Board } from "@/types/kanban-types";

/* Window and events */

export const QUICK_CAPTURE_WINDOW_LABEL = "capture";
export const QUICK_CAPTURE_ROUTE = "/capture";
export const MAIN_WINDOW_LABEL = "main";
// logical pixels
export const QUICK_CAPTURE_WIDTH = 480;
export const QUICK_CAPTURE_HEIGHT = 200;
// how long the capture window shows "Saved" before it hides
export const QUICK_CAPTURE_SAVED_DELAY_MS = 600;

export const QUICK_CAPTURE_EVENTS = {
  // tray menu (Rust) -> main window
  open: "quick-capture:open",
  // main -> capture, after the window has been shown
  shown: "quick-capture:shown",
  // capture -> main
  requestTargets: "quick-capture:request-targets",
  add: "quick-capture:add",
  // main -> capture
  targets: "quick-capture:targets",
  added: "quick-capture:added",
  error: "quick-capture:error",
} as const;

// tray menu "Quit" (Rust) -> main window: flush pending saves, then destroy the window
export const APP_QUIT_REQUESTED_EVENT = "app:quit-requested";

export interface QuickCaptureColumn {
  id: string;
  title: string;
}

export interface QuickCaptureTarget {
  boardId: string;
  boardTitle: string;
  columns: QuickCaptureColumn[];
}

export interface QuickCaptureInbox {
  boardId: string;
  columnId: string;
}

export interface QuickCaptureTargetsPayload {
  targets: QuickCaptureTarget[];
  // inbox as stored in the settings, may be invalid (board/column deleted) or null
  inbox: QuickCaptureInbox | null;
  locale: string;
  // theme colors of the main window (plain object), null = fallback theme
  colors: Record<string, string> | null;
}

export interface QuickCaptureAddPayload {
  title: string;
  description: string; // plain text, converted to HTML by the main window
  boardId: string;
  columnId: string;
  rememberTarget: boolean;
}

export interface QuickCaptureAddedPayload {
  boardTitle: string;
  columnTitle: string;
}

export interface QuickCaptureErrorPayload {
  message: string;
}

/* Shortcut */

export const DEFAULT_QUICK_CAPTURE_SHORTCUT = "CommandOrControl+Alt+K";

// modifier tokens of the global-hotkey parser (case-insensitive) -> canonical spelling
const MODIFIERS: Record<string, string> = {
  COMMANDORCONTROL: "CommandOrControl",
  COMMANDORCTRL: "CommandOrControl",
  CMDORCTRL: "CommandOrControl",
  CMDORCONTROL: "CommandOrControl",
  CONTROL: "Control",
  CTRL: "Control",
  ALT: "Alt",
  OPTION: "Alt",
  SHIFT: "Shift",
  SUPER: "Super",
  COMMAND: "Super",
  CMD: "Super",
};

// key names accepted by global-hotkey 0.8 (besides letters, digits, F1-F24 and numpad digits)
const NAMED_KEYS = [
  "BACKQUOTE", "BACKSLASH", "BRACKETLEFT", "BRACKETRIGHT", "PAUSE", "PAUSEBREAK", "COMMA", "EQUAL", "MINUS",
  "PERIOD", "QUOTE", "SEMICOLON", "SLASH", "BACKSPACE", "CAPSLOCK", "ENTER", "SPACE", "TAB", "DELETE", "END",
  "HOME", "INSERT", "PAGEDOWN", "PAGEUP", "PRINTSCREEN", "SCROLLLOCK", "ARROWDOWN", "DOWN", "ARROWLEFT", "LEFT",
  "ARROWRIGHT", "RIGHT", "ARROWUP", "UP", "NUMLOCK", "NUMPADADD", "NUMADD", "NUMPADPLUS", "NUMPLUS",
  "NUMPADDECIMAL", "NUMDECIMAL", "NUMPADDIVIDE", "NUMDIVIDE", "NUMPADENTER", "NUMENTER", "NUMPADEQUAL",
  "NUMEQUAL", "NUMPADMULTIPLY", "NUMMULTIPLY", "NUMPADSUBTRACT", "NUMSUBTRACT", "ESCAPE", "ESC",
];
const SYMBOL_KEYS = ["`", "\\", "[", "]", ",", "=", "-", ".", "'", ";", "/"];

function isValidKey(token: string): boolean {
  const upper = token.toUpperCase();
  if (/^[A-Z0-9]$/.test(upper)) return true;
  if (/^KEY[A-Z]$/.test(upper) || /^DIGIT[0-9]$/.test(upper)) return true;
  if (/^(NUMPAD|NUM)[0-9]$/.test(upper)) return true;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(upper)) return true;
  return NAMED_KEYS.includes(upper) || SYMBOL_KEYS.includes(token);
}

export type ShortcutValidation =
  | { valid: true; shortcut: string } // normalized, "" = no shortcut
  | { valid: false; reason: "format" | "modifier" | "key" };

/**
 * Validates a shortcut in the format of tauri-plugin-global-shortcut ("Modifier+...+Key").
 * Requires at least one modifier other than Shift (Shift+letter would swallow normal typing)
 * and exactly one key at the end. An empty string is valid and means "no shortcut".
 */
export function validateShortcut(input: string): ShortcutValidation {
  const raw = (input ?? "").trim();
  if (raw === "") return { valid: true, shortcut: "" };

  const tokens = raw.split("+").map(t => t.trim());
  if (tokens.length < 2 || tokens.some(t => t === "")) return { valid: false, reason: "format" };

  const keyToken = tokens[tokens.length - 1]!;
  const modifiers: string[] = [];
  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIERS[token.toUpperCase()];
    if (!modifier) return { valid: false, reason: "format" };
    if (!modifiers.includes(modifier)) modifiers.push(modifier);
  }
  if (MODIFIERS[keyToken.toUpperCase()]) return { valid: false, reason: "key" };
  if (!isValidKey(keyToken)) return { valid: false, reason: "key" };
  if (!modifiers.some(m => m !== "Shift")) return { valid: false, reason: "modifier" };

  const key = keyToken.length === 1
    ? keyToken.toUpperCase()
    : keyToken.charAt(0).toUpperCase() + keyToken.slice(1);
  return { valid: true, shortcut: [...modifiers, key].join("+") };
}

/** Stored value -> valid shortcut; anything unusable falls back to the default. */
export function normalizeQuickCaptureShortcut(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_QUICK_CAPTURE_SHORTCUT;
  const result = validateShortcut(value);
  return result.valid ? result.shortcut : DEFAULT_QUICK_CAPTURE_SHORTCUT;
}

/* Text */

/**
 * First non-empty line = title, everything after it = description (plain text).
 * Leading/trailing blank lines of the description are dropped, inner blank lines kept.
 */
export function splitCaptureText(text: string): { title: string; description: string } {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const titleIndex = lines.findIndex(line => line.trim() !== "");
  if (titleIndex === -1) return { title: "", description: "" };

  const rest = lines.slice(titleIndex + 1);
  while (rest.length > 0 && rest[0]!.trim() === "") rest.shift();
  while (rest.length > 0 && rest[rest.length - 1]!.trim() === "") rest.pop();

  return { title: lines[titleIndex]!.trim(), description: rest.join("\n") };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text -> tiptap HTML: one paragraph per line, blank lines become empty paragraphs. */
export function descriptionToHtml(text: string): string {
  const normalized = (text ?? "").replace(/\r\n?/g, "\n");
  if (normalized.trim() === "") return "";
  return normalized
    .split("\n")
    .map(line => (line.trim() === "" ? "<p></p>" : `<p>${escapeHtml(line)}</p>`))
    .join("");
}

/* Targets and inbox */

export function buildCaptureTargets(boards: Board[]): QuickCaptureTarget[] {
  return boards
    .filter(board => board && board.id && Array.isArray(board.columns))
    .map(board => ({
      boardId: board.id,
      boardTitle: board.title,
      columns: board.columns
        .filter(column => column && column.id)
        .map(column => ({ id: column.id, title: column.title })),
    }))
    .filter(target => target.columns.length > 0);
}

/** Returns the inbox if board and column still exist, otherwise null. */
export function resolveInbox(
  targets: QuickCaptureTarget[],
  boardId: string | null | undefined,
  columnId: string | null | undefined,
): QuickCaptureInbox | null {
  if (!boardId || !columnId) return null;
  const target = targets.find(t => t.boardId === boardId);
  if (!target || !target.columns.some(c => c.id === columnId)) return null;
  return { boardId, columnId };
}

// value of a <select> option for a board/column pair
export function targetKey(boardId: string, columnId: string): string {
  return `${boardId}|${columnId}`;
}

export function parseTargetKey(key: string): QuickCaptureInbox | null {
  const index = (key ?? "").indexOf("|");
  if (index <= 0 || index === key.length - 1) return null;
  return { boardId: key.slice(0, index), columnId: key.slice(index + 1) };
}

/* Window placement */

export interface MonitorArea {
  position: { x: number; y: number }; // physical pixels
  size: { width: number; height: number }; // physical pixels
  scaleFactor: number;
}

export function monitorContainingPoint<T extends MonitorArea>(
  monitors: T[],
  point: { x: number; y: number },
): T | null {
  return (
    monitors.find(
      m =>
        point.x >= m.position.x &&
        point.x < m.position.x + m.size.width &&
        point.y >= m.position.y &&
        point.y < m.position.y + m.size.height,
    ) ?? null
  );
}

/** Top-left physical position that centers a window of the given logical size in the area. */
export function centeredPosition(
  area: MonitorArea,
  logicalWidth: number,
  logicalHeight: number,
): { x: number; y: number } {
  const width = Math.round(logicalWidth * area.scaleFactor);
  const height = Math.round(logicalHeight * area.scaleFactor);
  return {
    x: Math.round(area.position.x + (area.size.width - width) / 2),
    y: Math.round(area.position.y + (area.size.height - height) / 2),
  };
}
