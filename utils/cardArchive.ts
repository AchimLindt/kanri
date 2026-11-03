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

import type { ArchivedCard, Board, Card, Column } from "@/types/kanban-types";
import { stripHtml } from "@/utils/search";

/**
 * Pure helpers for the done column and the card archive (spec docs/specs/card-archive.md).
 * No DOM, store or Tauri access.
 */

export const DEFAULT_ARCHIVE_AFTER_DAYS = 120;
// upper bound for the setting (100 years), keeps the date arithmetic sane
export const MAX_ARCHIVE_AFTER_DAYS = 36500;
// the automatic archive run happens at most once per this interval (on app start)
export const CARD_ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole number of days between 1 and MAX_ARCHIVE_AFTER_DAYS, otherwise the default. */
export function normalizeArchiveAfterDays(value: unknown): number {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return DEFAULT_ARCHIVE_AFTER_DAYS;
  const days = Math.trunc(num);
  if (days < 1) return DEFAULT_ARCHIVE_AFTER_DAYS;
  return Math.min(days, MAX_ARCHIVE_AFTER_DAYS);
}

/** Separator cards ("---") are layout, they are never archived automatically or in bulk. */
export function isSeparatorCard(card: Card): boolean {
  return card.name === "---";
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** True if the card carries a parseable completedAt timestamp. */
export function hasValidCompletedAt(card: Card): boolean {
  return parseTimestamp(card.completedAt) !== null;
}

/** True if completedAt lies at least archiveAfterDays days before now (false for missing/invalid values). */
export function isCompletionExpired(completedAt: string | undefined, archiveAfterDays: number, now: Date): boolean {
  const time = parseTimestamp(completedAt);
  if (time === null) return false;
  return now.getTime() - time >= archiveAfterDays * DAY_MS;
}

/**
 * Archive page filter: every whitespace-separated word of the query has to occur
 * (case-insensitive) in the card title or its description (HTML stripped).
 */
export function archivedCardMatches(entry: ArchivedCard, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return true;
  const card = entry.card;
  const text = `${card.name ?? ""} ${card.description ? stripHtml(card.description) : ""}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

/** Newest archive entries first (copy, the input stays untouched); invalid dates go last. */
export function sortArchivedCards(entries: Array<ArchivedCard>): Array<ArchivedCard> {
  return [...entries].sort(
    (a, b) => (parseTimestamp(b.archivedAt) ?? -Infinity) - (parseTimestamp(a.archivedAt) ?? -Infinity)
  );
}

/** Column a card is restored to: its original column if it still exists, otherwise the first one. */
export function resolveRestoreColumn(board: Board, entry: ArchivedCard): Column | null {
  return board.columns.find((c) => c.id === entry.columnId) ?? board.columns[0] ?? null;
}
