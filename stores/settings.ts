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

import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { DEFAULT_ARCHIVE_AFTER_DAYS, normalizeArchiveAfterDays } from "@/utils/cardArchive";
import type { ReminderLeadTime } from "@/types/kanban-types";
import { DEFAULT_QUICK_CAPTURE_SHORTCUT, normalizeQuickCaptureShortcut } from "@/utils/quickCapture";
import {
  DEFAULT_REMINDER_LEAD_TIME,
  DEFAULT_START_PAGE,
  normalizeReminderLeadTime,
  normalizeStartPage,
  normalizeTodaySectionsCollapsed,
  type StartPage,
  type TodaySection,
} from "@/utils/reminders";

export const useSettingsStore = defineStore("settings", {
  state: () => {
    /* Start page settings */
  const boardSortingOption = ref<"alphabetical" | "lastEdited" | "createdAt">("createdAt");
  const reverseSorting = ref(false);

    /* Overall app settings */
    const locale = ref("en");
    const animationsEnabled = ref(true);
    const autostartEnabled = ref(false);
    const disableSpellcheck = ref(false);

    /* Global board settings */
    const columnZoomLevel = ref(0);
    const addToTopOfColumnButtonEnabled = ref(false);
    const displayColumnCardCountEnabled = ref(false);
    const defaultRelativeDueDatesEnabled = ref(false);

    /* Card documents (Markdown files linked to cards) */
    const markdownDocumentsFolder = ref("");
    const markdownPreviewEnabled = ref(true);
    // epoch milliseconds of the last automatic document history cleanup, 0 = never
    const documentHistoryLastCleanup = ref(0);

    /* Full-text search */
    const searchDocumentContentsEnabled = ref(true);

    /* Card archive (done column) */
    const archiveAfterDays = ref(DEFAULT_ARCHIVE_AFTER_DAYS);
    // epoch milliseconds of the last automatic card archive run, 0 = never
    const cardArchiveLastRun = ref(0);

    /* Reminders and today view */
    const reminderLeadTime = ref<ReminderLeadTime>(DEFAULT_REMINDER_LEAD_TIME);
    const startPage = ref<StartPage>(DEFAULT_START_PAGE);
    const todaySectionsCollapsed = ref<Record<string, boolean>>({});

    /* Tray and quick capture */
    const minimizeToTray = ref(true);
    const startMinimized = ref(false);
    const quickCaptureShortcut = ref(DEFAULT_QUICK_CAPTURE_SHORTCUT);
    // inbox of the quick capture window, "" = not chosen yet
    const quickCaptureBoardId = ref("");
    const quickCaptureColumnId = ref("");
    // true if the shortcut could not be registered (not persisted)
    const quickCaptureShortcutError = ref(false);

    // true once loadSettings() has finished (not persisted), e.g. for the start page redirect
    const loaded = ref(false);

    return {
  locale,
  animationsEnabled,
  autostartEnabled,
  disableSpellcheck,

  columnZoomLevel,
  addToTopOfColumnButtonEnabled,
  displayColumnCardCountEnabled,
  defaultRelativeDueDatesEnabled,

  markdownDocumentsFolder,
  markdownPreviewEnabled,
  documentHistoryLastCleanup,

  searchDocumentContentsEnabled,

  archiveAfterDays,
  cardArchiveLastRun,

  reminderLeadTime,
  startPage,
  todaySectionsCollapsed,

  minimizeToTray,
  startMinimized,
  quickCaptureShortcut,
  quickCaptureBoardId,
  quickCaptureColumnId,
  quickCaptureShortcutError,

  loaded,

  boardSortingOption,
  reverseSorting,
    }
  },

  actions: {
    async loadSettings() {
      const store = useTauriStore().store;

      const localeSaved: string = await store.get("locale") ?? "en";
      const animationsEnabledSaved: boolean = await store.get("animationsEnabled") ?? true;
      const autostartEnabledSaved: boolean = await isEnabled() ?? false;

      const columnZoomLevelSaved: number = await store.get("columnZoomLevel") ?? 0;
      const addToTopOfColumnButtonEnabledSaved: boolean = await store.get("addToTopOfColumnButtonEnabled") ?? false;
      const displayColumnCardCountEnabledSaved: boolean = await store.get("displayColumnCardCountEnabled") ?? false;
      const defaultRelativeDueDatesEnabledSaved: boolean = await store.get("defaultRelativeDueDatesEnabled") ?? false;

      const markdownDocumentsFolderSaved: string = await store.get("markdownDocumentsFolder") ?? "";
      const markdownPreviewEnabledSaved: boolean = await store.get("markdownPreviewEnabled") ?? true;
      const documentHistoryLastCleanupRaw: unknown = await store.get("documentHistoryLastCleanup");
      const documentHistoryLastCleanupSaved: number =
        typeof documentHistoryLastCleanupRaw === "number" ? documentHistoryLastCleanupRaw : 0;
      const searchDocumentContentsEnabledSaved: boolean = await store.get("searchDocumentContentsEnabled") ?? true;
      const archiveAfterDaysSaved = normalizeArchiveAfterDays(await store.get("archiveAfterDays"));
      const cardArchiveLastRunRaw: unknown = await store.get("cardArchiveLastRun");
      const cardArchiveLastRunSaved: number =
        typeof cardArchiveLastRunRaw === "number" ? cardArchiveLastRunRaw : 0;
      const reminderLeadTimeSaved = normalizeReminderLeadTime(await store.get("reminderLeadTime"));
      const startPageSaved = normalizeStartPage(await store.get("startPage"));
      const todaySectionsCollapsedSaved = normalizeTodaySectionsCollapsed(await store.get("todaySectionsCollapsed"));
      const minimizeToTrayRaw: unknown = await store.get("minimizeToTray");
      const startMinimizedRaw: unknown = await store.get("startMinimized");
      const quickCaptureShortcutSaved = normalizeQuickCaptureShortcut(await store.get("quickCaptureShortcut"));
      const quickCaptureBoardIdRaw: unknown = await store.get("quickCaptureBoardId");
      const quickCaptureColumnIdRaw: unknown = await store.get("quickCaptureColumnId");

      const boardSortingOptionSaved: string = (await store.get("boardSortingOption")) ?? "createdAt";
      const reverseSortingSavedRaw: unknown = await store.get("reverseSorting");
      const reverseSortingSaved: boolean = typeof reverseSortingSavedRaw === "boolean"
        ? reverseSortingSavedRaw
        : false;

      this.locale = localeSaved;
      this.animationsEnabled = animationsEnabledSaved;
      this.autostartEnabled = autostartEnabledSaved;
      this.columnZoomLevel = columnZoomLevelSaved;
      this.addToTopOfColumnButtonEnabled = addToTopOfColumnButtonEnabledSaved;
      this.displayColumnCardCountEnabled = displayColumnCardCountEnabledSaved;
      this.defaultRelativeDueDatesEnabled = defaultRelativeDueDatesEnabledSaved;
      this.markdownDocumentsFolder = markdownDocumentsFolderSaved;
      this.markdownPreviewEnabled = markdownPreviewEnabledSaved;
      this.documentHistoryLastCleanup = documentHistoryLastCleanupSaved;
      this.searchDocumentContentsEnabled = searchDocumentContentsEnabledSaved;
      this.archiveAfterDays = archiveAfterDaysSaved;
      this.cardArchiveLastRun = cardArchiveLastRunSaved;
      this.reminderLeadTime = reminderLeadTimeSaved;
      this.startPage = startPageSaved;
      this.todaySectionsCollapsed = todaySectionsCollapsedSaved;
      this.minimizeToTray = typeof minimizeToTrayRaw === "boolean" ? minimizeToTrayRaw : true;
      this.startMinimized = typeof startMinimizedRaw === "boolean" ? startMinimizedRaw : false;
      this.quickCaptureShortcut = quickCaptureShortcutSaved;
      this.quickCaptureBoardId = typeof quickCaptureBoardIdRaw === "string" ? quickCaptureBoardIdRaw : "";
      this.quickCaptureColumnId = typeof quickCaptureColumnIdRaw === "string" ? quickCaptureColumnIdRaw : "";
      this.boardSortingOption =
        boardSortingOptionSaved === "alphabetical" ||
        boardSortingOptionSaved === "lastEdited" ||
        boardSortingOptionSaved === "createdAt"
          ? boardSortingOptionSaved
          : "createdAt";
      this.reverseSorting = reverseSortingSaved;
      this.loaded = true;
    },

    async loadBoardSortingOptions() {
      const store = useTauriStore().store;

      const boardSortingOptionSaved: string = (await store.get("boardSortingOption")) ?? "createdAt";
      const reverseSortingSavedRaw: unknown = await store.get("reverseSorting");
      const reverseSortingSaved: boolean = typeof reverseSortingSavedRaw === "boolean"
        ? reverseSortingSavedRaw
        : false;

      this.boardSortingOption =
        boardSortingOptionSaved === "alphabetical" ||
        boardSortingOptionSaved === "lastEdited" ||
        boardSortingOptionSaved === "createdAt"
          ? boardSortingOptionSaved
          : "createdAt";
      this.reverseSorting = reverseSortingSaved;
    },

    async deleteAllData() {
      const store = useTauriStore().store;
      await store.reset();
      await this.loadSettings(); // load defaults
    },

    async setLocale(locale: string) {
      this.locale = locale;
      await useTauriStore().store.set("locale", locale);
    },

    async setAnimationsEnabled(value: boolean) {
      this.animationsEnabled = value;
      await useTauriStore().store.set("animationsEnabled", value);
    },

    async setAutostartEnabled(value: boolean) {
      this.autostartEnabled = value;

      // set using tauri plugin, not saving in store
      if (value) await enable();
      else await disable();
    },

    async setDisableSpellcheck(value: boolean) {
      this.disableSpellcheck = value;
      await useTauriStore().store.set("disableSpellcheck", value);
    },

    async setColumnZoomLevel(value: number) {
      this.columnZoomLevel = value;
      await useTauriStore().store.set("columnZoomLevel", value);
    },

    async setAddToTopOfColumnButtonEnabled(value: boolean) {
      this.addToTopOfColumnButtonEnabled = value;
      await useTauriStore().store.set("addToTopOfColumnButtonEnabled", value);
    },
    
    async setDisplayColumnCardCountEnabled(value: boolean) {
      this.displayColumnCardCountEnabled = value;
      await useTauriStore().store.set("displayColumnCardCountEnabled", value);
    },

    async setDefaultRelativeDueDatesEnabled(value: boolean) {
      this.defaultRelativeDueDatesEnabled = value;
      await useTauriStore().store.set("defaultRelativeDueDatesEnabled", value);
    },

    async setMarkdownDocumentsFolder(value: string) {
      this.markdownDocumentsFolder = value;
      await useTauriStore().store.set("markdownDocumentsFolder", value);
    },

    async setMarkdownPreviewEnabled(value: boolean) {
      this.markdownPreviewEnabled = value;
      await useTauriStore().store.set("markdownPreviewEnabled", value);
    },

    async setDocumentHistoryLastCleanup(value: number) {
      this.documentHistoryLastCleanup = value;
      await useTauriStore().store.set("documentHistoryLastCleanup", value);
    },

    async setSearchDocumentContentsEnabled(value: boolean) {
      this.searchDocumentContentsEnabled = value;
      await useTauriStore().store.set("searchDocumentContentsEnabled", value);
    },

    async setArchiveAfterDays(value: number) {
      const days = normalizeArchiveAfterDays(value);
      this.archiveAfterDays = days;
      await useTauriStore().store.set("archiveAfterDays", days);
    },

    async setCardArchiveLastRun(value: number) {
      this.cardArchiveLastRun = value;
      await useTauriStore().store.set("cardArchiveLastRun", value);
    },

    async setReminderLeadTime(value: ReminderLeadTime) {
      const leadTime = normalizeReminderLeadTime(value);
      this.reminderLeadTime = leadTime;
      await useTauriStore().store.set("reminderLeadTime", leadTime);
    },

    async setStartPage(value: StartPage) {
      const page = normalizeStartPage(value);
      this.startPage = page;
      await useTauriStore().store.set("startPage", page);
    },

    async setTodaySectionCollapsed(section: TodaySection, collapsed: boolean) {
      this.todaySectionsCollapsed = { ...this.todaySectionsCollapsed, [section]: collapsed };
      await useTauriStore().store.set("todaySectionsCollapsed", this.todaySectionsCollapsed);
    },

    async setMinimizeToTray(value: boolean) {
      this.minimizeToTray = value;
      await useTauriStore().store.set("minimizeToTray", value);
    },

    async setStartMinimized(value: boolean) {
      this.startMinimized = value;
      await useTauriStore().store.set("startMinimized", value);
      // rewrite an existing autostart entry so it carries the "--autostart" argument
      // (entries created before this feature lack it, see docs/specs/tray-quick-capture.md)
      if (value && this.autostartEnabled) {
        try {
          await enable();
        } catch (err) {
          console.warn("Could not refresh the autostart entry:", err);
        }
      }
    },

    async setQuickCaptureShortcut(value: string) {
      this.quickCaptureShortcut = value;
      await useTauriStore().store.set("quickCaptureShortcut", value);
    },

    setQuickCaptureShortcutError(value: boolean) {
      this.quickCaptureShortcutError = value;
    },

    async setQuickCaptureInbox(boardId: string, columnId: string) {
      this.quickCaptureBoardId = boardId;
      this.quickCaptureColumnId = columnId;
      const store = useTauriStore().store;
      await store.set("quickCaptureBoardId", boardId);
      await store.set("quickCaptureColumnId", columnId);
    },

    async setBoardSortingOption(option: "alphabetical" | "lastEdited" | "createdAt") {
      this.boardSortingOption = option;
      await useTauriStore().store.set("boardSortingOption", option);
    },

    async setReverseSorting(value: boolean) {
      this.reverseSorting = value;
      await useTauriStore().store.set("reverseSorting", value);
    }
  }
});
