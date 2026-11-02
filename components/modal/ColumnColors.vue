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
  <Modal :blur-background="false" @closeModal="$emit('closeModal')">
    <template #content>
      <div class="flex w-[28rem] max-w-full flex-col gap-5 pr-2">
        <div>
          <span class="text-dim-3 text-sm font-semibold">
            {{ $t("modals.columnColors.title") }}
          </span>
          <h1 class="stop-text-overflow text-xl font-bold">
            {{ column?.title }}
          </h1>
        </div>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-semibold">
            {{ $t("modals.columnColors.defaultCardColorTitle") }}
          </h2>
          <p class="text-dim-2 text-sm">
            {{ $t("modals.columnColors.defaultCardColorHint") }}
          </p>
          <ColorSwatchPicker
            :key="`default-${column?.id}`"
            :model-value="column?.defaultCardColor ?? null"
            @update:modelValue="setDefaultCardColor"
          />
          <button
            type="button"
            class="bg-elevation-2 bg-elevation-3-hover transition-button mt-1 w-fit rounded-md px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!column?.defaultCardColor"
            @click="applyDefaultCardColorToAllCards"
          >
            {{ $t("modals.columnColors.applyToAllCards") }}
          </button>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-semibold">
            {{ $t("modals.columnColors.backgroundColorTitle") }}
          </h2>
          <ColorSwatchPicker
            :key="`background-${column?.id}`"
            :model-value="column?.backgroundColor ?? null"
            @update:modelValue="setBackgroundColor"
          />
        </section>

        <div class="flex flex-row justify-end">
          <button
            type="button"
            class="text-buttons bg-accent transition-button rounded-md px-4 py-1"
            @click="$emit('closeModal')"
          >
            {{ $t("modals.columnColors.done") }}
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type { Column } from "@/types/kanban-types";

const props = defineProps<{
  column: Column | null;
}>();

const emit = defineEmits<{
  (e: "closeModal"): void;
  (e: "setDefaultCardColor", columnId: string, color: string | null): void;
  (e: "setBackgroundColor", columnId: string, color: string | null): void;
  (e: "applyDefaultCardColorToAllCards", columnId: string): void;
}>();

const setDefaultCardColor = (color: string | null) => {
  if (!props.column) return;
  emit("setDefaultCardColor", props.column.id, color);
};

const setBackgroundColor = (color: string | null) => {
  if (!props.column) return;
  emit("setBackgroundColor", props.column.id, color);
};

const applyDefaultCardColorToAllCards = () => {
  if (!props.column) return;
  emit("applyDefaultCardColorToAllCards", props.column.id);
};
</script>

<style scoped>
.stop-text-overflow {
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
