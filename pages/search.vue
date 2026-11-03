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
  <main class="flex flex-col gap-4 pb-8 pl-8 pr-12 pt-6">
    <div>
      <h1 class="text-4xl font-bold">
        {{ $t("pages.search.title") }}
      </h1>
      <span class="text-dim-3">{{ $t("pages.search.subtitle") }}</span>
    </div>

    <div class="flex max-w-3xl flex-col gap-3">
      <div
        class="bg-elevation-1 border-elevation-3 flex flex-row items-center gap-2 rounded-md border px-3 py-2"
      >
        <PhMagnifyingGlass class="text-dim-2 size-5 shrink-0" />
        <input
          ref="searchInput"
          v-model="query"
          class="w-full bg-transparent text-lg outline-none"
          :placeholder="$t('pages.search.placeholder')"
          type="text"
          @keydown.escape="query = ''"
        >
      </div>

      <div class="flex flex-row flex-wrap items-center gap-x-6 gap-y-2">
        <label class="flex cursor-pointer flex-row items-center gap-2">
          <CheckboxRoot
            :checked="settings.searchDocumentContentsEnabled"
            class="bg-elevation-4 bg-elevation-2-hover border-elevation-5 flex size-5 shrink-0 appearance-none items-center justify-center rounded-[4px] border outline-none"
            @update:checked="onDocumentSearchToggled"
          >
            <CheckboxIndicator
              class="flex size-full items-center justify-center rounded"
            >
              <PhCheck weight="bold" class="text-accent-lighter size-4" />
            </CheckboxIndicator>
          </CheckboxRoot>
          <span>{{ $t("pages.search.searchDocumentContents") }}</span>
        </label>
        <button
          class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1 disabled:cursor-default disabled:opacity-50"
          :disabled="documentsLoading || !settings.searchDocumentContentsEnabled"
          @click="reloadDocuments"
        >
          {{ $t("pages.search.reloadDocuments") }}
        </button>
        <span v-if="documentsLoading" class="text-dim-3 text-sm">
          {{ $t("pages.search.loadingDocuments") }}
        </span>
      </div>
    </div>

    <p v-if="terms.length === 0" class="text-dim-3 mt-4">
      {{ $t("pages.search.emptyState") }}
    </p>
    <template v-else-if="resultsKey === termsKey">
      <p v-if="hitCount === 0" class="text-dim-3 mt-4">
        {{ $t("pages.search.noResults") }}
      </p>
      <template v-else>
        <p class="text-dim-2 text-sm">
          {{ $t("pages.search.hitCount", hitCount) }}
        </p>
        <section
          v-for="group in results"
          :key="group.boardId"
          class="flex max-w-5xl flex-col gap-2"
        >
          <h2 class="mt-2 text-2xl font-bold">
            {{ group.boardTitle }}
          </h2>
          <button
            v-for="(hit, hitIndex) in group.hits"
            :key="`${hit.columnId}-${hit.cardId ?? hitIndex}`"
            class="bg-elevation-1 bg-elevation-2-hover transition-button flex w-full flex-col items-start gap-1 rounded-md px-4 py-2 text-left"
            @click="openHit(hit)"
          >
            <span class="flex w-full flex-row items-baseline justify-between gap-4">
              <span class="text-no-overflow min-w-0 font-semibold">{{
                hit.cardName
              }}</span>
              <span class="text-dim-3 shrink-0 text-sm">
                {{ hit.columnTitle }} · {{ fieldLabel(hit) }}
              </span>
            </span>
            <span class="text-dim-2 w-full break-words text-sm">
              <template
                v-for="(segment, segmentIndex) in hit.snippet"
                :key="segmentIndex"
              >
                <mark v-if="segment.match" class="search-mark">{{
                  segment.text
                }}</mark>
                <template v-else>{{ segment.text }}</template>
              </template>
            </span>
          </button>
        </section>
      </template>
    </template>
  </main>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import type { SearchHit, SearchResultGroup } from "@/utils/search";

import { PhCheck, PhMagnifyingGlass } from "@phosphor-icons/vue";
import { useDebounceFn } from "@vueuse/core";
import { useSearch } from "@/composables/useSearch";
import {
  buildSearchIndex,
  countHits,
  parseQuery,
  searchIndex,
} from "@/utils/search";

const SEARCH_DEBOUNCE_MS = 200;

const router = useRouter();
const { t } = useI18n();

const settings = useSettingsStore();
const boardsStore = useBoardsStore();
const { documentsLoading, ensureDocumentTexts, resetDocumentTexts } = useSearch();

const query = ref("");
const searchInput: Ref<HTMLInputElement | null> = ref(null);

const results: Ref<Array<SearchResultGroup>> = ref([]);
// terms the shown results belong to; differs from termsKey while a search is pending
const resultsKey = ref("");

const terms = computed(() => parseQuery(query.value));
const termsKey = computed(() => terms.value.join(" "));
const hitCount = computed(() => countHits(results.value));

// increases with every run, so a slow run (reading documents) cannot overwrite newer results
let searchRun = 0;

const runSearch = async () => {
  const run = ++searchRun;
  const currentTerms = parseQuery(query.value);
  if (currentTerms.length === 0) {
    results.value = [];
    resultsKey.value = "";
    return;
  }

  await boardsStore.init();
  const documentTexts = settings.searchDocumentContentsEnabled
    ? await ensureDocumentTexts(boardsStore.boards)
    : new Map<string, string>();
  if (run !== searchRun) return;

  results.value = searchIndex(
    buildSearchIndex(boardsStore.boards, documentTexts),
    currentTerms
  );
  resultsKey.value = currentTerms.join(" ");
};

const debouncedSearch = useDebounceFn(runSearch, SEARCH_DEBOUNCE_MS);

watch(query, () => {
  debouncedSearch();
});

const onDocumentSearchToggled = async (value: boolean) => {
  await settings.setSearchDocumentContentsEnabled(value);
  runSearch();
};

const reloadDocuments = () => {
  resetDocumentTexts();
  runSearch();
};

const fieldLabel = (hit: SearchHit) => {
  switch (hit.field) {
    case "title":
      return t("pages.search.fieldTitle");
    case "description":
      return t("pages.search.fieldDescription");
    case "task":
      return t("pages.search.fieldTask");
    case "tag":
      return t("pages.search.fieldTag");
    case "link":
      return t("pages.search.fieldLink");
    case "documentName":
      return t("pages.search.fieldDocumentName", { name: hit.detail ?? "" });
    case "documentContent":
      return t("pages.search.fieldDocumentContent", { name: hit.detail ?? "" });
    default:
      return "";
  }
};

// always opens the card; a linked document is reachable from the card dialog
const openHit = (hit: SearchHit) => {
  router.push({
    path: `/kanban/${hit.boardId}`,
    query: hit.cardId ? { card: hit.cardId } : {},
  });
};

onMounted(() => {
  searchInput.value?.focus();
});
</script>

<style scoped>
.search-mark {
  background-color: var(--accent);
  color: var(--text-buttons);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
