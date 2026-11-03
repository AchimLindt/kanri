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

import type { CardLink } from "@/types/kanban-types";

/**
 * Pure helpers for the web links attached to cards (spec docs/specs/card-links.md).
 * No DOM or Tauri access, so they can be smoke-tested with plain Node.
 */

// schemes covered by the opener plugin's default scope (opener:default -> allow-default-urls)
export const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];

const MAX_DISPLAY_NAME_LENGTH = 60;

// "scheme:" at the start, RFC 3986 scheme syntax
const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;
// "host:port" without scheme, e.g. "localhost:8080/path" or "intranet.local:8443";
// the host must be localhost or contain a dot, so "tel:123" stays a scheme
const HOST_PORT_PREFIX = /^(?:localhost|[^/:?#\s]*\.[^/:?#\s]*):\d+(?:[/?#]|$)/i;

export type NormalizeLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: "empty" | "scheme" | "invalid" };

/**
 * Validates user input and returns the URL to store.
 * Input without scheme gets "https://" prepended; only http, https and mailto are accepted.
 */
export function normalizeLinkUrl(input: string): NormalizeLinkResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "empty" };

  const hasScheme = SCHEME_PREFIX.test(trimmed) && !HOST_PORT_PREFIX.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: hasScheme && !isAllowedScheme(candidate) ? "scheme" : "invalid" };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!ALLOWED_LINK_SCHEMES.includes(protocol)) return { ok: false, error: "scheme" };

  if (protocol === "mailto:") {
    if (!parsed.pathname.trim()) return { ok: false, error: "invalid" };
  } else if (!parsed.hostname) {
    return { ok: false, error: "invalid" };
  }

  return { ok: true, url: parsed.href };
}

function isAllowedScheme(url: string): boolean {
  const match = SCHEME_PREFIX.exec(url);
  if (!match || !match[1]) return false;
  return ALLOWED_LINK_SCHEMES.includes(`${match[1].toLowerCase()}:`);
}

/** Re-check before opening a stored URL; imported data may contain anything. */
export function isAllowedLinkUrl(url: string): boolean {
  try {
    return ALLOWED_LINK_SCHEMES.includes(new URL(url).protocol.toLowerCase());
  } catch {
    return false;
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_DISPLAY_NAME_LENGTH) return text;
  return `${text.slice(0, MAX_DISPLAY_NAME_LENGTH - 1)}…`;
}

/** Title if set, otherwise host + path (http/https) or the address (mailto), shortened. */
export function linkDisplayName(link: Pick<CardLink, "url" | "title">): string {
  const title = link.title?.trim();
  if (title) return truncate(title);

  let parsed: URL;
  try {
    parsed = new URL(link.url);
  } catch {
    return truncate(link.url);
  }

  if (parsed.protocol === "mailto:") {
    return truncate(safeDecode(parsed.pathname));
  }

  const host = parsed.hostname.replace(/^www\./i, "");
  const path = safeDecode(parsed.pathname).replace(/\/+$/, "");
  return truncate(`${host}${path}`);
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
