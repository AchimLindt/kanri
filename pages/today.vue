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
        {{ $t("pages.today.title") }}
      </h1>
      <span class="text-dim-3">{{ $t("pages.today.subtitle") }}</span>
    </div>

    <p v-if="entries.length === 0" class="text-dim-3 mt-4">
      {{ $t("pages.today.emptyState") }}
    </p>

    <section
      v-for="section in visibleSections"
      :key="section"
      class="flex max-w-5xl flex-col gap-2"
    >
      <button
        class="bg-elevation-2-hover transition-button -ml-1 flex w-fit flex-row items-center gap-2 rounded-md px-1 text-left"
        :aria-expanded="!isCollapsed(section)"
        @click="toggleSection(section)"
      >
        <ChevronRightIcon v-if="isCollapsed(section)" class="size-5" />
        <ChevronDownIcon v-else class="size-5" />
        <h2
          class="text-2xl font-bold"
          :class="section === 'overdue' ? 'text-red-500' : ''"
        >
          {{ sectionLabels[section] }}
        </h2>
        <span class="text-dim-3">{{ groups[section].length }}</span>
      </button>

      <template v-if="!isCollapsed(section)">
        <div
          v-for="entry in groups[section]"
          :key="entryKey(entry)"
          class="bg-elevation-1 flex w-full flex-row items-start gap-3 rounded-md px-4 py-2"
        >
          <CheckboxRoot
            :checked="false"
            class="bg-elevation-4 bg-elevation-2-hover border-elevation-5 mt-1 flex size-5 shrink-0 appearance-none items-center justify-center rounded-[4px] border outline-none"
            :title="$t('pages.today.markCompleted')"
            :aria-label="$t('pages.today.markCompleted')"
            @update:checked="(checked: boolean) => checked && markCompleted(entry)"
          >
            <CheckboxIndicator class="flex size-full items-center justify-center rounded">
              <PhCheck weight="bold" class="text-accent-lighter size-4" />
            </CheckboxIndicator>
          </CheckboxRoot>

          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex flex-row items-baseline justify-between gap-4">
              <nuxt-link
                :to="`/kanban/${entry.boardId}?card=${entry.card.id}`"
                class="text-no-overflow font-semibold hover:underline"
              >
                {{ entry.card.name }}
              </nuxt-link>
              <span
                class="shrink-0 text-sm"
                :class="entry.days < 0 ? 'text-red-500' : 'text-dim-2'"
              >
                {{ relativeDueText(entry.days) }} · {{ formatDueDate(entry.dueDate) }}
              </span>
            </div>
            <span class="text-dim-3 text-no-overflow text-sm">
              {{ $t("pages.today.location", { boardName: entry.boardTitle, columnName: entry.columnTitle }) }}
            </span>
            <div
              v-if="entry.card.tags && entry.card.tags.length > 0"
              class="-ml-0.5 flex flex-row flex-wrap items-center gap-1"
            >
              <div v-for="(tag, tagIndex) in entry.card.tags" :key="tag.id ?? tagIndex">
                <KanbanTagDisplay :tag="tag" />
              </div>
            </div>
            <div
              v-if="datePickerFor === entryKey(entry)"
              class="flex flex-row items-center gap-2"
            >
              <input
                :id="datePickerInputId"
                v-model="pickedDate"
                class="bg-elevation-2 border-elevation-3 rounded-md border px-2 py-1"
                type="date"
                @keydown.enter="applyPickedDate(entry)"
                @keydown.escape="datePickerFor = null"
              >
              <button
                class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1 disabled:cursor-default disabled:opacity-50"
                :disabled="!withDateInputValue(entry.dueDate, pickedDate)"
                @click="applyPickedDate(entry)"
              >
                {{ $t("pages.today.applyDate") }}
              </button>
              <button
                class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1"
                @click="datePickerFor = null"
              >
                {{ $t("general.cancelAction") }}
              </button>
            </div>
          </div>

          <Dropdown align="end">
            <template #trigger>
              <button
                class="bg-elevation-2-hover transition-button shrink-0 rounded-md p-1"
                :title="$t('pages.today.moreActions')"
                :aria-label="$t('pages.today.moreActions')"
              >
                <EllipsisHorizontalIcon class="size-5" />
              </button>
            </template>
            <template #content>
              <DropdownMenuItem
                class="bg-elevation-2-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 pr-6 text-left"
                @click="postpone(entry, 1)"
              >
                {{ $t("pages.today.postponeDay") }}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="bg-elevation-2-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 pr-6 text-left"
                @click="postpone(entry, 7)"
              >
                {{ $t("pages.today.postponeWeek") }}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="bg-elevation-2-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 pr-6 text-left"
                @click="openDatePicker(entry)"
              >
                {{ $t("pages.today.pickDate") }}
              </DropdownMenuItem>
            </template>
          </Dropdown>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/vue/24/outline";
