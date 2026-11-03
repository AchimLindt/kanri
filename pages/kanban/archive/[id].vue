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
  <main v-if="boardContent" class="flex flex-col gap-4 pb-8 pl-8 pr-12 pt-6">
    <ModalConfirmation
      v-show="deleteModalVisible"
      :close-button-text="$t('general.cancelAction')"
      :confirm-button-text="$t('pages.archive.deleteAction')"
      :title="$t('pages.archive.deleteConfirmationTitle') + '?'"
      @closeModal="deleteDialog.cancel()"
      @confirmAction="deleteDialog.confirm(true)"
    />

    <div class="flex flex-row items-start gap-4">
      <button
        class="bg-elevation-1 bg-elevation-2-hover transition-button mt-1 flex shrink-0 flex-row items-center gap-2 rounded-md px-3 py-1"
        :title="$t('pages.archive.back')"
        @click="goBack"
      >
        <ArrowLeftIcon class="size-5" />
        <span class="hidden lg:block">{{ $t("pages.archive.back") }}</span>
      </button>
      <div class="min-w-0">
        <h1 class="text-4xl font-bold">
          {{ $t("pages.archive.title") }}
        </h1>
        <span class="text-dim-3 break-words">{{
          $t("pages.archive.subtitle", { boardName: boardContent.title })
        }}</span>
      </div>
    </div>

    <div
      class="bg-elevation-1 border-elevation-3 flex max-w-3xl flex-row items-center gap-2 rounded-md border px-3 py-2"
    >
      <PhMagnifyingGlass class="text-dim-2 size-5 shrink-0" />
      <input
        v-model="query"
        class="w-full bg-transparent text-lg outline-none"
        :placeholder="$t('pages.archive.searchPlaceholder')"
        type="text"
        @keydown.escape="query = ''"
      >
    </div>

    <p v-if="archivedCards.length === 0" class="text-dim-3 mt-4 max-w-3xl">
      {{ $t("pages.archive.emptyState", { days: settings.archiveAfterDays }) }}
    </p>
    <p v-else-if="filteredCards.length === 0" class="text-dim-3 mt-4">
      {{ $t("pages.archive.noResults") }}
    </p>
    <template v-else>
      <p class="text-dim-2 text-sm">
        {{ $t("pages.archive.count", filteredCards.length) }}
      </p>
      <section class="flex max-w-5xl flex-col gap-2">
        <div
          v-for="(entry, entryIndex) in filteredCards"
          :key="entry.card.id ?? entryIndex"
          class="bg-elevation-1 flex w-full flex-row items-start justify-between gap-4 rounded-md px-4 py-2"
        >
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-no-overflow font-semibold">{{ entry.card.name }}</span>
            <span class="text-dim-3 text-sm">
              {{ $t("pages.archive.column", { columnName: entry.columnTitle }) }}
              ·
              {{ $t("pages.archive.archivedAt", { date: formatDate(entry.archivedAt) }) }}
            </span>
            <div
              v-if="entry.card.tags && entry.card.tags.length > 0"
              class="-ml-0.5 flex flex-row flex-wrap items-center gap-1"
            >
              <div v-for="(tag, tagIndex) in entry.card.tags" :key="tag.id ?? tagIndex">
                <KanbanTagDisplay :tag="tag" />
              </div>
            </div>
          </div>
          <div class="flex shrink-0 flex-row items-center gap-2">
            <button
              class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1 disabled:cursor-default disabled:opacity-50"
              :disabled="!restoreTarget(entry)"
              :title="restoreHint(entry)"
              @click="restore(entry)"
            >
              {{ $t("pages.archive.restoreAction") }}
            </button>
            <button
              class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1 text-red-500"
              @click="confirmDelete(entry)"
            >
              {{ $t("pages.archive.deleteAction") }}
            </button>
          </div>
        </div>
      </section>
    </template>
  </main>
  <div v-else class="flex h-screen w-full items-center justify-center" />
</template>

<script setup lang="ts">
import type { ArchivedCard } from "@/types/kanban-types";
import { ArrowLeftIcon } from "@heroicons/vue/24/solid";
import { PhMagnifyingGlass } from "@phosphor-icons/vue";
import { useConfirmDialog } from "@vueuse/core";
import { useBoard } from "@/composables/useBoard";
import emitter from "@/utils/emitter";
import {
  archivedCardMatches,
  resolveRestoreColumn,
  sortArchivedCards,
} from "@/utils/cardArchive";

// a file pages/kanban/[id]/archive.vue would turn the board page into a parent route,
// so the archive page lives here and overrides its path (spec docs/specs/card-archive.md)
definePageMeta({
  path: "/kanban/:id/archive",
});

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const settings = useSettingsStore();

const board = useBoard(computed(() => route.params.id as string));
const { board: boardContent } = board;

const query = ref("");

const deleteModalVisible = ref(false);
const deleteDialog = useConfirmDialog(deleteModalVisible);

const archivedCards = computed<Array<ArchivedCard>>(() =>
  sortArchivedCards(boardContent.value?.archivedCards ?? [])
);
const filteredCards = computed(() =>
  archivedCards.value.filter((entry) => archivedCardMatches(entry, query.value))
);

const dateFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" })
);
const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.value.format(date);
};

const restoreTarget = (entry: ArchivedCard) =>
  boardContent.value ? resolveRestoreColumn(boardContent.value, entry) : null;

// tooltip only when the card does not go back to its original column
const restoreHint = (entry: ArchivedCard) => {
  const target = restoreTarget(entry);
  if (!target) return t("pages.archive.restoreNoColumn");
  if (target.id !== entry.columnId) {
    return t("pages.archive.restoreToOtherColumn", { columnName: target.title });
  }
  return undefined;
};

const restore = (entry: ArchivedCard) => {
  board.restoreArchivedCard(entry.card.id);
};

const confirmDelete = async (entry: ArchivedCard) => {
  emitter.emit("openModalWithCustomDescription", {
    description: t("pages.archive.deleteConfirmation", { cardName: entry.card.name }),
  });

  const { isCanceled } = await deleteDialog.reveal();
  if (!isCanceled) {
    board.deleteArchivedCard(entry.card.id);
  }
};

const goBack = () => {
  router.push(`/kanban/${route.params.id as string}`);
};

onMounted(async () => {
  await board.init();
  if (!boardContent.value) {
    console.error("Could not resolve board for the archive page!");
    router.push("/");
  }
});
</script>
