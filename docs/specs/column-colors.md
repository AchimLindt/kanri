<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Spaltenfarben (Default-Kartenfarbe + Spaltenhintergrund)

Status: implementiert (Branch `feat/column-colors`, 2026-11-02), manueller UI-Test gemäß §9 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`.

## 1. Ziel

Eine Spalte (Lane) kann zwei Farben erhalten:

1. **Default-Kartenfarbe** (`defaultCardColor`): Karten, die in diese Spalte **hineinbewegt** oder dort **neu angelegt** werden, bekommen automatisch diese Farbe.
2. **Spaltenhintergrund** (`backgroundColor`): die Spalte selbst wird in dieser Farbe gerendert.

Beides ist optional, pro Spalte, wird mit dem Board persistiert und überlebt Export/Import.

## 2. Verhalten

### Default-Kartenfarbe
- Trifft eine Karte in einer Spalte mit `defaultCardColor` ein, wird `card.color = defaultCardColor` gesetzt. Eintreffen bedeutet:
  - Drag & Drop aus einer anderen Spalte (auch aus einer Spalte mit eigener Default-Farbe),
  - Kontextmenü „Move to" (auch board-übergreifend) in diese Spalte,
  - Neuanlage einer Karte in dieser Spalte (Formular „Add card" unten oder „Add card to the top").
- Umsortieren **innerhalb** derselben Spalte ändert nichts.
- Hat die Zielspalte keine Default-Farbe, bleibt die Kartenfarbe unverändert (Karte behält z. B. die Farbe der vorherigen Spalte).
- Die Karte behält die Farbe, bis sie erneut bewegt oder manuell im Karten-Dialog geändert wird. Es gibt keine Verknüpfung zurück zur Spalte: Ändert man später die Default-Farbe, ändern sich bestehende Karten nicht automatisch.
- Button **„Auf alle Karten dieser Spalte anwenden"**: setzt die Farbe aller aktuell in der Spalte liegenden Karten auf die Default-Farbe (Opt-in, keine Nachfrage nötig; nur aktiv, wenn eine Default-Farbe gesetzt ist).
- Duplizieren einer Karte (bleibt in derselben Spalte) kopiert die Farbe der Vorlage, keine Default-Anwendung.

### Spaltenhintergrund
- Ersetzt den Standardhintergrund `bg-elevation-1` der Spalte.
- Titel, Kartenzähler-Text, „Add card"-Zeile und Dropdown-Trigger müssen auf dem farbigen Hintergrund lesbar bleiben (Kontrast wie bei Karten: Tailwind-`*-600`-Klassen → heller Text, Hex → `getContrast()`).
- Karten in der Spalte behalten ihre eigene Farbe (Standardkarten bleiben `bg-elevation-2`).
- Die Board-Vorschau auf der Startseite (`BoardPreview.vue`) zeigt die Spaltenfarbe ebenfalls (nur die Hintergrundfarbe der Mini-Spalte).

### Farbformat
Identisch zu `Card.color` (siehe ARCHITECTURE §2): Tailwind-Klasse aus der festen Palette (`bg-pink-600`, `bg-red-600`, `bg-orange-600`, `bg-yellow-600`, `bg-green-600`, `bg-teal-600`, `bg-blue-600`, `bg-purple-600`, `bg-elevation-2`) **oder** Hex `#rrggbb`. `null`/`undefined`/`""` = nicht gesetzt.

## 3. UI

- Im Spalten-Dropdown (⋯ in `Column.vue`) neuer Eintrag **„Spaltenfarben…"** als erster Eintrag nach „Add card to the top".
- Öffnet ein Modal `ModalColumnColors` (neu, `components/modal/ColumnColors.vue`), wie die anderen Modals in `pages/kanban/[id].vue` per `v-show` eingebunden.
- Modalinhalt:
  - Überschrift: Spaltentitel.
  - Abschnitt **Default-Kartenfarbe**: kurzer Hinweistext, Farbwähler, darunter Button „Auf alle Karten dieser Spalte anwenden".
  - Abschnitt **Spaltenhintergrund**: Farbwähler.
  - Schließen per Esc, Klick außerhalb oder Button „Fertig".
