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

<template>
  <div class="flex h-screen flex-col">
    <div
      class="border-elevation-2 flex shrink-0 flex-row items-center gap-4 border-b py-3 pl-2 pr-6"
    >
      <button
        class="bg-elevation-1 bg-elevation-2-hover transition-button flex shrink-0 flex-row items-center gap-2 rounded-md px-3 py-1"
        :title="$t('pages.document.back')"
        @click="goBack"
      >
        <ArrowLeftIcon class="size-5" />
        <span class="hidden lg:block">{{ $t("pages.document.back") }}</span>
      </button>

      <template v-if="documentPath && !loadError">
        <h1
          class="text-no-overflow min-w-0 flex-1 text-xl font-bold"
          :title="documentPath"
        >
          {{ fileName }}
        </h1>
        <span
          class="shrink-0 text-sm"
          :class="saveStatus === 'error' ? 'text-red-500' : 'text-dim-3'"
        >
          {{ saveStatusText }}
        </span>
        <span v-if="lintCount > 0" class="text-dim-2 shrink-0 text-sm">
          {{ $t("pages.document.lintCount", lintCount) }}
        </span>
        <Dropdown align="end" @update:open="onHistoryOpenChange">
          <template #trigger>
            <button
              class="bg-elevation-1 bg-elevation-2-hover transition-button flex shrink-0 flex-row items-center gap-2 rounded-md px-3 py-1"
              :title="$t('pages.document.history')"
            >
              <ClockIcon class="size-5" />
              <span class="hidden lg:block">{{ $t("pages.document.history") }}</span>
            </button>
          </template>
          <template #content>
            <DropdownMenuItem
              class="bg-elevation-2-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 pr-6 text-left"
              @click="saveSnapshotNow"
            >
              {{ $t("pages.document.historySaveNow") }}
            </DropdownMenuItem>
            <DropdownMenuSeparator class="bg-elevation-2 m-[5px] h-px" />
            <div class="text-dim-3 max-w-72 px-4 py-1 text-xs">
              {{ $t("pages.document.historyHint") }}
            </div>
            <template v-if="snapshotsLoaded">
              <DropdownMenuItem
                v-for="snapshot in snapshots"
                :key="snapshot.name"
                class="bg-elevation-2-hover flex w-full cursor-pointer items-center justify-between gap-4 rounded-md px-4 py-1.5 text-left"
                @click="restoreSnapshot(snapshot.name)"
              >
                <span>{{ formatSnapshotDate(snapshot.date) }}</span>
                <span class="text-dim-3 text-sm">{{ formatSnapshotSize(snapshot.size) }}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="snapshots.length === 0"
                disabled
                class="text-dim-3 rounded-md px-4 py-1.5 pr-6 text-left"
              >
                {{ $t("pages.document.historyEmpty") }}
              </DropdownMenuItem>
            </template>
          </template>
        </Dropdown>
        <div class="flex shrink-0 flex-row items-center gap-2">
          <span class="text-sm">{{ $t("pages.document.previewToggle") }}</span>
          <SwitchRoot
            v-model:checked="settings.markdownPreviewEnabled"
            class="bg-elevation-2 bg-accent-checked relative flex h-[24px] w-[42px] cursor-pointer rounded-full shadow-sm focus-within:outline focus-within:outline-black"
            @update:checked="(val: boolean) => settings.setMarkdownPreviewEnabled(val)"
          >
            <SwitchThumb
              class="bg-button-text my-auto block size-[18px] translate-x-0.5 rounded-full shadow-sm transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]"
            />
          </SwitchRoot>
        </div>
      </template>
    </div>

    <div v-if="loadError" class="flex flex-col items-start gap-4 p-6">
      <p class="text-red-500">{{ $t("pages.document.loadError") }}</p>
      <button
        class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1"
        @click="goBack"
      >
        {{ $t("pages.document.back") }}
      </button>
    </div>

    <div v-else-if="loaded" class="flex min-h-0 flex-1 flex-row">
      <div
        class="min-w-0 overflow-y-auto"
        :class="settings.markdownPreviewEnabled ? 'basis-1/2' : 'basis-full'"
      >
        <DocumentMarkdownEditor
          v-model="content"
          @lintCount="(count: number) => (lintCount = count)"
        />
      </div>
      <div
        v-if="settings.markdownPreviewEnabled"
        class="border-elevation-2 min-w-0 basis-1/2 overflow-y-auto border-l px-6 py-4"
      >
        <DocumentMarkdownPreview :source="content" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ClockIcon } from "@heroicons/vue/24/outline";
import { ArrowLeftIcon } from "@heroicons/vue/24/solid";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useBoard } from "@/composables/useBoard";
import { type DocumentSnapshot, useDocumentHistory } from "@/composables/useDocumentHistory";
import { updateCachedDocumentText } from "@/composables/useSearch";
import { SNAPSHOT_INTERVAL_MS } from "@/utils/documentHistory";
import { documentFileName } from "@/utils/documentPaths";

const SAVE_DELAY_MS = 1000;

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const settings = useSettingsStore();

const boardId = computed(() => (route.query.board as string | undefined) ?? "");
const cardId = computed(() => (route.query.card as string | undefined) ?? "");
const documentId = computed(() => (route.query.doc as string | undefined) ?? "");

const board = useBoard(boardId);

const documentPath = ref("");
const content = ref("");
const loaded = ref(false);
const loadError = ref(false);
const lintCount = ref(0);

