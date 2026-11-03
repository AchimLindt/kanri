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
 * Pure string helpers for the Markdown documents linked to cards
 * (spec docs/specs/card-documents.md). They are synchronous on purpose so
 * they can be used in templates and computeds; Tauri's path API is async.
 */

// characters not allowed in Windows file names (control characters are removed separately)
const FORBIDDEN_FILE_NAME_CHARS = /[<>:"/\\|?*]/g;

/** Last path segment, works with Windows (`\`) and POSIX (`/`) separators. */
export function documentFileName(path: string): string {
  const segments = path.split(/[\\/]/).filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? "";
}

/** Display name of a document: file name without its extension. */
export function documentDisplayName(path: string): string {
  const fileName = documentFileName(path);
  const dotIndex = fileName.lastIndexOf(".");
  // keep names like ".notes" intact
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

/** Suggested file name for a new document of a card, e.g. "My card" -> "My-card.md". */
export function cardTitleToFileName(title: string): string {
  const slug = title
    .replace(FORBIDDEN_FILE_NAME_CHARS, "")
    .trim()
    .replace(/\s+/g, "-")
    // remaining control characters are not allowed either
    .split("")
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    // Windows does not allow trailing dots in file names
    .replace(/\.+$/, "");

  return `${slug || "document"}.md`;
}

/** Joins a folder and a file name with the separator style used by the folder. */
export function joinDocumentPath(folder: string, fileName: string): string {
  if (!folder) return fileName;
  const separator = folder.includes("\\") ? "\\" : "/";
  const trimmedFolder = folder.replace(/[\\/]+$/, "");
  return `${trimmedFolder}${separator}${fileName}`;
}

/**
 * Normalizes a path for equality checks (not for file access): unifies
 * separators, removes "." and resolves ".." segments, drops trailing
 * separators and compares Windows paths (drive letter or UNC) case-insensitively.
 */
export function normalizeDocumentPath(path: string): string {
  const isUnc = /^[\\/]{2}[^\\/]/.test(path);
  const isWindows = isUnc || /^[a-zA-Z]:/.test(path);
  const isAbsolutePosix = !isWindows && path.startsWith("/");

  const resolved: string[] = [];
  for (const segment of path.split(/[\\/]+/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && resolved.length > 0 && resolved[resolved.length - 1] !== "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  let normalized = resolved.join("/");
  if (isUnc) normalized = `//${normalized}`;
  else if (isAbsolutePosix) normalized = `/${normalized}`;

  return isWindows ? normalized.toLowerCase() : normalized;
}
