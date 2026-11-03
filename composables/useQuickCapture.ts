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

// Main-window side of the quick capture (spec docs/specs/tray-quick-capture.md): opens the
// capture window, owns the global shortcut and answers the capture window's events. The capture
// window never touches the stores; every card is created here, in the main window.

import type { UnlistenFn } from "@tauri-apps/api/event";
import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition, availableMonitors, cursorPosition } from "@tauri-apps/api/window";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { Card } from "@/types/kanban-types";
import { generateUniqueID } from "@/utils/idGenerator";
import {
  QUICK_CAPTURE_EVENTS,
  QUICK_CAPTURE_HEIGHT,
  QUICK_CAPTURE_ROUTE,
  QUICK_CAPTURE_WIDTH,
  QUICK_CAPTURE_WINDOW_LABEL,
  buildCaptureTargets,
  centeredPosition,
  descriptionToHtml,
  monitorContainingPoint,
  type QuickCaptureAddPayload,
  type QuickCaptureAddedPayload,
  type QuickCaptureErrorPayload,
  type QuickCaptureTargetsPayload,
} from "@/utils/quickCapture";

/* Capture window */

async function getOrCreateCaptureWindow(backgroundColor: string | undefined): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(QUICK_CAPTURE_WINDOW_LABEL);
  if (existing) return existing;

  const win = new WebviewWindow(QUICK_CAPTURE_WINDOW_LABEL, {
    url: QUICK_CAPTURE_ROUTE,
    title: "Kanri",
    width: QUICK_CAPTURE_WIDTH,
    height: QUICK_CAPTURE_HEIGHT,
    decorations: false,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    transparent: false,
    visible: false,
    center: true,
    focus: true,
    backgroundColor,
  });
  await new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => reject(event.payload));
  });
  return win;
}

/** Centers the window on the monitor under the mouse pointer (work area), else on its current monitor. */
async function placeCaptureWindow(win: WebviewWindow): Promise<void> {
  try {
    const [cursor, monitors] = await Promise.all([cursorPosition(), availableMonitors()]);
    const monitor = monitorContainingPoint(monitors, cursor);
    if (monitor) {
      const area = monitor.workArea ?? monitor;
      const { x, y } = centeredPosition(
        { position: area.position, size: area.size, scaleFactor: monitor.scaleFactor },
        QUICK_CAPTURE_WIDTH,
        QUICK_CAPTURE_HEIGHT,
      );
      await win.setPosition(new PhysicalPosition(x, y));
      return;
    }
  } catch (err) {
    console.warn("Could not place the quick capture window on the cursor monitor:", err);
  }
  try {
    await win.center();
  } catch (err) {
    console.warn("Could not center the quick capture window:", err);
  }
}

let openPromise: Promise<void> | null = null;

/**
 * Shows the capture window (created on first use, reused afterwards) and tells it to reset.
 * Used by the global shortcut and, via the "quick-capture:open" event, by the tray menu.
 */
export function openQuickCapture(): Promise<void> {
  if (!openPromise) {
    openPromise = (async () => {
      try {
        const theme = useThemeStore();
        const win = await getOrCreateCaptureWindow(theme.colors?.elevation1);
        await placeCaptureWindow(win);
        await win.show();
        await win.setFocus();
        await emitTo(QUICK_CAPTURE_WINDOW_LABEL, QUICK_CAPTURE_EVENTS.shown);
      } catch (err) {
        console.warn("Could not open the quick capture window:", err);
      }
    })().finally(() => {
      openPromise = null;
    });
  }
  return openPromise;
}

/* Global shortcut */

let registeredShortcut: string | null = null;
let shortcutQueue: Promise<unknown> = Promise.resolve();

/**
 * Replaces the registered quick capture shortcut ("" = none). Resolves to false if the
 * registration failed (usually because another program owns the shortcut).
 */
export function applyQuickCaptureShortcut(shortcut: string): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (registeredShortcut) {
      try {
        await unregister(registeredShortcut);
      } catch (err) {
        console.warn("Could not unregister the quick capture shortcut:", err);
      }
      registeredShortcut = null;
    }
    if (!shortcut) return true;

    try {
      // a webview reload keeps the Rust-side registration of the previous page instance
      if (await isRegistered(shortcut)) await unregister(shortcut);
      await register(shortcut, (event) => {
        if (event.state === "Pressed") void openQuickCapture();
      });
      registeredShortcut = shortcut;
      return true;
    } catch (err) {
      console.warn(`Could not register the quick capture shortcut "${shortcut}":`, err);
      return false;
    }
  };
  const result = shortcutQueue.then(run, run);
  shortcutQueue = result;
  return result;
}

