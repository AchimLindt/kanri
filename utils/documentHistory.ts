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

/**
 * Pure helpers for the version history of card documents
 * (spec docs/specs/document-history.md). File access lives in
 * composables/useDocumentHistory.ts.
 */

import { normalizeDocumentPath } from "@/utils/documentPaths";

/** Folder below the app data directory that holds one subfolder per document. */
export const DOCUMENT_HISTORY_DIR = "document-history";

/** Maximum number of snapshots kept per document; older ones are deleted. */
export const MAX_SNAPSHOTS = 20;

/** Minimum age of the newest snapshot before a save creates another one. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

/** Snapshots older than this are deleted by the automatic cleanup. */
export const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Minimum time between two automatic cleanup runs. */
export const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const SNAPSHOT_FILE_NAME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.md$/;

/**
 * Stable folder name for a document: FNV-1a (32 bit, over the UTF-8 bytes)
 * of the normalized path as 8 hex digits.
 */
export function documentHistoryKey(path: string): string {
  const bytes = new TextEncoder().encode(normalizeDocumentPath(path));
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** File name of a snapshot taken at `date`, e.g. "2026-11-03T08-15-30-123Z.md"; sorts chronologically. */
export function snapshotFileName(date: Date): string {
  return `${date.toISOString().replace(/[:.]/g, "-")}.md`;
}

/** Inverse of `snapshotFileName`; `null` for names that are not snapshot files. */
export function parseSnapshotFileName(name: string): Date | null {
  const match = SNAPSHOT_FILE_NAME.exec(name);
  if (!match) return null;
  const [, day, hours, minutes, seconds, millis] = match;
  const date = new Date(`${day}T${hours}:${minutes}:${seconds}.${millis}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
