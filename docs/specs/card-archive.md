<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Erledigt-Spalte und Karten-Archiv

Status: implementiert (Branch `feat/card-archive`, abgezweigt von `feat/full-text-search`, 2026-11-03), manueller UI-Test gemäß §9 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`, verwandte Specs: `docs/specs/column-colors.md` (Spalten-Hook beim Eintritt einer Karte), `docs/specs/document-history.md` (täglicher Lauf beim App-Start), `docs/specs/full-text-search.md`. Die Entscheidungen stammen aus einer Grill-Session mit dem Nutzer am 2026-11-03; sie sind nicht neu zu verhandeln. Das spätere Reminder-Feature nutzt `completedAt` und die Erledigt-Spalte als „erledigt"-Signal.

## 1. Ziel

Erledigte Karten sollen das Board nicht dauerhaft füllen, aber auch nie verloren gehen. Je Board lässt sich eine Spalte als Erledigt-Spalte markieren. Karten, die dort länger als eine einstellbare Anzahl Tage (Default 120) liegen, wandern automatisch in ein Archiv des Boards. Man kann Karten auch manuell archivieren. Eine Archiv-Seite je Board zeigt, durchsucht, stellt wieder her und löscht endgültig. Automatisch gelöscht wird nie.

## 2. Verhalten

### 2.1 Erledigt-Spalte

- Im Spalten-Dropdown: „Als Erledigt-Spalte markieren" bzw. auf der markierten Spalte „Markierung aufheben". Je Board höchstens eine Erledigt-Spalte; das Markieren einer anderen Spalte hebt die alte Markierung auf.
- Kennzeichen im Spaltenkopf: Häkchen-Icon (`CheckCircleIcon`, heroicons solid) neben dem Titel, Tooltip (`title`) „Erledigt-Spalte: Karten werden nach {days} Tagen automatisch archiviert".
- **Eintritt** einer Karte in die Erledigt-Spalte (neu angelegt, per Drag & Drop, per „Verschieben nach", auch board-übergreifend, oder per Wiederherstellen aus dem Archiv): `completedAt = jetzt` (ISO-String) und `isDueDateCompleted = true`. Ein vorhandener `completedAt` wird dabei überschrieben.
- **Eintritt in eine andere Spalte** (= Verlassen der Erledigt-Spalte): `completedAt` wird gelöscht, `isDueDateCompleted` bleibt unverändert. Umsortieren innerhalb einer Spalte ändert nichts.
- **Markieren:** Für alle Karten, die schon in der Spalte liegen, wird `completedAt = jetzt` gesetzt (nur wenn noch keiner gesetzt ist) und `isDueDateCompleted = true`.
- **Markierung aufheben** (oder auf eine andere Spalte verlegen): Bei allen Karten der bisherigen Erledigt-Spalte wird `completedAt` gelöscht, weil sie nicht mehr in einer Erledigt-Spalte liegen.
- Karte duplizieren übernimmt `completedAt` (die Kopie liegt in derselben Spalte). Spalte löschen löscht ihre Karten wie bisher, nichts wandert ins Archiv.

### 2.2 Automatische Archivierung

- Globale Einstellung „Erledigte Karten archivieren nach … Tagen" (`archiveAfterDays`, ganze Zahl ≥ 1, Default 120).
- Beim App-Start, nachdem Einstellungen und Boards geladen sind (`layouts/default.vue` nach `boards.init()`, ohne `await`, wie `runScheduledDocumentHistoryCleanup`), läuft höchstens einmal je 24 Stunden (`CARD_ARCHIVE_INTERVAL_MS`, Zeitpunkt des letzten Laufs in `cardArchiveLastRun`) die Archivierung über alle Boards:
  1. Jede Karte in einer Erledigt-Spalte, deren `completedAt` mindestens `archiveAfterDays × 24 h` zurückliegt, wird archiviert (§2.3).
  2. Karten in einer Erledigt-Spalte ohne gültigen `completedAt` (Altdaten, Import) bekommen `completedAt = jetzt`; sie werden ab dann gezählt, nicht sofort archiviert.
  3. Trennkarten (`---`) werden nie automatisch archiviert.
- Fehler werden nur protokolliert; der Lauf blockiert nie den App-Start. Ergebnis in der Konsole: „Card archive: archived n cards".
- Nie automatisches Löschen.

### 2.3 Archivieren

- Archivieren entfernt die Karte aus ihrer Spalte (in place, `splice`) und hängt `{ card, columnId, columnTitle, archivedAt }` an `board.archivedCards` an. `card` ist die unveränderte Karte (inkl. `completedAt`, Dokumenten, Links), `columnTitle` der Spaltentitel zum Zeitpunkt des Archivierens (die Spalte kann später umbenannt oder gelöscht werden). Karten ohne `id` (Altdaten) bekommen beim Archivieren eine.
- **Manuell, einzelne Karte:** Kontextmenü der Karte → „Archivieren", sofort, ohne Rückfrage, aus jeder Spalte (auch Trennkarten).
- **Manuell, ganze Spalte:** im Dropdown der Erledigt-Spalte „Alle Karten archivieren" mit Rückfrage (`ModalConfirmation`, „{count} Karten aus der Spalte '{columnName}' archivieren? Sie können im Archiv des Boards wiederhergestellt werden."). Trennkarten bleiben stehen. Der Eintrag erscheint nur in der Erledigt-Spalte.

### 2.4 Archiv-Seite

- Route `/kanban/<id>/archive`. Datei `pages/kanban/archive/[id].vue` mit `definePageMeta({ path: "/kanban/:id/archive" })`. Begründung: Eine Datei `pages/kanban/[id]/archive.vue` neben `pages/kanban/[id].vue` macht `[id].vue` in Nuxt zur Elternroute (verschachtelte Route, bräuchte `<NuxtPage>` im Board), und das Umbenennen von `[id].vue` nach `[id]/index.vue` würde die zentrale Board-Seite für alle folgenden Branches verschieben. Die Pfad-Überschreibung liefert die gewünschte URL ohne beides.
- Erreichbar über das Board-Menü (⋯) „Archiv (n)", n = Anzahl archivierter Karten (auch 0).
- Unbekannte Board-ID → Weiterleitung auf `/` (wie die Board-Seite).
- Liste, neueste Archivierung zuerst. Je Eintrag: Kartentitel, „Spalte: <ursprüngliche Spalte>", „Archiviert am <Datum, Uhrzeit>" (`Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })`), Tags (`KanbanTagDisplay`), Buttons „Wiederherstellen" und „Endgültig löschen".
- **Suchfeld** filtert die Liste: Eingabe an Leerraum in Wörter zerlegt, case-insensitiv, jedes Wort muss in Titel oder Beschreibung (HTML entfernt mit `stripHtml` aus `utils/search.ts`) vorkommen. Ab einem Zeichen, ohne Entprellen. `Escape` im Feld leert es.
- **Wiederherstellen:** Karte zurück in die ursprüngliche Spalte (Vergleich über `columnId`), falls es sie noch gibt, sonst in die erste Spalte; angehängt unten. `completedAt` wird entfernt; ist die Zielspalte die Erledigt-Spalte, gilt das als Eintritt (§2.1) und setzt einen neuen `completedAt`, sonst würde die Karte beim nächsten Lauf sofort wieder archiviert. Gibt es die ursprüngliche Spalte nicht mehr, zeigt der Button einen Tooltip mit der Zielspalte. Hat das Board keine Spalten, ist der Button deaktiviert (Tooltip „Das Board hat keine Spalte").
- **Endgültig löschen:** Rückfrage (`ModalConfirmation` + `useConfirmDialog`), dann wird der Eintrag entfernt. Verknüpfte Dokumente bleiben unangetastet (wie beim Löschen einer Karte).
- Zurück-Button (`ArrowLeftIcon`, „Zurück zum Board") nach `/kanban/<id>`.
- Leerer Zustand: „Keine archivierten Karten. Karten in der Erledigt-Spalte werden nach {days} Tagen automatisch archiviert; einzelne Karten lassen sich über das Kontextmenü archivieren." Bei Suche ohne Treffer: „Keine archivierte Karte passt zur Suche."

### 2.5 Volltextsuche

- Archivierte Karten werden mitindexiert (alle Felder wie aktive Karten, auch Dokumentinhalte). Ein Treffer zeigt die ursprüngliche Spalte und eine Kennzeichnung „Archiv". Klick öffnet die Archiv-Seite des Boards (kein Karten-Dialog).

### 2.6 Export, Import, Duplizieren, Dokument-Historie

- `archivedCards` ist Teil des Board-JSON (Export über `JSON.stringify(board)`), das zod-Schema kennt das Feld optional, Import erhält es.
- „Board duplizieren" kopiert per JSON-Tiefenkopie, das Archiv wird also mitkopiert.
- Die automatische Bereinigung der Dokument-Historie (`runScheduledDocumentHistoryCleanup`) zählt Dokumente archivierter Karten als referenziert, sonst würde sie deren Historie als verwaist löschen.

## 3. UI

### 3.1 Spalte (`components/kanban/Column.vue`)

- Neue Prop `isDoneColumn?: boolean`; neue Emits `setDoneColumn(columnId, isDone: boolean)`, `archiveAllColumnCards(columnId)`, `archiveCard(columnId, cardId)` (von `Card.vue` durchgereicht).
- Häkchen-Icon nach dem Titel (vor dem Farbpunkt), Größe je Zoomstufe als `computed` (`size-4`, `size-4`, `size-5`, `size-6`), Farbe `columnTextClass` oder `text-accent`, wenn die Spalte keine Hintergrundfarbe hat.
- Dropdown: nach „Spaltenfarben…" der Umschalter, in der Erledigt-Spalte vor „Alle Karten löschen" zusätzlich „Alle Karten archivieren".

### 3.2 Karte (`components/kanban/Card.vue`)

Kontextmenü: Eintrag „Archivieren" zwischen „Duplizieren" und „Löschen", emittiert `archiveCard(card.id)`.

### 3.3 Board-Seite (`pages/kanban/[id].vue`)

- Bindet die neuen Spalten-Events: `@setDoneColumn` → `board.setDoneColumn(isDone ? id : null)`, `@archiveCard="board.archiveCard"`, `@archiveAllColumnCards` → Rückfrage (vierte Variante des bestehenden Musters mit `useConfirmDialog` und `openModalWithCustomDescription`) → `board.archiveAllColumnCards`.
- Board-Menü, Gruppe 1 nach „Exportieren": `PhArchive` + „Archiv (n)", navigiert nach `/kanban/<id>/archive`.

### 3.4 Archiv-Seite (`pages/kanban/archive/[id].vue`)

Layout wie die Suchseite (`default`-Layout, `main` mit `pb-8 pl-8 pr-12 pt-6`): Zurück-Button (Klassen wie in `pages/document.vue`), Überschrift `text-4xl font-bold` „Archiv", Untertitel `text-dim-3` mit Boardtitel, Suchfeld im Rahmen wie auf der Suchseite (`max-w-3xl`), Anzahl (`text-dim-2 text-sm`), Liste `max-w-5xl` mit Einträgen `bg-elevation-1 rounded-md px-4 py-2`. Buttons: „Wiederherstellen" `bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1`, „Endgültig löschen" gleiche Klassen plus `text-red-500`.

### 3.5 Settings (`pages/settings.vue`)

Neue Zeile im Abschnitt „Preferences" nach dem Markdown-Standardordner: Überschrift, Subtext, rechts Zahlenfeld (`type="number"`, `min="1"`, `step="1"`, `w-24`, Klassen `bg-elevation-2 border-elevation-3 rounded-md border px-2 py-1`) plus „Tage". Übernommen bei `change`; ungültige Eingaben (leer, < 1, keine Zahl) setzen das Feld auf den gespeicherten Wert zurück, Nachkommastellen werden abgeschnitten.

### 3.6 Suchseite (`pages/search.vue`)

Rechts in der ersten Trefferzeile vor „Spalte · Trefferfeld" ein Badge „Archiv" (`bg-elevation-3 rounded px-1.5 text-xs`), nur bei archivierten Treffern.

## 4. Datenmodell

`types/kanban-types.d.ts`:

```ts
// Column:
isDoneColumn?: boolean;        // höchstens eine Spalte je Board
// Card:
completedAt?: string;          // ISO-Zeitstempel, gesetzt solange die Karte in der Erledigt-Spalte liegt
// Board:
archivedCards?: Array<ArchivedCard>;