/* Host: event handling in the main window */

/**
 * Call in the setup of layouts/default.vue (needs the i18n context); start() after boards.init(),
 * stop() in onBeforeUnmount.
 */
export function useQuickCaptureHost() {
  const { t } = useI18n();
  const boards = useBoardsStore();
  const settings = useSettingsStore();
  const theme = useThemeStore();

  const unlisteners: UnlistenFn[] = [];
  let started = false;

  const sendToCapture = (event: string, payload?: unknown) =>
    emitTo(QUICK_CAPTURE_WINDOW_LABEL, event, payload).catch((err) =>
      console.warn(`Could not send ${event} to the quick capture window:`, err),
    );

  const sendTargets = () => {
    const payload: QuickCaptureTargetsPayload = {
      targets: buildCaptureTargets(boards.boards),
      inbox:
        settings.quickCaptureBoardId && settings.quickCaptureColumnId
          ? { boardId: settings.quickCaptureBoardId, columnId: settings.quickCaptureColumnId }
          : null,
      locale: settings.locale,
      // plain copy of the reactive theme object for the event payload
      colors: theme.colors ? JSON.parse(JSON.stringify(theme.colors)) : null,
    };
    return sendToCapture(QUICK_CAPTURE_EVENTS.targets, payload);
  };

  const sendError = (message: string) => {
    const payload: QuickCaptureErrorPayload = { message };
    return sendToCapture(QUICK_CAPTURE_EVENTS.error, payload);
  };

  const addCard = async (payload: Partial<QuickCaptureAddPayload> | null | undefined) => {
    if (!boards.initialized) return sendError(t("quickCapture.errorNotReady"));

    const title = (payload?.title ?? "").trim();
    if (!title) return sendError(t("quickCapture.errorEmptyTitle"));

    const board = payload?.boardId ? boards.boardById(payload.boardId) : undefined;
    const column = board?.columns.find((c) => c.id === payload?.columnId);
    if (!board || !column) return sendError(t("quickCapture.errorTargetMissing"));

    const card: Card = {
      id: generateUniqueID(),
      name: title,
      description: descriptionToHtml(payload?.description ?? ""),
      color: "",
      tasks: [],
      dueDate: null,
      isDueDateCounterRelative: false,
      isDueDateCompleted: false,
      tags: [],
    };
    boards.createCard(board.id, column.id, card, true);

    if (payload?.rememberTarget) {
      try {
        await settings.setQuickCaptureInbox(board.id, column.id);
      } catch (err) {
        console.warn("Could not save the quick capture inbox:", err);
      }
    }

    const added: QuickCaptureAddedPayload = { boardTitle: board.title, columnTitle: column.title };
    return sendToCapture(QUICK_CAPTURE_EVENTS.added, added);
  };

  const applyShortcut = async (shortcut: string) => {
    const ok = await applyQuickCaptureShortcut(shortcut);
    settings.setQuickCaptureShortcutError(!ok);
  };

  // re-register whenever the setting changes (settings page)
  watch(
    () => settings.quickCaptureShortcut,
    (shortcut) => {
      if (started) void applyShortcut(shortcut);
    },
  );

  const start = async () => {
    if (started) return;
    started = true;

    const win = getCurrentWebviewWindow();
    try {
      unlisteners.push(
        await win.listen(QUICK_CAPTURE_EVENTS.requestTargets, () => {
          void sendTargets();
        }),
        await win.listen<QuickCaptureAddPayload>(QUICK_CAPTURE_EVENTS.add, (event) => {
          addCard(event.payload).catch((err) => {
            console.warn("Quick capture failed:", err);
            void sendError(t("quickCapture.errorUnknown"));
          });
        }),
        await win.listen(QUICK_CAPTURE_EVENTS.open, () => {
          void openQuickCapture();
        }),
      );
    } catch (err) {
      console.warn("Could not register the quick capture listeners:", err);
    }

    await applyShortcut(settings.quickCaptureShortcut);
  };

  const stop = () => {
    started = false;
    for (const unlisten of unlisteners.splice(0)) unlisten();
    void applyQuickCaptureShortcut("");
  };

  return { start, stop };
}
