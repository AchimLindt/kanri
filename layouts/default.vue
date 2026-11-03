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
  <div
    :style="cssVars"
    :class="[
      settings.animationsEnabled ? '' : 'disable-animations',
    ]"
    class="default-layout custom-scrollbar-hidden h-screen overflow-auto"
  >
    <div v-if="mounted">
      <Sidebar class="fixed left-0 w-8" />
    </div>
    <div class="min-h-screen pl-16">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { themeCssVars } from "@/utils/themeCssVars";
import { REMINDER_CHECK_INTERVAL_MS } from "@/utils/reminders";

const { setLocale, setLocaleCookie } = useI18n();

const settings = useSettingsStore();
const theme = useThemeStore();
const layout = useLayoutStore();
const boards = useBoardsStore();

const systemTheme = useDark();

const mounted = ref(false);

// due date reminders (spec docs/specs/reminders.md); the check needs the i18n context of this setup
const { runReminderCheck } = useReminders();
let reminderTimer = null;
const { colors: savedColors, autoThemeEnabled } = toRefs(theme)

// tray and quick capture (spec docs/specs/tray-quick-capture.md)
const quickCaptureHost = useQuickCaptureHost();
let cleanupWindowLifecycle = null;
let unmounted = false;

onMounted(async () => {
  // Load settings into pinia stores
  try {
    await settings.loadSettings();
    await theme.loadThemeSettings();
  } finally {
    // the window starts hidden (tauri.conf.json), shown here unless "start minimized" applies
    await showMainWindowOnStartup(settings.startMinimized);
  }
  await layout.loadLayoutSettings();

  // one close handler for the whole window: hide into the tray or close (pages register
  // their "before close" work via onBeforeWindowClose)
  const cleanup = await setupMainWindowLifecycle(() => settings.minimizeToTray);
  if (unmounted) cleanup();
  else cleanupWindowLifecycle = cleanup;

  await boards.init();

  // Set locale cookies based on saved value
  setLocale(settings.locale);
  setLocaleCookie(settings.locale);

  mounted.value = true;

  // fire and forget: removes orphaned/old document versions at most once a day, errors are logged inside
  runScheduledDocumentHistoryCleanup();

  // archives cards that have been in a done column for too long, at most once a day, errors are logged inside
  runScheduledCardArchive();

  // reminders right away, then every minute (also while the window is hidden); the same loop
  // triggers the archive run, which skips itself until 24 h have passed since the last run
  runReminderCheck();
  reminderTimer = setInterval(() => {
    runReminderCheck();
    runScheduledCardArchive();
  }, REMINDER_CHECK_INTERVAL_MS);

  // quick capture: event listeners for the capture window and the tray menu, global shortcut
  if (!unmounted) quickCaptureHost.start();
});

onBeforeUnmount(() => {
  unmounted = true;
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = null;
  cleanupWindowLifecycle?.();
  cleanupWindowLifecycle = null;
  quickCaptureHost.stop();
});

watch(systemTheme, async (newValue) => {
  const resolvedThemeName = newValue ? "dark" : "light";

  if (autoThemeEnabled.value) {
    theme.toggleAutoTheme(resolvedThemeName);
  }
});

const cssVars = computed(() => themeCssVars(savedColors.value));
</script>

<style>
.disable-animations * {
  -webkit-transition: none !important;
  -moz-transition: none !important;
  -o-transition: none !important;
  transition: none !important;
}

.default-layout {
  background-color: var(--bg-primary);
  color: var(--text);
  transition: color 0.5s cubic-bezier(0.17, 0.67, 0.83, 0.67);
  transition: background-color 0.5s cubic-bezier(0.17, 0.67, 0.83, 0.67);
  overscroll-behavior: none;
}

.bg-primary {
  background-color: var(--bg-primary);
}

.bg-primary-darker {
  background-color: color-mix(in srgb, var(--bg-primary) 100%, black 10%);
}

.fill-bg-primary-darker {
  fill: color-mix(in srgb, var(--bg-primary) 100%, black 10%);
}

.bg-elevation-1 {
  background-color: var(--elevation-1);
}

.bg-elevation-2 {
  background-color: var(--elevation-2);
}

.bg-elevation-2-hover:hover {
  background-color: var(--elevation-2);
}

.bg-elevation-3 {
  background-color: var(--elevation-3);
}

.bg-elevation-3-hover:hover {
  background-color: var(--elevation-3);
}

.bg-elevation-4 {
  background-color: color-mix(in srgb, var(--elevation-3) 95%, white);
}

.bg-button-text {
  background-color: var(--text-buttons);
}

.bg-accent {
  background-color: var(--accent);
}

.bg-accent:hover {
  background-color: var(--accent-darker);
}

.bg-accent-no-hover {
  background-color: var(--accent);
}

.border-b-bg-primary {
  border-bottom-color: var(--bg-primary);
}

.border-elevation-1 {
  border-color: var(--elevation-1);
}

.border-elevation-2 {
  border-color: var(--elevation-2);
}

.border-elevation-3 {
  border-color: var(--elevation-3);
}

.border-elevation-5 {
  border-color: color-mix(in srgb, var(--elevation-3) 85%, white);
}

.border-accent {
  border-color: var(--accent);
}

.border-accent-focus:focus {
  border-color: var(--accent);
}

.text-accent-lighter {
  color: color-mix(in srgb, var(--accent) 70%, white);
}

.text-accent-logo-icon {
  color: var(--logo-accent);
}

.text-accent {
  color: var(--accent);
}

.text-accent-hover:hover {
  color: var(--accent);
}

.text-accent-darker-hover:hover {
  color: var(--accent-darker);
}

.text-normal {
  color: var(--text);
}

.text-dim-1 {
  color: var(--text-dim-1);
}

.text-dim-2 {
  color: var(--text-dim-2);
}

.text-dim-3 {
  color: var(--text-dim-3);
}

.text-dim-3-placeholder::placeholder {
  color: var(--text-dim-3);
}

.text-dim-4 {
  color: var(--text-dim-4);
}

.text-buttons {
  color: var(--text-buttons);
}

.text-no-overflow {
  overflow-wrap: break-word;
  white-space: normal;
  overflow: hidden;
}

.text-no-overflow-task {
  overflow-wrap: anywhere;
  white-space: normal;
  overflow: hidden;
}

.transition-button {
  transition-property:
    color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 300ms;
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 220ms cubic-bezier(0.4, 0, 0.2, 0.8),
    transform 220ms cubic-bezier(0.4, 0, 0.2, 0.8);
  will-change: opacity, transform;
  overflow: hidden;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.98);
}

.page-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.page-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.99);
}
</style>
