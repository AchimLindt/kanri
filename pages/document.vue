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
import { ArrowLeftIcon } from "@heroicons/vue/24/solid";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useBoard } from "@/composables/useBoard";
import { documentFileName } from "@/utils/documentPaths";

const SAVE_DELAY_MS = 1000;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

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
let currentSave: Promise<void> = Promise.resolve();
// content as last read from / written to disk (with "\n" line breaks)
let lastSavedContent = "";
// CodeMirror works with "\n"; files with "\r\n" are written back with "\r\n"
let fileLineBreak = "\n";

const fileName = computed(() => documentFileName(documentPath.value));

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
  // last resort, normally already flushed by the route leave guard
  flushSave();
});

onBeforeRouteLeave(async () => {
  await flushSave();
});

// autosave, debounced after the last change
watch(content, (value) => {
  if (!loaded.value || value === lastSavedContent) return;
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
    try {
      await writeTextFile(
        documentPath.value,
        fileLineBreak === "\n" ? text : text.replace(/\n/g, fileLineBreak)
      );
      lastSavedContent = text;
      // further changes during the write are saved by the pending timer
      saveStatus.value = content.value === lastSavedContent ? "saved" : "saving";
    } catch (err) {
      console.error("Could not save document:", err);
      saveStatus.value = "error";
    }
  });

  return currentSave;
};

const goBack = async () => {
  await flushSave();
  router.push(boardId.value ? `/kanban/${boardId.value}` : "/");
};

const keyDownListener = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    // never trigger the WebView's own save
    e.preventDefault();
    flushSave();
    return;
  }

  // Escape that the editor already handled (e.g. collapsing a selection) does not leave the page
  if (e.key === "Escape" && !e.defaultPrevented) {
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
