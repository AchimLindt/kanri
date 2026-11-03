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

import { CARD_ARCHIVE_INTERVAL_MS } from "@/utils/cardArchive";

/**
 * Automatic archiving of completed cards (spec docs/specs/card-archive.md):
 * called once on app start after the stores are loaded. Runs at most once per
 * CARD_ARCHIVE_INTERVAL_MS and moves cards that have been in a done column for
 * at least settings.archiveAfterDays days into the archive of their board.
 * Archived cards are never deleted. Never throws.
 */
export async function runScheduledCardArchive(): Promise<void> {
  const settings = useSettingsStore();
  const boards = useBoardsStore();

  try {
    if (!boards.initialized) return;

    const now = Date.now();
    if (now - settings.cardArchiveLastRun < CARD_ARCHIVE_INTERVAL_MS) return;

    const archived = boards.archiveExpiredCards(settings.archiveAfterDays, new Date(now));
    await settings.setCardArchiveLastRun(now);

    if (archived > 0) {
      console.info(`Card archive: archived ${archived} cards`);
    }
  } catch (err) {
    console.warn("Card archive run failed:", err);
  }
}
