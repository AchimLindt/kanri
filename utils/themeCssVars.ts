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

// Maps theme colors to the CSS variables used by the theme classes (bg-elevation-1, text-dim-1, ...).
// Shared by layouts/default.vue and layouts/capture.vue (the quick capture window gets the
// colors from the main window, it never reads the store itself).

import type { Theme } from "@/types/kanban-types";
import { hslToHex, rgbToHsl } from "@/utils/colorUtils";
import { dark } from "@/utils/themes";

const increaseSaturation = (hex: string | undefined): string | undefined => {
  if (hex == undefined) return;

  const rgb = hex
    .replace(
      /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
      (_m, r, g, b) => "#" + r + r + g + g + b + b
    )
    .substring(1)
    .match(/.{2}/g)
    ?.map((x) => parseInt(x, 16));
  if (!rgb || rgb.length < 3) return hex;

  const hslColor = rgbToHsl(rgb[0]!, rgb[1]!, rgb[2]!);

  hslColor[0] = Math.round(hslColor[0]);
  hslColor[1] =
    Math.round(hslColor[1]) < 80
      ? Math.round(hslColor[1] + 20)
      : Math.round(hslColor[1]);
  hslColor[2] = Math.round(hslColor[2]);

  return hslToHex(hslColor[0], hslColor[1], hslColor[2]);
};

/** CSS variables for the given theme colors; falls back to the dark theme until colors are loaded. */
export function themeCssVars(colors: Partial<Theme> | null | undefined): Record<string, string | undefined> {
  const c = colors ?? dark;
  return {
    "--accent": c.accent,
    "--accent-darker": c.accentDarker,
    "--bg-primary": c.bgPrimary,
    "--elevation-1": c.elevation1,
    "--elevation-2": c.elevation2,
    "--elevation-3": c.elevation3,
    "--logo-accent": increaseSaturation(c.accent),
    "--text": c.text,
    "--text-buttons": c.textButtons,
    "--text-dim-1": c.textD1,
    "--text-dim-2": c.textD2,
    "--text-dim-3": c.textD3,
    "--text-dim-4": c.textD4,
  };
}
