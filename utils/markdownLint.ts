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

import type { Diagnostic, LintSource } from "@codemirror/lint";
import type { Configuration } from "markdownlint";
import { lint } from "markdownlint/sync";

/**
 * markdownlint rule set for card documents: all default rules except
 * line length, inline HTML, bare URLs and "first line must be a heading".
 */
export const markdownLintConfig: Configuration = {
  default: true,
  MD013: false,
  MD033: false,
  MD034: false,
  MD041: false,
};

/** CodeMirror lint source running markdownlint on the editor content. */
export const markdownLinter: LintSource = (view) => {
  const doc = view.state.doc;
  const results = lint({
    strings: { doc: doc.toString() },
    config: markdownLintConfig,
  });

  const diagnostics: Diagnostic[] = [];
  for (const error of results.doc ?? []) {
    if (error.lineNumber < 1 || error.lineNumber > doc.lines) continue;
    const line = doc.line(error.lineNumber);
    diagnostics.push({
      from: line.from,
      to: line.to,
      severity: "warning",
      message: `${error.ruleNames[0] ?? ""}: ${error.ruleDescription}`,
    });
  }
  return diagnostics;
};
