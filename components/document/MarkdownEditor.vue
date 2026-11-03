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
  <div ref="editorContainer" class="markdown-editor bg-elevation-1 text-normal size-full" />
</template>

<script setup lang="ts">
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { markdownLinter } from "@/utils/markdownLint";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "lintCount", count: number): void;
}>();

const editorContainer: Ref<HTMLDivElement | null> = ref(null);
let view: EditorView | null = null;

// colors come from the theme CSS variables set in layouts/default.vue
const kanriTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "inherit",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "\"JetBrainsMono\", ui-monospace, monospace",
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: "var(--text)",
    padding: "1rem 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--elevation-2)",
    color: "var(--text-dim-3)",
    border: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--elevation-2) 50%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--elevation-3)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--elevation-2)",
    color: "var(--text)",
    border: "1px solid var(--elevation-3)",
  },
});

const kanriHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: [tags.link, tags.url], color: "var(--accent)" },
  { tag: tags.monospace, fontFamily: "\"JetBrainsMono\", ui-monospace, monospace" },
  { tag: tags.quote, color: "var(--text-dim-2)" },
]);

// wraps the markdownlint source to report the number of hints to the page
const countingLinter = linter(
  (editorView) => {
    const diagnostics = markdownLinter(editorView);
    if (diagnostics instanceof Promise) return diagnostics;
    emit("lintCount", diagnostics.length);
    return diagnostics;
  },
  { delay: 300 }
);

onMounted(() => {
  if (!editorContainer.value) return;

  view = new EditorView({
    parent: editorContainer.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        syntaxHighlighting(kanriHighlightStyle),
        countingLinter,
        lintGutter(),
        kanriTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emit("update:modelValue", update.state.doc.toString());
          }
        }),
      ],
    }),
  });
  view.focus();
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// external changes only (e.g. a reloaded file); own updates are equal and ignored
watch(
  () => props.modelValue,
  (value) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (value === current) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }
);
</script>
