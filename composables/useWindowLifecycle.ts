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

// Lifecycle of the main window (spec docs/specs/tray-quick-capture.md):
// - one central close handler (layouts/default.vue) instead of one getCurrentWindow().onCloseRequested
//   per page: @tauri-apps/api destroys the window after every listener whose own event was not
//   prevented, so a second listener (e.g. the document page) would close the window although the
//   layout wants to hide it into the tray. Pages register "before close" work here instead.
// - initial show: the window starts hidden (tauri.conf.json visible: false) and is shown once the
//   settings are loaded, unless "start minimized" applies.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_QUIT_REQUESTED_EVENT } from "@/utils/quickCapture";

type BeforeCloseHandler = () => Promise<void> | void;

const beforeCloseHandlers = new Set<BeforeCloseHandler>();

/**
 * Registers work that must finish before the main window is hidden or closed (e.g. flushing an
 * unsaved document). Returns the unregister function; call it in onBeforeUnmount.
 */
export function onBeforeWindowClose(handler: BeforeCloseHandler): () => void {
  beforeCloseHandlers.add(handler);
  return () => {
    beforeCloseHandlers.delete(handler);
  };
}

/** Runs all registered handlers; errors are logged, never thrown. */
export async function runBeforeWindowCloseHandlers(): Promise<void> {
  await Promise.all(
    [...beforeCloseHandlers].map(async (handler) => {
      try {
        await handler();
      } catch (err) {
        console.warn("Before-close handler failed:", err);
      }
    }),
  );
}

/**
 * Registers the single close handler of the main window and the listener for the tray's "Quit".
 * - Close: runs the before-close handlers, then hides the window if shouldHideOnClose() (minimize
 *   to tray), otherwise lets @tauri-apps/api destroy it (Rust then exits the app).
 * - Quit (tray menu, event app:quit-requested): runs the before-close handlers and destroys the
 *   window; Rust exits the app when the main window is destroyed (and after a timeout regardless).
 * Returns the cleanup function.
 */
export async function setupMainWindowLifecycle(shouldHideOnClose: () => boolean): Promise<() => void> {
  const win = getCurrentWindow();
  const unlisteners: Array<() => void> = [];

  try {
    unlisteners.push(
      await win.onCloseRequested(async (event) => {
        const hide = shouldHideOnClose();
        if (hide) event.preventDefault();
        await runBeforeWindowCloseHandlers();
        if (hide) {
          try {
            await win.hide();
          } catch (err) {
            console.warn("Could not hide the main window:", err);
          }
        }
      }),
      await win.listen(APP_QUIT_REQUESTED_EVENT, async () => {
        await runBeforeWindowCloseHandlers();
        try {
          await win.destroy();
        } catch (err) {
          console.warn("Could not close the main window:", err);
        }
      }),
    );
  } catch (err) {
    console.warn("Could not register the main window close handlers:", err);
  }

  return () => {
    for (const unlisten of unlisteners.splice(0)) unlisten();
  };
}

let startupHandled = false;

/**
 * Shows the main window once per app start. With startMinimized, the window stays hidden if the
 * app was launched by autostart (Rust command launched_by_autostart checks the "--autostart"
 * argument the autostart entry passes). Any error shows the window.
 */
export async function showMainWindowOnStartup(startMinimized: boolean): Promise<void> {
  if (startupHandled) return;
  startupHandled = true;

  let stayHidden = false;
  if (startMinimized) {
    try {
      stayHidden = await invoke<boolean>("launched_by_autostart");
    } catch (err) {
      console.warn("Could not detect autostart launch:", err);
    }
  }
  if (stayHidden) return;

  try {
    await getCurrentWindow().show();
  } catch (err) {
    console.warn("Could not show the main window:", err);
  }
}
