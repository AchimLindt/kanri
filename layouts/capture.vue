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

<!-- Layout of the quick capture window (spec docs/specs/tray-quick-capture.md): no sidebar, no store
     loading, no reminder loop. The theme colors come from the main window (pages/capture.vue puts
     them into the shared state "quickCaptureColors"). The theme classes of layouts/default.vue are
     not loaded in this window, so the few classes the capture page uses are defined here. -->

<template>
  <div
    :style="cssVars"
    class="capture-layout h-screen overflow-hidden"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { Theme } from "@/types/kanban-types";
import { themeCssVars } from "@/utils/themeCssVars";

const colors = useState<Partial<Theme> | null>("quickCaptureColors", () => null);
const cssVars = computed(() => themeCssVars(colors.value));
</script>

<style>
.capture-layout {
  background-color: var(--elevation-1);
  color: var(--text);
}

.capture-layout .bg-elevation-1 {
  background-color: var(--elevation-1);
}

.capture-layout .bg-elevation-2 {
  background-color: var(--elevation-2);
}

.capture-layout .border-elevation-3 {
  border-color: var(--elevation-3);
}

.capture-layout .border-accent-focus:focus {
  border-color: var(--accent);
}

.capture-layout .text-dim-2 {
  color: var(--text-dim-2);
}

.capture-layout .text-dim-3 {
  color: var(--text-dim-3);
}

.capture-layout .text-dim-3-placeholder::placeholder {
  color: var(--text-dim-3);
}

.capture-layout .text-accent {
  color: var(--accent);
}
</style>
