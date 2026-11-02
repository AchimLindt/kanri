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
  <div class="flex flex-col gap-2">
    <div class="flex flex-row flex-wrap items-center gap-3">
      <!-- "None" swatch: resets the color to null -->
      <button
        type="button"
        class="border-elevation-3 relative flex size-7 items-center justify-center overflow-hidden rounded-full border-2"
        :title="$t('components.colorSwatchPicker.none')"
        :aria-label="$t('components.colorSwatchPicker.none')"
        @click="selectColor(null)"
      >
        <span
          class="absolute left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500"
        />
        <CheckIcon v-if="isNone" class="relative size-4" />
      </button>

      <!-- fixed palette (class names are listed literally in utils/cardColors.ts) -->
      <button
        v-for="colorClass in CARD_COLOR_CLASSES"
        :key="colorClass"
        type="button"
        :class="[
          'flex size-7 items-center justify-center rounded-full',
          colorClass,
          CARD_COLOR_HOVER_CLASSES[colorClass],
          colorClass === 'bg-elevation-2' ? 'border-elevation-3 border' : '',
        ]"
        :title="cardColorName(colorClass)"
        :aria-label="cardColorName(colorClass)"
        @click="selectColor(colorClass)"
      >
        <CheckIcon
          v-if="modelValue === colorClass"
          :class="[
            'size-4',
            colorClass === 'bg-elevation-2' ? '' : 'text-gray-50',
          ]"
        />
      </button>

      <!-- custom color swatch -->
      <button
        type="button"
        class="border-elevation-3 flex size-7 items-center justify-center rounded-full border"
        :style="{ 'background-color': customColorPreview }"
        :title="$t('components.colorSwatchPicker.custom')"
        :aria-label="$t('components.colorSwatchPicker.custom')"
        @click="selectCustomColor"
      >
        <CheckIcon
          v-if="isCustom"
          :class="['size-4', customColorContrastClass]"
        />
        <SwatchIcon
          v-else
          :class="['size-4 stroke-2', customColorContrastClass]"
        />
      </button>
    </div>

    <div v-if="isCustom">
      <h3 class="my-1 text-sm font-semibold">
        {{ $t("components.colorSwatchPicker.custom") }}
      </h3>
      <div class="flex w-full flex-row gap-4">
        <input v-model="customColor" class="w-20" type="color">
        <HexColorInput v-model="customColor" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CARD_COLOR_CLASSES,
  CARD_COLOR_HOVER_CLASSES,
  cardColorName,
  isHexColor,
  normalizeHexColor,
} from "@/utils/cardColors";
import { SwatchIcon } from "@heroicons/vue/24/outline";
import { CheckIcon } from "@heroicons/vue/24/solid";

const props = defineProps<{
  modelValue: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", color: string | null): void;
}>();

const DEFAULT_CUSTOM_COLOR = "#ffffff";

const isNone = computed(() => !props.modelValue);
// any hex value (also legacy #rgb) counts as custom, consistent with Card.vue's startsWith("#")
const isCustom = computed(() => !!props.modelValue?.startsWith("#"));

const customColor = ref(
  isHexColor(props.modelValue) ? normalizeHexColor(props.modelValue) : DEFAULT_CUSTOM_COLOR
);

// while typing, customColor can hold partial values like "#ab"; never feed those to getContrast
const customColorPreview = computed(() =>
  isHexColor(customColor.value) ? normalizeHexColor(customColor.value) : DEFAULT_CUSTOM_COLOR
);
const customColorContrastClass = computed(() => getContrast(customColorPreview.value));

// keep the custom color in sync when the model changes from outside
watch(
  () => props.modelValue,
  (newVal) => {
    if (!isHexColor(newVal)) return;
    const normalized = normalizeHexColor(newVal);
    if (normalized !== customColor.value) {
      customColor.value = normalized;
    }
  }
);

// emit custom color changes immediately, but only complete hex values
watch(customColor, (newVal, oldVal) => {
  if (newVal === oldVal) return;
  if (!isCustom.value) return;
  if (!isHexColor(newVal)) return;

  const normalized = normalizeHexColor(newVal);
  if (normalized === props.modelValue) return;

  emit("update:modelValue", normalized);
});

const selectColor = (color: string | null) => {
  emit("update:modelValue", color);
};

const selectCustomColor = () => {
  emit("update:modelValue", customColorPreview.value);
};
</script>
