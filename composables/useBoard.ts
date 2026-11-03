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

import { computed, toValue } from "vue";
import type { Ref } from "vue";
import type { Board, Card, Column, Tag } from "@/types/kanban-types";
import { useBoardsStore } from "@/stores/boards";

export function useBoard(id: string | Ref<string>) {
  const store = useBoardsStore();

  const board = computed<Board | null>(() => store.boardById(toValue(id)));

  const isPinned = computed(() => store.isPinned(toValue(id)));

  async function init() {
    await store.init();

    // in case boards were changed externally
    if (!board.value) {
      await store.forceReloadBoards();
    }
  }

  // manual save, usually not needed due to autosave
  async function save() {
    await store.save();
  }

  // Board
  function renameBoard(title: string) {
    if (!board.value) return;
    store.renameBoard(board.value.id, title);
  }
  function togglePin() {
    if (!board.value) return;
    store.togglePin(board.value.id);
  }
  function updateBoardPin() {
    if (!board.value) return;
    store.updateBoardPin(board.value.id);
  }
  function duplicate() {
    if (!board.value) return;
    store.duplicateBoard(board.value.id);
  }
  function remove() {
    if (!board.value) return;
    store.removeBoard(board.value.id);
  }

  // Columns
  function addColumn(title?: string) {
    if (!board.value) return;
    store.addColumn(board.value.id, title);
  }
  function removeColumn(columnId: string) {
    if (!board.value) return;
    store.removeColumn(board.value.id, columnId);
  }
  function reorderColumns(next: Column[]) {
    if (!board.value) return;
    store.reorderColumns(board.value.id, next);
  }
  function setColumnTitle(columnId: string, title: string) {
    if (!board.value) return;
    store.setColumnTitle(board.value.id, columnId, title);
  }
  function setColumnDefaultCardColor(columnId: string, color: string | null) {
    if (!board.value) return;
    store.setColumnDefaultCardColor(board.value.id, columnId, color);
  }
  function setColumnBackgroundColor(columnId: string, color: string | null) {
    if (!board.value) return;
    store.setColumnBackgroundColor(board.value.id, columnId, color);
  }
  function setColumnCollapsed(columnId: string, collapsed: boolean) {
    if (!board.value) return;
    store.setColumnCollapsed(board.value.id, columnId, collapsed);
  }
  function applyColumnDefaultCardColorToAllCards(columnId: string) {
    if (!board.value) return;
    store.applyColumnDefaultCardColorToAllCards(board.value.id, columnId);
  }

  // Cards
  function createCard(columnId: string, card: Card, addToTop?: boolean) {
    if (!board.value) return;
    if (!addToTop) addToTop = false;
    store.createCard(board.value.id, columnId, card, addToTop);
  }

  function duplicateCard(columnId: string, cardId: string | undefined) {
    if (!board.value) return;
    if (!cardId) return;
    store.duplicateCard(board.value.id, columnId, cardId);
  }

  function deleteCard(columnId: string, cardId: string | undefined) {
    if (!board.value) return;
    if (!cardId) return;
    store.deleteCard(board.value.id, columnId, cardId);
  }
  
  function deleteAllColumnCards(columnId: string) {
    if (!board.value) return;
    store.deleteAllColumnCards(board.value.id, columnId);
  }

  function mutateCard(columnId: string, cardId: string, mut: Parameters<typeof store.mutateCard>[3]) {
    if (!board.value) return;
    store.mutateCard(board.value.id, columnId, cardId, mut);
  }

  function reorderCards(columnId: string, nextCards: Card[]) {
    if (!board.value) return;
    store.reorderCards(board.value.id, columnId, nextCards);
  }

  const setCardName = (
    columnId: string,
    cardId: string | undefined,
    name: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;

    mutateCard(columnId, cardId, (card) => {
      card.name = name;
    });
  };

  const setCardDescription = (
    columnId: string,
    cardId: string | undefined,
    description: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;

    mutateCard(columnId, cardId, (card) => {
      card.description = description;
    });
  };

  const setCardColor = (
    columnId: string,
    cardId: string | undefined,
    color: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;

    mutateCard(columnId, cardId, (card) => {
      card.color = color;
    });
  };

  const setCardTasks = (
    columnId: string,
    cardId: string | undefined,
    tasks: Card["tasks"]
  ) => {
    if (!board.value) return;
    if (!cardId) return;

    mutateCard(columnId, cardId, (card) => {
      card.tasks = tasks;
    });
  };

  const setCardDueDate = (
    columnId: string,
    cardId: string | undefined,
    dueDate: Date | null,
    isCounterRelative: boolean,
    isCompleted: boolean
  ) => {
    if (!board.value) return;
    if (!cardId) return;

    mutateCard(columnId, cardId, (card) => {
      card.dueDate = dueDate;
      card.isDueDateCounterRelative = isCounterRelative;
      card.isDueDateCompleted = isCompleted;
    });
  };

  const setCardTags = (
    columnId: string,
    cardId: string | undefined,
    tags: Array<Tag>
  ) => {
    if (!board.value) return;
    if (!cardId) return;

    mutateCard(columnId, cardId, (card) => {
      card.tags = tags;
    });
  };

  // Card documents
  const addCardDocument = (
    columnId: string,
    cardId: string | undefined,
    path: string
  ): string | null => {
    if (!board.value) return null;
    if (!cardId) return null;
    return store.addCardDocument(board.value.id, columnId, cardId, path);
  };

  const removeCardDocument = (
    columnId: string,
    cardId: string | undefined,
    documentId: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;
    store.removeCardDocument(board.value.id, columnId, cardId, documentId);
  };

  const setCardDocumentPath = (
    columnId: string,
    cardId: string | undefined,
    documentId: string,
    path: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;
    store.setCardDocumentPath(board.value.id, columnId, cardId, documentId, path);
  };

  const findCardDocument = (cardId: string, documentId: string) => {
    if (!board.value) return null;
    return store.findCardDocument(board.value.id, cardId, documentId);
  };

  // Card links
  const addCardLink = (
    columnId: string,
    cardId: string | undefined,
    url: string,
    title?: string
  ): string | null => {
    if (!board.value) return null;
    if (!cardId) return null;
    return store.addCardLink(board.value.id, columnId, cardId, url, title);
  };

  const updateCardLink = (
    columnId: string,
    cardId: string | undefined,
    linkId: string,
    url: string,
    title?: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;
    store.updateCardLink(board.value.id, columnId, cardId, linkId, url, title);
  };

  const removeCardLink = (
    columnId: string,
    cardId: string | undefined,
    linkId: string
  ) => {
    if (!board.value) return;
    if (!cardId) return;
    store.removeCardLink(board.value.id, columnId, cardId, linkId);
  };

  // (Global) Card Tags
  const addGlobalTag = (tag: Tag) => {
    if (!board.value) return;
    store.addGlobalTag(board.value.id, tag);
  };

  const removeGlobalTag = (tagId: string) => {
    if (!board.value) return;
    store.removeGlobalTag(board.value.id, tagId);
  };

  const setGlobalTagColor = (tagId: string, color: string) => {
    if (!board.value) return;
    store.setGlobalTagColor(board.value.id, tagId, color);
  };

  const updateGlobalTagName = (tagId: string, newName: string) => {
    if (!board.value) return;
    store.updateGlobalTagName(board.value.id, tagId, newName);
  };

  return {
    // state
    board,
    isPinned,

    // lifecycle
    init,
    save,

    // board actions
    renameBoard,
    togglePin,
    updateBoardPin,
    duplicate,
    remove,

    // column actions
    addColumn,
    removeColumn,
    reorderColumns,
    setColumnTitle,
    setColumnDefaultCardColor,
    setColumnBackgroundColor,
    setColumnCollapsed,
    applyColumnDefaultCardColorToAllCards,

    // card actions
    createCard,
    deleteCard,
    deleteAllColumnCards,
    duplicateCard,
    mutateCard,
    reorderCards,
    setCardName,
    setCardDescription,
    setCardColor,
    setCardTasks,
    setCardDueDate,
    setCardTags,

    // card documents
    addCardDocument,
    removeCardDocument,
    setCardDocumentPath,
    findCardDocument,

    // card links
    addCardLink,
    updateCardLink,
    removeCardLink,

    // global tags
    addGlobalTag,
    removeGlobalTag,
    setGlobalTagColor,
    updateGlobalTagName,
  };
}