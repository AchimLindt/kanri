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

import type {
  Board,
  Card,
  ReminderLeadTime,
  ReminderStage,
} from "@/types/kanban-types";
import { isSeparatorCard } from "@/utils/cardArchive";

// Pure helpers for due date reminders and the today view (spec docs/specs/reminders.md).
// No store, DOM or Tauri access; due dates are compared as local calendar days.

export const REMINDER_LEAD_TIMES: ReadonlyArray<ReminderLeadTime> = ["none", "1d", "3d", "7d"];
export const DEFAULT_REMINDER_LEAD_TIME: ReminderLeadTime = "1d";
export const REMINDER_STAGES: ReadonlyArray<ReminderStage> = ["lead", "due", "overdue"];

// how often the reminder check (and the daily archive run) is triggered
export const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;

export type StartPage = "boards" | "today";
export const START_PAGES: ReadonlyArray<StartPage> = ["boards", "today"];
export const DEFAULT_START_PAGE: StartPage = "boards";

export type TodaySection = "overdue" | "today" | "next7" | "later";
export const TODAY_SECTIONS: ReadonlyArray<TodaySection> = ["overdue", "today", "next7", "later"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isReminderLeadTime(value: unknown): value is ReminderLeadTime {
  return typeof value === "string" && (REMINDER_LEAD_TIMES as ReadonlyArray<string>).includes(value);
}

export function normalizeReminderLeadTime(
  value: unknown,
  fallback: ReminderLeadTime = DEFAULT_REMINDER_LEAD_TIME
): ReminderLeadTime {
  return isReminderLeadTime(value) ? value : fallback;
}

export function normalizeStartPage(value: unknown): StartPage {
  return value === "today" || value === "boards" ? value : DEFAULT_START_PAGE;
}

// keeps only boolean entries of known sections
export function normalizeTodaySectionsCollapsed(value: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const section of TODAY_SECTIONS) {
    const entry = (value as Record<string, unknown>)[section];
    if (typeof entry === "boolean") result[section] = entry;
  }
  return result;
}

// number of days before the due date, null = no lead reminder
export function leadTimeDays(leadTime: ReminderLeadTime): number | null {
  switch (leadTime) {
    case "1d":
      return 1;
    case "3d":
      return 3;
    case "7d":
      return 7;
    default:
      return null;
  }
}

// the card setting wins, a missing (or invalid) one means "use the global setting"
export function effectiveLeadTime(card: Card, defaultLeadTime: ReminderLeadTime): ReminderLeadTime {
  return isReminderLeadTime(card.reminderLeadTime) ? card.reminderLeadTime : defaultLeadTime;
}

// midnight (local time) of the day of the given date
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// adds calendar days in local time and keeps the time of day (also across DST changes)
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

// due dates are Date objects in memory and ISO strings after loading from the store
export function parseDueDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// calendar days from the local day of `from` to the local day of `to` (negative = in the past)
export function dayDifference(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / MS_PER_DAY);
}

// completed = due date marked as completed or card in the done column (completedAt set)
export function isCardCompleted(card: Card): boolean {
  return card.isDueDateCompleted === true || !!card.completedAt;
}

// cards that take part in reminders and the today view: real cards with an id, a valid due
// date and not completed (archived cards are not part of board.columns and never show up)
export function isReminderCandidate(card: Card): boolean {
  return (
    !!card.id &&
    !isSeparatorCard(card) &&
    parseDueDate(card.dueDate) !== null &&
    !isCardCompleted(card)
  );
}

// days until the card is due (0 = today, negative = overdue), null without a valid due date
export function dueInDays(card: Card, now: Date): number | null {
  const due = parseDueDate(card.dueDate);
  return due ? dayDifference(now, due) : null;
}

/**
 * Current reminder stage of a card: "overdue" (due day in the past), "due" (due today),
 * "lead" (lead time reached, i.e. due in 1..leadDays days) or null. Completed cards and
 * cards without a valid due date have no stage.
 */
export function dueStage(card: Card, now: Date, defaultLeadTime: ReminderLeadTime): ReminderStage | null {
  if (isCardCompleted(card)) return null;
  const days = dueInDays(card, now);
  if (days === null) return null;
  if (days < 0) return "overdue";
  if (days === 0) return "due";
  const lead = leadTimeDays(effectiveLeadTime(card, defaultLeadTime));
  if (lead !== null && days <= lead) return "lead";
  return null;
}

