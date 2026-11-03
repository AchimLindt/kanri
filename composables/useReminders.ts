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

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { DueReminder } from "@/utils/reminders";
import { countAttentionCards, remindersDue } from "@/utils/reminders";

// Due date reminders (spec docs/specs/reminders.md).

// "now" of the last reminder check: updated every minute, so the badge and the today view
// move on to the next day without a reload
const reminderClock = ref(new Date());

let permissionRequested = false;
let permissionDeniedLogged = false;
let checkRunning = false;
let startPageVisited = false;

/**
 * True only on the first call per session (module flag): the board overview redirects to the
 * today view on its first visit only, not on every later navigation to "/".
 */
export function consumeFirstStartPageVisit(): boolean {
  if (startPageVisited) return false;
  startPageVisited = true;
  return true;
}

// asks for the notification permission once per session; never throws
async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    if (!permissionRequested) {
      permissionRequested = true;
      if ((await requestPermission()) === "granted") return true;
    }
    if (!permissionDeniedLogged) {
      permissionDeniedLogged = true;
      console.info("Reminders: notification permission not granted, only the badge is shown");
    }
    return false;
  } catch (err) {
    console.warn("Reminders: could not check the notification permission:", err);
    return false;
  }
}

/** Reactive "now" of the reminder check, shared by the badge and the today view. */
export function useReminderClock() {
  return reminderClock;
}

/** Number of open cards that are overdue or due today (badge in the sidebar). */
export function useReminderBadgeCount() {
  const boards = useBoardsStore();
  return computed(() => countAttentionCards(boards.boards, reminderClock.value));
}

/**
 * Must be called in a component setup (uses useI18n); the returned runReminderCheck can then
 * be called from timers. It determines the pending reminders, sends a notification for each
 * and records the stage in card.remindersSent. Without permission only the clock (badge) is
 * updated and nothing is recorded. Never throws.
 */
export function useReminders() {
  const { t } = useI18n();
  const boards = useBoardsStore();
  const settings = useSettingsStore();

  const stageText = (reminder: DueReminder): string => {
    switch (reminder.stage) {
      case "lead":
        return t("reminders.stageLead", { count: reminder.days }, reminder.days);
      case "due":
        return t("reminders.stageDue");
      default:
        return t("reminders.stageOverdue", { count: -reminder.days }, -reminder.days);
    }
  };

  async function runReminderCheck(now = new Date()): Promise<void> {
    if (checkRunning) return;
    checkRunning = true;
    try {
      reminderClock.value = now;
      if (!boards.initialized || !settings.loaded) return;

      // ask on the first check of the session, even if nothing is due yet
      const permitted = await ensureNotificationPermission();

      const due = remindersDue(boards.boards, now, { reminderLeadTime: settings.reminderLeadTime });
      if (due.length === 0 || !permitted) return;

      const sentAt = now.toISOString();
      for (const reminder of due) {
        try {
          sendNotification({
            title: reminder.card.name,
            body: t("reminders.body", {
              stage: stageText(reminder),
              boardName: reminder.boardTitle,
              columnName: reminder.columnTitle,
            }),
          });
          boards.markReminderSent(reminder.boardId, reminder.columnId, reminder.card.id!, reminder.stage, sentAt);
        } catch (err) {
          console.warn("Reminders: could not send a notification:", err);
        }
      }
      console.info(`Reminders: sent ${due.length} notifications`);
    } catch (err) {
      console.warn("Reminder check failed:", err);
    } finally {
      checkRunning = false;
    }
  }

  return { runReminderCheck };
}
