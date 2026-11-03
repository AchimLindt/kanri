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

export declare interface Board {
  background?: BackgroundSettings | null;
  columns: Array<Column>;
  id: string;
  lastEdited?: Date | string;
  createdAt?: Date | string;
  title: string;
  globalTags?: Array<Tag> | null;
  archivedCards?: Array<ArchivedCard>;
}

export declare interface BackgroundSettings {
  blur: string;
  brightness: string;
  src: string;
}

export declare interface Column {
  cards: Array<Card>;
  id: string;
  title: string;
  defaultCardColor?: string | null;
  backgroundColor?: string | null;
  collapsed?: boolean;
  isDoneColumn?: boolean; // at most one done column per board
}

export declare interface Task {
  finished: boolean;
  id?: string;
  name: string;
}

export declare interface Tag {
  id?: string;
  text: string;
  style?: string;
  color?: string | null;
}

export declare interface CardDocument {
  id: string; // generateUniqueID()
  path: string; // absolute path of the linked Markdown file
}

export declare interface CardLink {
  id: string; // generateUniqueID()
  url: string; // normalized URL (http, https or mailto)
  title?: string; // optional display name
}

export declare interface Card {
  color?: string;
  description?: string;
  dueDate?: Date | string | null;
  id?: string;
  isDueDateCounterRelative?: boolean;
  isDueDateCompleted?: boolean;
  name: string;
  tasks?: Array<Task>;
  tags?: Array<Tag> | null;
  documents?: Array<CardDocument> | null;
  links?: Array<CardLink> | null;
  completedAt?: string; // ISO timestamp, set while the card is in the board's done column
  reminderLeadTime?: ReminderLeadTime; // overrides the global setting, missing = global setting
  remindersSent?: RemindersSent; // cleared whenever the due date changes
  source?: CardSource; // origin of the card, set outside the app (meeting summary import)
}

export declare type ReminderLeadTime = "none" | "1d" | "3d" | "7d";

export declare type ReminderStage = "lead" | "due" | "overdue";

// ISO timestamp of the last notification per stage
export declare interface RemindersSent {
  lead?: string;
  due?: string;
  overdue?: string;
}

export declare interface CardSource {
  path: string; // Markdown file the card was created from
  row: number; // row of the action point in that file
}

export declare interface ArchivedCard {
  card: Card;
  columnId: string; // column the card was archived from (restore target)
  columnTitle: string; // title of that column at archive time (display)
  archivedAt: string; // ISO timestamp
}

export declare interface Theme {
  accent: string;
  accentDarker: string;
  bgPrimary: string;
  elevation1: string;
  elevation2: string;
  elevation3: string;
  text: string;
  textButtons: string;
  textD1: string;
  textD2: string;
  textD3: string;
  textD4: string;
}

export declare type ThemeIdentifiers =
  | "catppuccin"
  | "custom"
  | "dark"
  | "light"
  | "auto";

export default {
  Board,
  Card,
  Column,
  ThemeIdentifiers,
};
