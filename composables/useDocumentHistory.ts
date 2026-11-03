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

import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  stat,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  CLEANUP_INTERVAL_MS,
  DOCUMENT_HISTORY_DIR,
  documentHistoryKey,
  MAX_SNAPSHOTS,
  parseSnapshotFileName,
  SNAPSHOT_MAX_AGE_MS,
  snapshotFileName,
} from "@/utils/documentHistory";

export interface DocumentSnapshot {
  name: string;
  date: Date;
  /** size in bytes */
  size: number;
}

const fsOptions = { baseDir: BaseDirectory.AppData };

/**
 * Snapshots of a Markdown document in the app data folder
 * (spec docs/specs/document-history.md). Snapshot texts use "\n" line breaks.
 * Errors are logged and never thrown, so they cannot block saving the document.
 */
export function useDocumentHistory(documentPath: Ref<string>) {
  const historyDir = computed(
    () => `${DOCUMENT_HISTORY_DIR}/${documentHistoryKey(documentPath.value)}`
  );

  // snapshot creation is serialized (autosave and menu actions can overlap)
  let pendingCreate: Promise<unknown> = Promise.resolve();

  /** Snapshot file names, newest first; throws on file system errors. */
  const snapshotNames = async (): Promise<string[]> => {
    if (!(await exists(historyDir.value, fsOptions))) return [];
    const entries = await readDir(historyDir.value, fsOptions);
    return entries
      .filter((entry) => entry.isFile && parseSnapshotFileName(entry.name) !== null)
      .map((entry) => entry.name)
      .sort()
      .reverse();
  };

  const readSnapshotText = async (name: string): Promise<string> => {
    const text = await readTextFile(`${historyDir.value}/${name}`, fsOptions);
    return text.replace(/\r\n/g, "\n");
  };

  /** All snapshots, newest first; empty on errors. */
  const listSnapshots = async (): Promise<DocumentSnapshot[]> => {
    try {
      const names = await snapshotNames();
      return await Promise.all(
        names.map(async (name) => {
          const info = await stat(`${historyDir.value}/${name}`, fsOptions);
          return { name, date: parseSnapshotFileName(name) as Date, size: info.size };
        })
      );
    } catch (err) {
      console.warn("Could not list document versions:", err);
      return [];
    }
  };

  /** Text of a snapshot; throws if it cannot be read. */
  const readSnapshot = (name: string): Promise<string> => readSnapshotText(name);

  /**
   * Stores `content` as a new snapshot and deletes the oldest ones beyond
   * MAX_SNAPSHOTS. Returns false if the text equals the newest snapshot or on errors.
   */
  const createSnapshot = (content: string): Promise<boolean> => {
    const result = pendingCreate.then(async () => {
      try {
        const names = await snapshotNames();
        if (names.length > 0 && (await readSnapshotText(names[0]!)) === content) return false;

        await mkdir(historyDir.value, { ...fsOptions, recursive: true });
        const name = snapshotFileName(new Date());
        await writeTextFile(`${historyDir.value}/${name}`, content, fsOptions);

        const obsolete = [name, ...names.filter((n) => n !== name)].slice(MAX_SNAPSHOTS);
        for (const oldName of obsolete) {
          try {
            await remove(`${historyDir.value}/${oldName}`, fsOptions);
          } catch (err) {
            console.warn("Could not delete old document version:", err);
          }
        }
        return true;
      } catch (err) {
        console.warn("Could not save document version:", err);
        return false;
      }
    });
    pendingCreate = result;
    return result;
  };

  /** Date of the newest snapshot; null if there is none or on errors. */
  const newestSnapshotDate = async (): Promise<Date | null> => {
    try {
      const names = await snapshotNames();
      return names.length > 0 ? parseSnapshotFileName(names[0]!) : null;
    } catch (err) {
      console.warn("Could not read document versions:", err);
      return null;
    }
  };

  return { listSnapshots, readSnapshot, createSnapshot, newestSnapshotDate };
}

export interface DocumentHistoryCleanupResult {
  removedFolders: number;
  removedSnapshots: number;
}

/**
 * Deletes the histories of documents that no card references any more
 * (`referencedPaths` = every document path of every board) and snapshots
 * older than SNAPSHOT_MAX_AGE_MS; folders left empty are removed as well.
 * Files that are not snapshots are left alone. Errors per folder are logged
 * and the remaining folders are still processed.
 */
export async function cleanupDocumentHistory(
  referencedPaths: Iterable<string>,
  now: Date = new Date()
): Promise<DocumentHistoryCleanupResult> {
  const result: DocumentHistoryCleanupResult = { removedFolders: 0, removedSnapshots: 0 };
  if (!(await exists(DOCUMENT_HISTORY_DIR, fsOptions))) return result;

  const referencedKeys = new Set<string>();
  for (const path of referencedPaths) {
    referencedKeys.add(documentHistoryKey(path));
  }
  const cutoff = now.getTime() - SNAPSHOT_MAX_AGE_MS;

  for (const entry of await readDir(DOCUMENT_HISTORY_DIR, fsOptions)) {
    if (!entry.isDirectory) continue;
    const dir = `${DOCUMENT_HISTORY_DIR}/${entry.name}`;

    try {
      if (!referencedKeys.has(entry.name)) {
        await remove(dir, { ...fsOptions, recursive: true });
        result.removedFolders++;
        continue;
      }

      let remaining = 0;
      for (const file of await readDir(dir, fsOptions)) {
        const date = file.isFile ? parseSnapshotFileName(file.name) : null;
        if (date && date.getTime() < cutoff) {
          await remove(`${dir}/${file.name}`, fsOptions);
          result.removedSnapshots++;
        } else {
          remaining++;
        }
      }

      if (remaining === 0) {
        await remove(dir, { ...fsOptions, recursive: true });
        result.removedFolders++;
      }
    } catch (err) {
      console.warn("Could not clean up document history:", dir, err);
    }
  }

  return result;
}

/**
 * Runs `cleanupDocumentHistory` at most once per CLEANUP_INTERVAL_MS; the time
 * of the last run is kept in the settings store. Requires the boards store to
 * be initialized, otherwise every history would look orphaned. Never throws.
 */
export async function runScheduledDocumentHistoryCleanup(): Promise<void> {
  const settings = useSettingsStore();
  const boards = useBoardsStore();

  try {
    if (!boards.initialized) return;

    const now = Date.now();
    if (now - settings.documentHistoryLastCleanup < CLEANUP_INTERVAL_MS) return;

    const referencedPaths = boards.boards.flatMap((board) =>
      board.columns.flatMap((column) =>
        column.cards.flatMap((card) => (card.documents ?? []).map((doc) => doc.path))
      )
    );

    const result = await cleanupDocumentHistory(referencedPaths, new Date(now));
    await settings.setDocumentHistoryLastCleanup(now);

    if (result.removedFolders > 0 || result.removedSnapshots > 0) {
      console.info(
        `Document history cleanup: removed ${result.removedFolders} orphaned histories and ${result.removedSnapshots} old versions`
      );
    }
  } catch (err) {
    console.warn("Document history cleanup failed:", err);
  }
}