// "lead" and "due" are sent once, "overdue" once per local calendar day
export function isReminderPending(card: Card, stage: ReminderStage, now: Date): boolean {
  const sent = card.remindersSent?.[stage];
  if (!sent) return true;
  if (stage !== "overdue") return false;
  const sentDate = parseDueDate(sent);
  if (!sentDate) return true;
  return dayDifference(sentDate, now) !== 0;
}

export interface CardLocation {
  boardId: string;
  boardTitle: string;
  columnId: string;
  columnTitle: string;
  card: Card;
}

export interface DueReminder extends CardLocation {
  stage: ReminderStage;
  days: number; // days until due (negative = overdue)
}

/** All reminders that have to be sent now, in board, column and card order. */
export function remindersDue(
  boards: ReadonlyArray<Board>,
  now: Date,
  settings: { reminderLeadTime: ReminderLeadTime }
): Array<DueReminder> {
  const result: Array<DueReminder> = [];
  for (const board of boards) {
    for (const column of board.columns ?? []) {
      for (const card of column.cards ?? []) {
        if (!isReminderCandidate(card)) continue;
        const stage = dueStage(card, now, settings.reminderLeadTime);
        if (!stage || !isReminderPending(card, stage, now)) continue;
        result.push({
          boardId: board.id,
          boardTitle: board.title,
          columnId: column.id,
          columnTitle: column.title,
          card,
          stage,
          days: dueInDays(card, now) ?? 0,
        });
      }
    }
  }
  return result;
}

export interface DueCardEntry extends CardLocation {
  dueDate: Date;
  days: number; // days until due (negative = overdue)
  section: TodaySection;
}

export function todaySectionFor(days: number): TodaySection {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "next7";
  return "later";
}

/** All open cards with a due date, sorted by due date, then title. */
export function collectDueCards(boards: ReadonlyArray<Board>, now: Date): Array<DueCardEntry> {
  const result: Array<DueCardEntry> = [];
  for (const board of boards) {
    for (const column of board.columns ?? []) {
      for (const card of column.cards ?? []) {
        if (!isReminderCandidate(card)) continue;
        const dueDate = parseDueDate(card.dueDate);
        if (!dueDate) continue;
        const days = dayDifference(now, dueDate);
        result.push({
          boardId: board.id,
          boardTitle: board.title,
          columnId: column.id,
          columnTitle: column.title,
          card,
          dueDate,
          days,
          section: todaySectionFor(days),
        });
      }
    }
  }
  return result.sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.card.name.localeCompare(b.card.name)
  );
}

export function groupDueCards(
  entries: ReadonlyArray<DueCardEntry>
): Record<TodaySection, Array<DueCardEntry>> {
  const groups: Record<TodaySection, Array<DueCardEntry>> = { overdue: [], today: [], next7: [], later: [] };
  for (const entry of entries) groups[entry.section].push(entry);
  return groups;
}

/** Badge count: open cards that are overdue or due today. */
export function countAttentionCards(boards: ReadonlyArray<Board>, now: Date): number {
  let count = 0;
  for (const board of boards) {
    for (const column of board.columns ?? []) {
      for (const card of column.cards ?? []) {
        if (!isReminderCandidate(card)) continue;
        const days = dueInDays(card, now);
        if (days !== null && days <= 0) count++;
      }
    }
  }
  return count;
}

/**
 * Postpones a due date by `days` calendar days and keeps the time of day. Overdue dates are
 * postponed starting from today, so "+1 day" on an overdue card means tomorrow.
 */
export function postponeDueDate(dueDate: Date, now: Date, days: number): Date {
  let base = dueDate;
  if (dayDifference(now, dueDate) < 0) {
    base = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      dueDate.getHours(), dueDate.getMinutes(), dueDate.getSeconds(), dueDate.getMilliseconds()
    );
  }
  return addDays(base, days);
}

// "YYYY-MM-DD" of the local day, the value format of <input type="date">
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// sets the local day from an <input type="date"> value and keeps the time of day; null if invalid
export function withDateInputValue(dueDate: Date, value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const result = new Date(
    year, month, day,
    dueDate.getHours(), dueDate.getMinutes(), dueDate.getSeconds(), dueDate.getMilliseconds()
  );
  if (result.getFullYear() !== year || result.getMonth() !== month || result.getDate() !== day) return null;
  return result;
}