import { EllipsisHorizontalIcon } from "@heroicons/vue/24/solid";
import { PhCheck } from "@phosphor-icons/vue";
import type { DueCardEntry, TodaySection } from "@/utils/reminders";
import {
  TODAY_SECTIONS,
  collectDueCards,
  groupDueCards,
  postponeDueDate,
  toDateInputValue,
  withDateInputValue,
} from "@/utils/reminders";

// today view (spec docs/specs/reminders.md): open cards with a due date across all boards

const { t, locale } = useI18n();
const boards = useBoardsStore();
const settings = useSettingsStore();
const clock = useReminderClock();

const entries = computed(() => collectDueCards(boards.boards, clock.value));
const groups = computed(() => groupDueCards(entries.value));
const visibleSections = computed(() => TODAY_SECTIONS.filter((section) => groups.value[section].length > 0));

const sectionLabels = computed<Record<TodaySection, string>>(() => ({
  overdue: t("pages.today.sectionOverdue"),
  today: t("pages.today.sectionToday"),
  next7: t("pages.today.sectionNext7"),
  later: t("pages.today.sectionLater"),
}));

const isCollapsed = (section: TodaySection) => settings.todaySectionsCollapsed[section] === true;
const toggleSection = (section: TodaySection) => {
  settings.setTodaySectionCollapsed(section, !isCollapsed(section));
};

const entryKey = (entry: DueCardEntry) => `${entry.boardId}:${entry.card.id}`;

const relativeDueText = (days: number) => {
  if (days === 0) return t("pages.today.relativeToday");
  if (days > 0) return t("pages.today.relativeFuture", { count: days }, days);
  return t("pages.today.relativePast", { count: -days }, -days);
};

const dateFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
);
const formatDueDate = (date: Date) => dateFormat.value.format(date);

// all changes go through store actions; a new due date clears the sent reminders
const markCompleted = (entry: DueCardEntry) => {
  if (!entry.card.id) return;
  boards.setCardDueDateCompleted(entry.boardId, entry.columnId, entry.card.id, true);
};

const postpone = (entry: DueCardEntry, days: number) => {
  if (!entry.card.id) return;
  boards.setCardDueDate(entry.boardId, entry.columnId, entry.card.id, postponeDueDate(entry.dueDate, new Date(), days));
};

// native date input below the row, opened from the menu. It is applied explicitly (button or
// Enter): the input fires "change" for every valid intermediate value while typing a date.
const datePickerFor = ref<string | null>(null);
const pickedDate = ref("");
const datePickerInputId = "today-due-date-input";

const openDatePicker = async (entry: DueCardEntry) => {
  pickedDate.value = toDateInputValue(entry.dueDate);
  datePickerFor.value = entryKey(entry);
  await nextTick();
  // the menu returns the focus to its trigger when it closes, so focus the input a bit later
  setTimeout(() => {
    const input = document.getElementById(datePickerInputId) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    try {
      input.showPicker();
    } catch {
      // showPicker needs a recent user activation; the input stays usable without it
    }
  }, 50);
};

const applyPickedDate = (entry: DueCardEntry) => {
  const next = withDateInputValue(entry.dueDate, pickedDate.value);
  if (!next || !entry.card.id) return;
  datePickerFor.value = null;
  boards.setCardDueDate(entry.boardId, entry.columnId, entry.card.id, next);
};

onMounted(async () => {
  await boards.init();
  // up-to-date day boundaries when the page opens, the reminder check moves it on every minute
  clock.value = new Date();
});
</script>
