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

import type { Board } from "@/types/kanban-types";
import { documentDisplayName, documentFileName, normalizeDocumentPath } from "@/utils/documentPaths";

/**
 * Pure full-text search over boards and linked Markdown documents
 * (spec docs/specs/full-text-search.md). No DOM, store or Tauri access:
 * the caller passes the boards and the already loaded document texts.
 */

export const MIN_QUERY_LENGTH = 2;
export const SNIPPET_LENGTH = 120;
// characters shown before the first match (the rest of the snippet follows it)
const SNIPPET_LEAD = 40;
// how far the snippet edges may move to avoid cutting a word
const WORD_SNAP_DISTANCE = 15;

export type SearchField =
  | "title"
  | "description"
  | "task"
  | "tag"
  | "link"
  | "documentName"
  | "documentContent";

// order in which fields are preferred when several of them match equally well
const FIELD_PRIORITY: Array<SearchField> = [
  "title",
  "description",
  "task",
  "tag",
  "link",
  "documentName",
  "documentContent",
];

export interface SearchIndexField {
  field: SearchField;
  // document display name for document fields, otherwise undefined
  detail?: string;
  // whitespace-collapsed text that is shown in snippets
  text: string;
  // lower-cased text used for matching
  lower: string;
}

export interface SearchIndexCard {
  boardId: string;
  boardTitle: string;
  columnId: string;
  columnTitle: string;
  // undefined for legacy cards without id (the result then opens the board only)
  cardId?: string;
  cardName: string;
  fields: Array<SearchIndexField>;
}

export interface SnippetSegment {
  text: string;
  match: boolean;
}

export interface SearchHit {
  boardId: string;
  boardTitle: string;
  columnId: string;
  columnTitle: string;
  cardId?: string;
  cardName: string;
  field: SearchField;
  detail?: string;
  snippet: Array<SnippetSegment>;
}

export interface SearchResultGroup {
  boardId: string;
  boardTitle: string;
  hits: Array<SearchHit>;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#")) {
      const isHex = code[1] === "x" || code[1] === "X";
      const value = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(value) || value < 0 || value > 0x10ffff) return entity;
      return String.fromCodePoint(value);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Plain text of the tiptap HTML stored in card descriptions. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      // block boundaries and line breaks become spaces so words do not stick together
      .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/blockquote|\/pre|\/tr|\/td|\/th)\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, "")
  );
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function makeField(field: SearchField, text: string, detail?: string): SearchIndexField | null {
  const collapsed = collapseWhitespace(text);
  if (!collapsed) return null;
  return { field, detail, text: collapsed, lower: collapsed.toLowerCase() };
}

/**
 * Builds the searchable entries of all cards.
 * documentTexts maps normalizeDocumentPath(path) to the file content; paths without entry are skipped.
 */
export function buildSearchIndex(
  boards: Array<Board>,
  documentTexts: ReadonlyMap<string, string> = new Map()
): Array<SearchIndexCard> {
  const index: Array<SearchIndexCard> = [];

  for (const board of boards) {
    for (const column of board.columns ?? []) {
      for (const card of column.cards ?? []) {
        // separator cards have no content worth finding
        if (!card || card.name === "---") continue;

        const fields: Array<SearchIndexField | null> = [makeField("title", card.name ?? "")];
        if (card.description) fields.push(makeField("description", stripHtml(card.description)));
        for (const task of card.tasks ?? []) fields.push(makeField("task", task?.name ?? ""));
        for (const tag of card.tags ?? []) fields.push(makeField("tag", tag?.text ?? ""));
        for (const link of card.links ?? []) {
          if (!link?.url) continue;
          fields.push(makeField("link", link.title ? `${link.title} ${link.url}` : link.url));
        }
        for (const doc of card.documents ?? []) {
          if (!doc?.path) continue;
          const name = documentDisplayName(doc.path);
          fields.push(makeField("documentName", documentFileName(doc.path), name));
          const content = documentTexts.get(normalizeDocumentPath(doc.path));
          if (content) fields.push(makeField("documentContent", content, name));
        }

        index.push({
          boardId: board.id,
          boardTitle: board.title,
          columnId: column.id,
          columnTitle: column.title,
          cardId: card.id,
          cardName: card.name ?? "",
          fields: fields.filter((f): f is SearchIndexField => f !== null),
        });
      }
    }
  }

  return index;
}

