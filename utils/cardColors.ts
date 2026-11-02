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
 * Fixed card color palette (same colors as the card edit dialog).
 * The class names must stay literal here so Tailwind JIT generates them.
 */
export const CARD_COLOR_CLASSES = [
  "bg-pink-600",
  "bg-red-600",
  "bg-orange-600",
  "bg-yellow-600",
  "bg-green-600",
  "bg-teal-600",
  "bg-blue-600",
  "bg-purple-600",
  "bg-elevation-2",
] as const;

export type CardColorClass = (typeof CARD_COLOR_CLASSES)[number];

/** Hover variants for the palette swatches (literal for Tailwind JIT, same as the card edit dialog). */
export const CARD_COLOR_HOVER_CLASSES: Record<CardColorClass, string> = {
  "bg-pink-600": "hover:bg-pink-700",
  "bg-red-600": "hover:bg-red-700",
  "bg-orange-600": "hover:bg-orange-700",
  "bg-yellow-600": "hover:bg-yellow-700",
  "bg-green-600": "hover:bg-green-700",
  "bg-teal-600": "hover:bg-teal-700",
  "bg-blue-600": "hover:bg-blue-700",
  "bg-purple-600": "hover:bg-purple-700",
  "bg-elevation-2": "bg-elevation-3-hover",
};

/** Human readable name of a palette class, e.g. "bg-pink-600" -> "pink". */
export const cardColorName = (colorClass: string): string =>
  colorClass.replace(/^bg-/, "").replace(/-\d+$/, "").replace("elevation-2", "default");

/** Accepts #rgb and #rrggbb. */
export const isHexColor = (value: string | null | undefined): value is string =>
  !!value && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);

/** Expands #rgb to #rrggbb (lowercase); returns other values unchanged. */
export const normalizeHexColor = (value: string): string => {
  const match = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/.exec(value);
  if (!match) return value.toLowerCase();
  return `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`.toLowerCase();
};