- **Farbwähler** = neue wiederverwendbare Komponente `components/ColorSwatchPicker.vue`:
  - Swatches in derselben Optik wie im Karten-Dialog (`EditCard.vue`: runde Buttons, Häkchen auf der gewählten Farbe), **plus** ein „Keine"-Swatch (durchgestrichener Kreis, setzt `null`) und ein „Custom"-Swatch, das `<input type="color">` + `HexColorInput` einblendet.
  - `v-model` (`modelValue: string | null`), emittiert jede Änderung sofort (kein Speichern-Button; Store speichert automatisch).
  - `EditCard.vue` wird **nicht** umgebaut (Risiko minimieren); die Palette wird in `utils/cardColors.ts` als `const CARD_COLOR_CLASSES = [...]` exportiert und vom Picker genutzt. Die Klassennamen müssen wörtlich im Quelltext stehen (Tailwind-JIT) – im Picker-Template per statischer Liste, nicht zusammengesetzt.

## 4. Datenmodell & Persistenz

```ts
// types/kanban-types.d.ts
export declare interface Column {
  cards: Array<Card>;
  id: string;
  title: string;
  defaultCardColor?: string | null;
  backgroundColor?: string | null;
}
```

- `types/json-schemas.ts` → `kanriColumnSchema` um `defaultCardColor: z.string().optional().nullable()` und `backgroundColor: z.string().optional().nullable()` ergänzen (sonst gehen die Felder beim Import verloren).
- Keine Migration nötig: Altdaten haben `undefined` = nicht gesetzt.

## 5. Store-Logik (`stores/boards.ts`)

Neue Actions:

```ts
setColumnDefaultCardColor(boardId, columnId, color: string | null)
setColumnBackgroundColor(boardId, columnId, color: string | null)
applyColumnDefaultCardColorToAllCards(boardId, columnId)
```

Interner Helper (keine Action-Semantik, aber als Action implementieren mit `_`-Präfix wie `_propagateGlobalTag`):

```ts
_applyColumnDefaultCardColor(col: Column, card: Card) {
  if (col.defaultCardColor) card.color = col.defaultCardColor;
}
```

Anpassung bestehender Actions – das sind die **einzigen drei Stellen**, an denen Karten in eine Spalte gelangen:

| Action | Änderung |
|---|---|
| `createCard` | nach dem Einfügen `_applyColumnDefaultCardColor(col, card)` aufrufen, **nur wenn** `!card.color` (neue Karten kommen mit `color: ""`). |
| `reorderCards` | vor dem Ersetzen: `prevIds = new Set(col.cards.map(c => c.id))`; für jede Karte in `nextCards` mit `card.id && !prevIds.has(card.id)` → Helper aufrufen. Deckt D&D aus anderer Spalte ab, weil die Zielspalte `nextCards` inkl. der neuen Karte liefert; Umsortieren innerhalb der Spalte ändert nichts. |
| `moveCard` | nach `targetCol.cards.push(card)` → Helper mit `targetCol`. |

`composables/useBoard.ts`: die drei neuen Actions als `setColumnDefaultCardColor(columnId, color)`, `setColumnBackgroundColor(columnId, color)`, `applyColumnDefaultCardColorToAllCards(columnId)` spiegeln.

## 6. Komponentenänderungen