const saveStatus = ref<"saved" | "saving" | "error">("saved");
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let unregisterBeforeClose: (() => void) | null = null;
let currentSave: Promise<void> = Promise.resolve();
// content as last read from / written to disk (with "\n" line breaks)
let lastSavedContent = "";
// CodeMirror works with "\n"; files with "\r\n" are written back with "\r\n"
let fileLineBreak = "\n";

// version history (spec docs/specs/document-history.md)
const history = useDocumentHistory(documentPath);
// the first write of this editor session always snapshots the text on disk
let firstWriteDone = false;
const historyOpen = ref(false);
const snapshots = ref<DocumentSnapshot[]>([]);
const snapshotsLoaded = ref(false);

const fileName = computed(() => documentFileName(documentPath.value));

const snapshotDateFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" })
);
const snapshotSizeFormat = computed(
  () => new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
);
const formatSnapshotDate = (date: Date) => snapshotDateFormat.value.format(date);
const formatSnapshotSize = (size: number) => `${snapshotSizeFormat.value.format(size / 1024)} KB`;

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case "saving":
      return t("pages.document.statusSaving");
    case "error":
      return t("pages.document.statusError");
    default:
      return t("pages.document.statusSaved");
  }
});

onMounted(async () => {
  window.addEventListener("keydown", keyDownListener);

  // closing (or hiding into the tray / quitting from the tray) within the autosave delay must not
  // lose the last keystrokes; the layout's single close handler runs this before close/hide
  unregisterBeforeClose = onBeforeWindowClose(() => flushSave());

  if (!boardId.value || !cardId.value || !documentId.value) {
    loadError.value = true;
    return;
  }

  await board.init();

  const cardDocument = board.findCardDocument(cardId.value, documentId.value);
  if (!cardDocument) {
    loadError.value = true;
    return;
  }

  documentPath.value = cardDocument.path;
  try {
    const text = await readTextFile(cardDocument.path);
    fileLineBreak = text.includes("\r\n") ? "\r\n" : "\n";
    lastSavedContent = text.replace(/\r\n/g, "\n");
    content.value = lastSavedContent;
    loaded.value = true;
  } catch (err) {
    console.error("Could not read document:", err);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", keyDownListener);
  unregisterBeforeClose?.();
  unregisterBeforeClose = null;
  // last resort, normally already flushed by the route leave guard
  flushSave();
});

onBeforeRouteLeave(async () => {
  await flushSave();
});

// autosave, debounced after the last change
watch(content, (value) => {
  if (!loaded.value || value === lastSavedContent) return;
  // unsaved changes are never shown as "saved"
  saveStatus.value = "saving";
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    flushSave();
  }, SAVE_DELAY_MS);
});

// writes pending changes (if any); writes are serialized
const flushSave = (): Promise<void> => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  currentSave = currentSave.then(async () => {
    if (!loaded.value || content.value === lastSavedContent) return;
    const text = content.value;
    saveStatus.value = "saving";
    // the version on disk is kept before it is overwritten; never blocks the write
    await snapshotBeforeWrite();
    try {
      await writeTextFile(
        documentPath.value,
        fileLineBreak === "\n" ? text : text.replace(/\n/g, fileLineBreak)
      );
      lastSavedContent = text;
      // the full-text search caches document contents for the session
      updateCachedDocumentText(documentPath.value, text);
      // further changes during the write are saved by the pending timer
      saveStatus.value = content.value === lastSavedContent ? "saved" : "saving";
    } catch (err) {
      console.error("Could not save document:", err);
      saveStatus.value = "error";
    }
  });

  return currentSave;
};

// snapshot rules 1 and 2: first write of the session, or newest snapshot older than the interval
const snapshotBeforeWrite = async () => {
  try {
    if (!firstWriteDone) {
      firstWriteDone = true;
      await history.createSnapshot(lastSavedContent);
      return;
    }
    const newest = await history.newestSnapshotDate();
    if (!newest || Date.now() - newest.getTime() >= SNAPSHOT_INTERVAL_MS) {
      await history.createSnapshot(lastSavedContent);
    }
  } catch (err) {
    console.warn("Could not save document version:", err);
  }
};

const onHistoryOpenChange = async (open: boolean) => {
  historyOpen.value = open;
  if (!open) return;
  snapshots.value = await history.listSnapshots();
  snapshotsLoaded.value = true;
};

// rule 4: manual snapshot of the editor text
const saveSnapshotNow = async () => {
  if (!loaded.value) return;
  await history.createSnapshot(content.value);
};

// rule 3: the editor text is kept as a snapshot before it is replaced; undoable with Ctrl+Z
const restoreSnapshot = async (name: string) => {
  if (!loaded.value) return;
  try {
    const text = await history.readSnapshot(name);
    await history.createSnapshot(content.value);
    content.value = text;
  } catch (err) {
    console.error("Could not restore document version:", err);
  }
};

const goBack = async () => {
  await flushSave();
  // a failed write keeps the page open so no text is lost silently; the status shows the error
  if (loaded.value && saveStatus.value === "error") return;
  router.push(boardId.value ? `/kanban/${boardId.value}` : "/");
};

const keyDownListener = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    // never trigger the WebView's own save
    e.preventDefault();
    flushSave();
    return;
  }

  // Escape that the editor already handled (e.g. collapsing a selection) does not leave the page;
  // radix menus close on Escape without marking the event as handled
  if (e.key === "Escape" && !e.defaultPrevented && !historyOpen.value) {
    goBack();
  }
};
</script>

<style>
/* same rule as in pages/settings.vue, whose CSS is only loaded with that page */
.bg-accent-checked[data-state="checked"] {
  background-color: var(--accent);
}
</style>
