<!-- SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, AchimLindt -->
<!-- -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->

<!-- Quick capture window (label "capture", spec docs/specs/tray-quick-capture.md). Runs as a second
     Nuxt instance with its own Pinia; it never touches the stores. Board/column list, inbox, locale
     and theme come from the main window via Tauri events, new cards are created by the main window. -->

<template>
  <main
    class="flex h-full flex-col gap-2 p-3"
    @keydown.esc.prevent="hideWindow"
  >
    <textarea
      ref="textareaRef"
      v-model="text"
      class="bg-elevation-2 border-elevation-3 border-accent-focus text-dim-3-placeholder min-h-0 w-full flex-1 resize-none rounded-md border px-2 py-1 outline-none"
      :placeholder="$t('pages.capture.placeholder')"
      :disabled="status === 'saving' || status === 'saved'"
      spellcheck="false"
      @keydown.enter.exact.prevent="submit"
      @input="clearError"
    />
    <div class="flex flex-row items-center gap-2">
      <select
        ref="selectRef"
        v-model="selectedKey"
        class="bg-elevation-2 border-elevation-3 border-accent-focus min-w-0 flex-1 cursor-pointer rounded-md border px-2 py-1 outline-none"
        :title="$t('pages.capture.targetLabel')"
        @change="onTargetChanged"
      >
        <option
          value=""
          disabled
        >
          {{ $t("pages.capture.targetPlaceholder") }}
        </option>
        <option
          v-for="option in targetOptions"
          :key="option.key"
          :value="option.key"
        >
          {{ option.label }}
        </option>
      </select>
    </div>
    <div class="flex h-5 flex-row items-center justify-between gap-2 text-sm">
      <span
        v-if="status === 'saved'"
        class="text-accent font-semibold"
      >
        {{ $t("pages.capture.saved") }}
      </span>
      <span
        v-else-if="errorMessage"
        class="truncate text-red-500"
        :title="errorMessage"
      >
        {{ errorMessage }}
      </span>
      <span
        v-else
        class="text-dim-3 truncate"
      >
        {{ $t("pages.capture.hint") }}
      </span>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Theme } from "@/types/kanban-types";
import {
  MAIN_WINDOW_LABEL,
  QUICK_CAPTURE_EVENTS,
  QUICK_CAPTURE_SAVED_DELAY_MS,
  parseTargetKey,
  resolveInbox,
  splitCaptureText,
  targetKey,
  type QuickCaptureAddPayload,
  type QuickCaptureErrorPayload,
  type QuickCaptureTarget,
  type QuickCaptureTargetsPayload,
} from "@/utils/quickCapture";

definePageMeta({ layout: "capture", pageTransition: false });

const { t, setLocale } = useI18n();
const colors = useState<Partial<Theme> | null>("quickCaptureColors", () => null);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const selectRef = ref<HTMLSelectElement | null>(null);

const text = ref("");
const targets = ref<QuickCaptureTarget[]>([]);
// key of the stored inbox if it is still valid, "" otherwise
const inboxKey = ref("");
const selectedKey = ref("");
const status = ref<"idle" | "saving" | "saved">("idle");
const errorMessage = ref("");

let hideTimer: ReturnType<typeof setTimeout> | null = null;
// no answer from the main window (e.g. still starting) must not block the window forever
let savingTimer: ReturnType<typeof setTimeout> | null = null;
const SAVING_TIMEOUT_MS = 5000;

const clearSavingTimer = () => {
  if (savingTimer) clearTimeout(savingTimer);
  savingTimer = null;
};
const unlisteners: UnlistenFn[] = [];

const targetOptions = computed(() =>
  targets.value.flatMap((target) =>
    target.columns.map((column) => ({
      key: targetKey(target.boardId, column.id),
      label: t("pages.capture.targetOption", { boardName: target.boardTitle, columnName: column.title }),
    })),
  ),
);

const sendToMain = (event: string, payload?: unknown) =>
  emitTo(MAIN_WINDOW_LABEL, event, payload).catch((err) =>
    console.warn(`Could not send ${event} to the main window:`, err),
  );