### `components/kanban/Column.vue`
- Neue Props: `defaultCardColor?: string | null`, `backgroundColor?: string | null`.
- Neues Emit: `(e: "openColumnColorsModal", columnId: string): void`.
- Dropdown-Eintrag „Spaltenfarben…" → `$emit('openColumnColorsModal', id)`.
- Root-`div`: `bg-elevation-1` nur, wenn kein `backgroundColor`; sonst Klasse (wenn nicht `#`) oder `:style="{ backgroundColor }"` (wenn `#`). Dazu `computed` `columnBackgroundClass`, `columnBackgroundStyle`, `columnTextClass` (Kontrast) analog zu `Card.vue`. Titel-`h1`, Kartenzähler-Badge-Text, „Add card"-Zeile (`text-dim-1` → Kontrastklasse, wenn Farbe gesetzt) und Dropdown-Trigger (`bg-elevation-1` → `bg-transparent`, wenn Farbe gesetzt) verwenden diese Klassen.
- Optional sichtbarer Hinweis: kleiner Farbpunkt neben dem Titel, wenn `defaultCardColor` gesetzt ist (Tooltip „Default card color"). Klein halten, Zoom-Klassen beachten.

### `pages/kanban/[id].vue`
- `KanbanColumn` zusätzlich mit `:default-card-color="column.defaultCardColor"`, `:background-color="column.backgroundColor"` und `@openColumnColorsModal="openColumnColorsModal"`.
- State `columnColorsModalVisible`, `currentlyColoredColumnId`; `openColumnColorsModal(columnId)` setzt beides und `draggingEnabled = false`; Schließen setzt zurück und emittiert `columnDraggingOn` (wie `closeEditCardModal`).
- `<ModalColumnColors v-show=... :column="..." @closeModal @setDefaultCardColor="board.setColumnDefaultCardColor" @setBackgroundColor="board.setColumnBackgroundColor" @applyDefaultCardColorToAllCards="board.applyColumnDefaultCardColorToAllCards" />`. Die `column`-Prop als `computed` aus `boardContent.columns.find(...)`, damit das Modal reaktiv bleibt.

### `components/modal/ColumnColors.vue` (neu)
- Nutzt `<Modal :blur-background="false" @closeModal="$emit('closeModal')">` wie `EditCard.vue`.
- Props `column: Column | null`. Emits: `closeModal`, `setDefaultCardColor(columnId, color|null)`, `setBackgroundColor(columnId, color|null)`, `applyDefaultCardColorToAllCards(columnId)`.
- Zwei `ColorSwatchPicker` mit `:model-value="column?.defaultCardColor ?? null"` + `@update:modelValue="c => emit('setDefaultCardColor', column.id, c)"` (analog Hintergrund).

### `components/ColorSwatchPicker.vue` (neu)
Siehe §3. Custom-Farbe: lokaler `customColor`-Ref (Default `#ffffff` bzw. aktueller Hex-Wert), Watcher emittiert bei Änderung; `isCustom = modelValue?.startsWith("#")`.

### `components/kanban/BoardPreview.vue`
Mini-Spalte: wenn `column.backgroundColor` gesetzt → Klasse/Style statt `bg-elevation-2` (gleiche `#`-Unterscheidung).

## 7. i18n (`i18n/locales/en.json` und `de.json`, übrige Sprachen fallen auf en zurück)

```
components.kanban.column.colorsAction        "Column colors…"                       "Spaltenfarben…"
modals.columnColors.title                    "Column colors"                        "Spaltenfarben"
modals.columnColors.defaultCardColorTitle    "Default card color"                   "Standardfarbe für Karten"
modals.columnColors.defaultCardColorHint     "Cards moved into or created in this column get this color."   "Karten, die in diese Spalte verschoben oder hier erstellt werden, erhalten diese Farbe."
modals.columnColors.applyToAllCards          "Apply to all cards in this column"    "Auf alle Karten dieser Spalte anwenden"
modals.columnColors.backgroundColorTitle     "Column background"                    "Spaltenhintergrund"
modals.columnColors.done                     "Done"                                 "Fertig"
components.colorSwatchPicker.none            "None"                                 "Keine"
components.colorSwatchPicker.custom          "Custom color"                         "Eigene Farbe"
```

## 8. Nicht-Ziele
- Kein Umbau des Farbwählers in `EditCard.vue`.
- Keine automatische Rückkopplung Default-Farbe → bestehende Karten (nur per Button).
- Keine neuen Settings auf App-Ebene.

## 9. Abnahme / Verifikation
- `corepack pnpm exec eslint .` → keine neuen Fehler gegenüber Baseline (Baseline upstream: 6 Fehler/75 Warnungen in `pages/settings.vue`, `plugins/directives.ts`, `pages/kanban/[id].vue` u. a.). Geänderte/neue Dateien: 0 Fehler.
- `corepack pnpm generate` läuft fehlerfrei durch.
- Manuell in `corepack pnpm tauri dev` bzw. `corepack pnpm dev`:
  1. Spalte „Doing" → Spaltenfarben → Default blau, Hintergrund `#1e3a5f`. Spalte wird dunkelblau, Text lesbar.
  2. Karte aus „Todo" nach „Doing" ziehen → Karte wird blau. Zurück nach „Todo" (ohne Default) → bleibt blau.
  3. Karte per Rechtsklick „Move to" nach „Doing" → blau.
  4. Neue Karte in „Doing" anlegen → blau. Karte in „Doing" umsortieren → keine Änderung.
  5. „Auf alle Karten anwenden" → alle Karten in „Doing" blau.
  6. „Keine" wählen → Hintergrund wieder Standard; neue Karten in „Doing" bleiben Standardfarbe.
  7. Board exportieren, neu importieren → Spaltenfarben erhalten. App neu starten → Farben erhalten.
  8. Startseite: Vorschau zeigt die Spaltenfarbe.