/**
 * Splits the query into lower-cased, distinct terms.
 * Returns an empty list when the trimmed query is shorter than MIN_QUERY_LENGTH.
 */
export function parseQuery(query: string): Array<string> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  return [...new Set(trimmed.toLowerCase().split(/\s+/).filter((t) => t.length > 0))];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termsRegExp(terms: Array<string>): RegExp {
  // longest first, so "abc" wins over "ab" at the same position
  const sorted = [...terms].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(sorted.join("|"), "giu");
}

/** Splits text into plain and matching segments (case-insensitive). */
export function highlightSegments(text: string, terms: Array<string>): Array<SnippetSegment> {
  if (!text) return [];
  if (terms.length === 0) return [{ text, match: false }];

  const segments: Array<SnippetSegment> = [];
  let last = 0;
  for (const m of text.matchAll(termsRegExp(terms))) {
    const start = m.index ?? 0;
    if (m[0].length === 0) continue;
    if (start > last) segments.push({ text: text.slice(last, start), match: false });
    segments.push({ text: m[0], match: true });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments;
}

/** About SNIPPET_LENGTH characters around the first match of any term, with highlighted terms. */
export function buildSnippet(text: string, terms: Array<string>, length = SNIPPET_LENGTH): Array<SnippetSegment> {
  const first = terms.length > 0 ? termsRegExp(terms).exec(text) : null;
  const matchIndex = first?.index ?? 0;
  const matchEnd = matchIndex + (first?.[0].length ?? 0);

  let start = Math.max(0, matchIndex - SNIPPET_LEAD);
  let end = Math.min(text.length, start + length);
  // use the full length when the match is near the end of the text
  start = Math.max(0, end - length);

  // avoid cutting words at the edges if a nearby space allows it (never cutting into the match)
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < matchIndex && space - start < WORD_SNAP_DISTANCE) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space >= matchEnd && end - space < WORD_SNAP_DISTANCE) end = space;
  }

  const segments = highlightSegments(text.slice(start, end), terms);
  if (start > 0) segments.unshift({ text: "…", match: false });
  if (end < text.length) segments.push({ text: "…", match: false });
  return segments;
}

/**
 * Cards that contain every term somewhere in their fields (AND), grouped by board in store order.
 * Each card appears once; the shown field is the one containing most terms (ties: FIELD_PRIORITY).
 */
export function searchIndex(index: Array<SearchIndexCard>, terms: Array<string>): Array<SearchResultGroup> {
  if (terms.length === 0) return [];

  const groups: Array<SearchResultGroup> = [];
  const groupByBoard = new Map<string, SearchResultGroup>();

  for (const card of index) {
    const allFound = terms.every((term) => card.fields.some((f) => f.lower.includes(term)));
    if (!allFound) continue;

    let best: SearchIndexField | null = null;
    let bestCount = 0;
    for (const field of card.fields) {
      const count = terms.filter((term) => field.lower.includes(term)).length;
      if (count === 0) continue;
      const better =
        best === null ||
        count > bestCount ||
        (count === bestCount && FIELD_PRIORITY.indexOf(field.field) < FIELD_PRIORITY.indexOf(best.field));
      if (better) {
        best = field;
        bestCount = count;
      }
    }
    if (!best) continue;

    let group = groupByBoard.get(card.boardId);
    if (!group) {
      group = { boardId: card.boardId, boardTitle: card.boardTitle, hits: [] };
      groupByBoard.set(card.boardId, group);
      groups.push(group);
    }

    group.hits.push({
      boardId: card.boardId,
      boardTitle: card.boardTitle,
      columnId: card.columnId,
      columnTitle: card.columnTitle,
      cardId: card.cardId,
      cardName: card.cardName,
      field: best.field,
      detail: best.detail,
      snippet: buildSnippet(best.text, terms),
    });
  }

  return groups;
}

/** Number of hits over all groups. */
export function countHits(groups: Array<SearchResultGroup>): number {
  return groups.reduce((sum, group) => sum + group.hits.length, 0);
}
