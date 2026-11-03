/* SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, AchimLindt

SPDX-License-Identifier: GPL-3.0-or-later

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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { ref } from "vue";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { Board } from "@/types/kanban-types";
import { normalizeDocumentPath } from "@/utils/documentPaths";

/**
 * File access for the full-text search (spec docs/specs/full-text-search.md).
 * The contents of linked Markdown documents are read once per app session and kept
 * in memory; the search logic itself lives in utils/search.ts.
 */

// parallel reads per batch, keeps the IPC queue short with many documents
const READ_BATCH_SIZE = 8;

// module scope = one cache per app session (survives page changes)
// normalized path -> content; null = could not be read, skipped until the cache is reset
const documentTexts = new Map<string, string | null>();
const documentsLoading = ref(false);
// bumped on reset, so reads that started before a reset do not refill the cache
let cacheGeneration = 0;
// loads are serialized, a second search run waits for the first one instead of reading twice
let pendingLoad: Promise<void> = Promise.resolve();

function collectDocumentPaths(boards: Array<Board>): Map<string, string> {
  const paths = new Map<string, string>();
  for (const board of boards) {
    for (const column of board.columns ?? []) {
      for (const card of column.cards ?? []) {
        for (const doc of card?.documents ?? []) {
          if (!doc?.path) continue;
          const key = normalizeDocumentPath(doc.path);
          if (!paths.has(key)) paths.set(key, doc.path);
        }
      }
    }
  }
  return paths;
}

async function readMissingDocuments(boards: Array<Board>) {
  const generation = cacheGeneration;
  const missing = [...collectDocumentPaths(boards)].filter(([key]) => !documentTexts.has(key));
  if (missing.length === 0) return;

  documentsLoading.value = true;
  try {
    for (let i = 0; i < missing.length; i += READ_BATCH_SIZE) {
      const batch = missing.slice(i, i + READ_BATCH_SIZE);
      const texts = await Promise.all(
        batch.map(async ([, path]) => {
          try {
            return await readTextFile(path);
          } catch (err) {
            // missing file or path outside the fs scope: the document is skipped, no dialog
            console.warn("Search: could not read document, skipping it:", path, err);
            return null;
          }
        })
      );
      if (generation !== cacheGeneration) return;
      batch.forEach(([key], j) => documentTexts.set(key, texts[j] ?? null));
    }
  } finally {
    if (generation === cacheGeneration) documentsLoading.value = false;
  }
}

/**
 * Reads all linked documents that are not cached yet and returns the readable ones
 * (key = normalizeDocumentPath(path)), as expected by buildSearchIndex.
 */
async function ensureDocumentTexts(boards: Array<Board>): Promise<Map<string, string>> {
  const run = pendingLoad.then(() => readMissingDocuments(boards));
  pendingLoad = run.catch(() => {});
  await run;

  const result = new Map<string, string>();
  for (const [key, text] of documentTexts) {
    if (text !== null) result.set(key, text);
  }
  return result;
}

/** Drops all cached contents; the next search run reads the documents again. */
function resetDocumentTexts() {
  cacheGeneration++;
  documentTexts.clear();
  documentsLoading.value = false;
}

/**
 * Keeps the cache in sync with saves from the in-app editor. Only updates documents
 * that are already cached; others are read by the next search run anyway.
 */
export function updateCachedDocumentText(path: string, text: string) {
  const key = normalizeDocumentPath(path);
  if (documentTexts.has(key)) documentTexts.set(key, text);
}

export function useSearch() {
  return {
    documentsLoading,
    ensureDocumentTexts,
    resetDocumentTexts,
  };
}
