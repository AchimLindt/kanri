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
  <!-- markdown-it runs with html: false, raw HTML in the source is escaped -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-preview" @click="onClick" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import MarkdownIt from "markdown-it";

const props = defineProps<{
  source: string;
}>();

// html: false escapes raw HTML, so v-html only receives markdown-it output
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

const renderedHtml = computed(() => md.render(props.source));

// links never navigate the WebView; http(s) links open in the system browser
const onClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a");
  if (!anchor) return;

  event.preventDefault();

  const href = anchor.getAttribute("href") ?? "";
  if (/^https?:\/\//i.test(href)) {
    openUrl(href).catch((err) => console.error("Could not open link:", err));
  }
};
</script>

<style scoped>
.markdown-preview {
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  font-weight: bold;
  line-height: 1.2;
  margin: 1.2em 0 0.5em;
}

.markdown-preview :deep(h1) {
  font-size: 1.75rem;
}

.markdown-preview :deep(h2) {
  font-size: 1.4rem;
}

.markdown-preview :deep(h3) {
  font-size: 1.2rem;
}

.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  font-size: 1rem;
}

.markdown-preview > :deep(*:first-child) {
  margin-top: 0;
}

.markdown-preview :deep(p) {
  margin: 0.6em 0;
}

.markdown-preview :deep(ul) {
  list-style-type: disc;
  padding: 0 1.3rem;
  margin: 0.6em 0;
}

.markdown-preview :deep(ol) {
  list-style: decimal;
  padding: 0 1.6rem;
  margin: 0.6em 0;
}

.markdown-preview :deep(blockquote) {
  padding-left: 1rem;
  margin: 0.6em 0;
  border-left: 2px solid var(--text-dim-2);
  color: var(--text-dim-1);
}

.markdown-preview :deep(code) {
  background-color: rgba(0, 0, 0, 0.1);
  color: color-mix(in srgb, var(--accent) 50%, white);
  font-family: "JetBrainsMono", monospace;
  padding: 0 0.2em;
  border-radius: 0.25rem;
}

.markdown-preview :deep(pre) {
  background: #0d0d0d;
  color: #fff;
  font-family: "JetBrainsMono", monospace;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
  border-radius: 0.5rem;
  overflow-x: auto;
}

.markdown-preview :deep(pre code) {
  color: inherit;
  padding: 0;
  background: none;
  font-size: 0.8rem;
}

.markdown-preview :deep(table) {
  border-collapse: collapse;
  margin: 1rem 0;
}

.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid var(--elevation-3);
  padding: 0.25rem 0.6rem;
}

.markdown-preview :deep(th) {
  background-color: var(--elevation-2);
  font-weight: 600;
}

.markdown-preview :deep(hr) {
  margin: 1rem 0;
  border-color: var(--elevation-3);
}

.markdown-preview :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