const focusTextarea = () => {
  nextTick(() => textareaRef.value?.focus());
};

const clearError = () => {
  errorMessage.value = "";
};

/** Fresh start on every show: empty text, focus, current boards from the main window. */
const reset = () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  clearSavingTimer();
  text.value = "";
  status.value = "idle";
  errorMessage.value = "";
  focusTextarea();
  void sendToMain(QUICK_CAPTURE_EVENTS.requestTargets);
};

const hideWindow = async () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  try {
    await getCurrentWebviewWindow().hide();
  } catch (err) {
    console.warn("Could not hide the quick capture window:", err);
  }
};

const onTargets = (payload: QuickCaptureTargetsPayload) => {
  targets.value = Array.isArray(payload?.targets) ? payload.targets : [];
  if (payload?.locale) void setLocale(payload.locale);
  colors.value = payload?.colors ?? null;

  const inbox = resolveInbox(targets.value, payload?.inbox?.boardId, payload?.inbox?.columnId);
  inboxKey.value = inbox ? targetKey(inbox.boardId, inbox.columnId) : "";
  // preselect the inbox; without a (valid) inbox the user has to choose
  selectedKey.value = inboxKey.value;
};

const onTargetChanged = () => {
  clearError();
  focusTextarea();
};

const submit = () => {
  if (status.value === "saving" || status.value === "saved") return;

  const { title, description } = splitCaptureText(text.value);
  if (!title) {
    errorMessage.value = t("pages.capture.errorEmptyTitle");
    return;
  }
  const target = parseTargetKey(selectedKey.value);
  if (!target || !targetOptions.value.some((o) => o.key === selectedKey.value)) {
    errorMessage.value = t("pages.capture.errorNoTarget");
    selectRef.value?.focus();
    return;
  }

  const payload: QuickCaptureAddPayload = {
    title,
    description,
    boardId: target.boardId,
    columnId: target.columnId,
    // a new choice (no inbox yet, invalid inbox or a different column) becomes the inbox
    rememberTarget: selectedKey.value !== inboxKey.value,
  };
  status.value = "saving";
  errorMessage.value = "";
  clearSavingTimer();
  savingTimer = setTimeout(() => {
    savingTimer = null;
    if (status.value === "saving") onError({ message: t("pages.capture.errorNoAnswer") });
  }, SAVING_TIMEOUT_MS);
  void sendToMain(QUICK_CAPTURE_EVENTS.add, payload);
};

const onAdded = () => {
  clearSavingTimer();
  status.value = "saved";
  inboxKey.value = selectedKey.value;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    text.value = "";
    status.value = "idle";
    void hideWindow();
  }, QUICK_CAPTURE_SAVED_DELAY_MS);
};

const onError = (payload: QuickCaptureErrorPayload) => {
  clearSavingTimer();
  status.value = "idle";
  errorMessage.value = payload?.message || t("pages.capture.errorUnknown");
  focusTextarea();
};

onMounted(async () => {
  const win = getCurrentWebviewWindow();
  try {
    unlisteners.push(
      await win.listen(QUICK_CAPTURE_EVENTS.shown, () => reset()),
      await win.listen<QuickCaptureTargetsPayload>(QUICK_CAPTURE_EVENTS.targets, (event) => onTargets(event.payload)),
      await win.listen(QUICK_CAPTURE_EVENTS.added, () => onAdded()),
      await win.listen<QuickCaptureErrorPayload>(QUICK_CAPTURE_EVENTS.error, (event) => onError(event.payload)),
      // focus the text field again when the user comes back to the window
      await win.listen("tauri://focus", () => {
        if (status.value === "idle") focusTextarea();
      }),
    );
  } catch (err) {
    console.warn("Could not register the quick capture listeners:", err);
  }
  // first show: the "shown" event may have been sent before this page was loaded
  reset();
});

onBeforeUnmount(() => {
  if (hideTimer) clearTimeout(hideTimer);
  clearSavingTimer();
  for (const unlisten of unlisteners.splice(0)) unlisten();
});
</script>