export declare interface ArchivedCard {
  card: Card;
  columnId: string;      // Spalte beim Archivieren (für das Wiederherstellen)
  columnTitle: string;   // Spaltentitel beim Archivieren (Anzeige)
  archivedAt: string;    // ISO-Zeitstempel
}
```

`types/json-schemas.ts`: Column `isDoneColumn: z.boolean().optional()`, Card `completedAt: z.string().optional()`, Board `archivedCards: z.array(z.object({ card: kanriCardSchema, columnId: z.string(), columnTitle: z.string(), archivedAt: z.string() })).optional()`. Zusätzlich bekommt das Karten-Schema die bisher fehlenden `isDueDateCompleted` und `isDueDateCounterRelative` (`z.boolean().optional()`), weil `isDueDateCompleted` zusammen mit `completedAt` gesetzt wird und ein Re-Import es sonst verwirft.

Settings (`stores/settings.ts`, Tauri-Store-Keys gleichnamig): `archiveAfterDays: number` (Default `DEFAULT_ARCHIVE_AFTER_DAYS = 120`, beim Laden über `normalizeArchiveAfterDays` geprüft) mit `setArchiveAfterDays`, `cardArchiveLastRun: number` (Epoch-Millisekunden, `0` = nie) mit `setCardArchiveLastRun`.

## 5. Store-Logik (`stores/boards.ts` + Fassade `composables/useBoard.ts`)

| Aktion | Verhalten |
| --- | --- |
| `_applyDoneColumnState(col, card)` | interner Hook beim Eintritt einer Karte in `col` (Muster `_applyColumnDefaultCardColor`): Erledigt-Spalte → `completedAt = jetzt`, `isDueDateCompleted = true`; sonst `delete card.completedAt` |
| `createCard`, `moveCard`, `reorderCards` (bestehend) | rufen den Hook an denselben Stellen wie `_applyColumnDefaultCardColor`; `reorderCards` nur für Karten, deren `id` vorher nicht in der Spalte war (Ankunft per Drag & Drop, die Quellspalte ruft nichts auf) |
| `setDoneColumn(boardId, columnId \| null)` | setzt `isDoneColumn` auf genau dieser Spalte (`null` = keine), entfernt es (per `delete`) von allen anderen; Karten der neuen Erledigt-Spalte bekommen `completedAt` (falls fehlend) und `isDueDateCompleted = true`, Karten einer bisherigen verlieren `completedAt`; `lastEdited` |
| `archiveCard(boardId, columnId, cardId)` | archiviert eine Karte (§2.3); `lastEdited` |
| `archiveAllColumnCards(boardId, columnId)` | archiviert alle Karten außer Trennkarten; `lastEdited` |
| `restoreArchivedCard(boardId, cardId)` | §2.4; gibt die Zielspalten-ID zurück oder `null` (kein Eintrag, keine Spalte); `lastEdited` |
| `deleteArchivedCard(boardId, cardId)` | entfernt den Eintrag (`splice`); `lastEdited` |
| `archiveExpiredCards(archiveAfterDays, now)` | §2.2 über alle Boards; gibt die Anzahl archivierter Karten zurück; `lastEdited` nur bei betroffenen Boards |

Alle Arrays werden in place mutiert (`splice`, `push`), siehe ARCHITECTURE §9. `useBoard` spiegelt `setDoneColumn`, `archiveCard`, `archiveAllColumnCards`, `restoreArchivedCard`, `deleteArchivedCard` ohne `boardId`.

Reine Helfer in `utils/cardArchive.ts` (ohne Store/DOM/Tauri, Node-Smoke-Test): `DEFAULT_ARCHIVE_AFTER_DAYS`, `CARD_ARCHIVE_INTERVAL_MS`, `normalizeArchiveAfterDays(value)`, `isSeparatorCard(card)`, `isCompletionExpired(completedAt, archiveAfterDays, now)`, `hasValidCompletedAt(card)`, `archivedCardMatches(entry, query)`, `sortArchivedCards(entries)`, `resolveRestoreColumn(board, entry)`.

`composables/useCardArchive.ts`: `runScheduledCardArchive()` (liest Settings- und Boards-Store, prüft `boards.initialized` und das Intervall, ruft `archiveExpiredCards`, setzt `cardArchiveLastRun`, wirft nie).

## 6. Komponentenänderungen (Übersicht)

- neu: `pages/kanban/archive/[id].vue`, `utils/cardArchive.ts`, `composables/useCardArchive.ts`
- `types/kanban-types.d.ts`, `types/json-schemas.ts`: §4
- `stores/boards.ts`, `composables/useBoard.ts`: §5; `stores/settings.ts`: Settings
- `components/kanban/Column.vue`, `components/kanban/Card.vue`, `pages/kanban/[id].vue`: §3.1–3.3
- `pages/settings.vue`: §3.5
- `layouts/default.vue`: `runScheduledCardArchive()` nach `boards.init()`
- `utils/search.ts` (archivierte Karten im Index, Flag `archived` an Index-Eintrag und Treffer), `composables/useSearch.ts` (Dokumentpfade archivierter Karten einlesen), `pages/search.vue` (Badge, Klickziel): §2.5
- `composables/useDocumentHistory.ts`: Dokumentpfade archivierter Karten zählen als referenziert (§2.6)
- `i18n/locales/en.json`, `de.json`: §7

## 7. i18n-Keys (en + de)

- `components.kanban.column.markDoneColumnAction`: "Mark as done column" / "Als Erledigt-Spalte markieren"
- `components.kanban.column.unmarkDoneColumnAction`: "Remove done column mark" / "Markierung aufheben"
- `components.kanban.column.doneColumnTooltip`: "Done column: cards are archived automatically after {days} days" / "Erledigt-Spalte: Karten werden nach {days} Tagen automatisch archiviert"
- `components.kanban.column.archiveAllCardsAction`: "Archive all cards" / "Alle Karten archivieren"
- `components.kanban.column.archiveAllCardsConfirmationTitle`: "Archive all cards in this column" / "Alle Karten dieser Spalte archivieren"
- `components.kanban.column.archiveAllCardsConfirmation` (Plural, Singular | Plural): "Archive {count} card from the column '{columnName}'? It can be restored from the board archive. | Archive {count} cards …? They can be restored …" / "{count} Karte aus der Spalte '{columnName}' archivieren? Sie kann im Archiv des Boards wiederhergestellt werden. | {count} Karten …? Sie können …"
- `components.kanban.column.archiveAllCardsConfirm`: "Archive" / "Archivieren"
- `components.kanban.card.archiveAction`: "Archive" / "Archivieren"
- `pages.kanban.archiveAction`: "Archive ({count})" / "Archiv ({count})"
- `pages.archive.title`: "Archive" / "Archiv"
- `pages.archive.subtitle`: "Archived cards of the board “{boardName}”" / "Archivierte Karten des Boards „{boardName}“"
- `pages.archive.back`: "Back to board" / "Zurück zum Board"
- `pages.archive.searchPlaceholder`: "Search title and description…" / "Titel und Beschreibung durchsuchen…"
- `pages.archive.count`: "{count} archived card | {count} archived cards" / "{count} archivierte Karte | {count} archivierte Karten"
- `pages.archive.emptyState`: "No archived cards. Cards in the done column are archived automatically after {days} days; single cards can be archived from their context menu." / "Keine archivierten Karten. Karten in der Erledigt-Spalte werden nach {days} Tagen automatisch archiviert; einzelne Karten lassen sich über das Kontextmenü archivieren."
- `pages.archive.noResults`: "No archived card matches the search." / "Keine archivierte Karte passt zur Suche."
- `pages.archive.column`: "Column: {columnName}" / "Spalte: {columnName}"
- `pages.archive.archivedAt`: "Archived {date}" / "Archiviert am {date}"
- `pages.archive.restoreAction`: "Restore" / "Wiederherstellen"
- `pages.archive.restoreToOtherColumn`: "The original column no longer exists, the card is restored to “{columnName}”." / "Die ursprüngliche Spalte gibt es nicht mehr, die Karte wird in „{columnName}“ wiederhergestellt."
- `pages.archive.restoreNoColumn`: "The board has no column." / "Das Board hat keine Spalte."
- `pages.archive.deleteAction`: "Delete permanently" / "Endgültig löschen"
- `pages.archive.deleteConfirmationTitle`: "Delete card permanently" / "Karte endgültig löschen"
- `pages.archive.deleteConfirmation`: "Permanently delete the archived card '{cardName}'? This action is irreversible." / "Die archivierte Karte '{cardName}' endgültig löschen? Diese Aktion ist irreversibel."
- `pages.settings.preferencesArchiveAfterDaysHeading`: "Archive done cards after" / "Erledigte Karten archivieren nach"
- `pages.settings.preferencesArchiveAfterDaysSubtext`: "Cards in a board's done column move to the board archive after this many days. Archived cards are never deleted automatically." / "Karten in der Erledigt-Spalte eines Boards wandern nach so vielen Tagen ins Archiv des Boards. Archivierte Karten werden nie automatisch gelöscht."
- `pages.settings.preferencesArchiveAfterDaysUnit`: "days" / "Tagen"
- `pages.search.archived`: "Archive" / "Archiv"

## 8. Nicht-Ziele

- Automatisches Löschen archivierter Karten, Aufbewahrungsfristen für das Archiv.
- Mehrere Erledigt-Spalten je Board; Archivierung nach Fälligkeit oder aus anderen Spalten.
- ~~Erneuter Archivierungslauf während die App läuft (nur beim Start, höchstens alle 24 h).~~ Überholt durch `docs/specs/reminders.md` §2.3: Die Minuten-Schleife der Reminder ruft `runScheduledCardArchive()` jede Minute auf; die Intervallprüfung lässt den Lauf weiterhin höchstens einmal je 24 h zu, jetzt auch ohne Neustart.
- Archiv über alle Boards hinweg, Bearbeiten archivierter Karten, Mehrfachauswahl auf der Archiv-Seite.
- Karten-Dialog für Suchtreffer im Archiv; Hervorhebung des Treffers auf der Archiv-Seite.
- Wiederherstellen an die ursprüngliche Position innerhalb der Spalte.

## 9. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen; keine neuen. `corepack pnpm generate` erfolgreich, neue Klassen im generierten CSS, Route `/kanban/:id/archive` im Router. Node-Smoke-Test für `utils/cardArchive.ts` (Fristberechnung an der Grenze, ungültige Daten, Normalisierung der Einstellung, Suche mit HTML-Beschreibung, Sortierung, Zielspalte) und die Archiv-Teile von `utils/search.ts`.

Manueller UI-Test (`corepack pnpm tauri dev`, PowerShell):

1. Spalten-Dropdown → „Als Erledigt-Spalte markieren": Häkchen erscheint im Kopf, Tooltip nennt die Tage. Vorhandene Karten mit Fälligkeit zeigen „erledigt". Eine andere Spalte markieren: Häkchen wandert, nur eine Spalte trägt es.
2. Karte per Drag & Drop in die Erledigt-Spalte ziehen, Board exportieren: Karte hat `completedAt` und `isDueDateCompleted: true`. Zurückziehen: `completedAt` fehlt, `isDueDateCompleted` bleibt. Umsortieren in der Erledigt-Spalte ändert `completedAt` nicht.
3. Dasselbe über Kontextmenü „Verschieben nach" (auch in ein anderes Board mit Erledigt-Spalte) und über „Karte hinzufügen" direkt in der Erledigt-Spalte.
4. Kontextmenü einer Karte → „Archivieren": Karte verschwindet sofort; Board-Menü zeigt „Archiv (1)".
5. Dropdown der Erledigt-Spalte → „Alle Karten archivieren": Rückfrage mit Anzahl; Abbrechen ändert nichts; Bestätigen leert die Spalte bis auf Trennkarten. Andere Spalten zeigen den Eintrag nicht.
6. Archiv-Seite: Einträge neueste zuerst mit Titel, Spalte, Datum/Uhrzeit, Tags. Suche nach einem Wort aus der Beschreibung findet die Karte, HTML erscheint nicht; Suche ohne Treffer zeigt den Hinweis; `Escape` leert das Feld.
7. „Wiederherstellen": Karte ist wieder unten in der ursprünglichen Spalte. Spalte vorher löschen: Tooltip nennt die erste Spalte, Karte landet dort. Wiederherstellen in die Erledigt-Spalte setzt einen neuen `completedAt`.
8. „Endgültig löschen": Rückfrage, danach ist der Eintrag weg; verknüpfte Dokumentdateien bleiben.
9. Settings: Wert auf 1 setzen, App neu starten: Wert erhalten. Ungültige Eingabe (0, leer) springt auf den gespeicherten Wert zurück.
10. Automatik: In der Store-Datei (`%APPDATA%\tech.trobonox.kanri\.kanri.dat`, App vorher beenden) bei einer Karte der Erledigt-Spalte `completedAt` auf ein Datum vor mehr als `archiveAfterDays` Tagen setzen und `cardArchiveLastRun` entfernen; App starten: Karte ist im Archiv, Konsole meldet „Card archive: archived 1 cards". Sofort neu starten: kein weiterer Lauf. Karte mit jüngerem `completedAt` bleibt.
11. Volltextsuche: Wort aus einer archivierten Karte → Treffer mit Badge „Archiv" und ursprünglicher Spalte; Klick öffnet die Archiv-Seite des Boards.
12. Board exportieren und wieder importieren: `archivedCards` und `isDoneColumn` sind erhalten. Board duplizieren: Kopie hat dasselbe Archiv.
13. Dokument-Historie: Karte mit Dokument archivieren, `documentHistoryLastCleanup` entfernen, App starten: Historie des Dokuments bleibt erhalten.
14. Sprache Deutsch: alle neuen Texte übersetzt.
