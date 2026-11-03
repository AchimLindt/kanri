<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Spalten ein-/ausklappen

Status: implementiert (Branch `feat/column-collapse`, 2026-11-03), manueller UI-Test gemäß §9 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`.

## 1. Ziel

Eine einzelne Spalte (Lane) kann **eingeklappt** werden: Sie klappt vertikal „nach oben" zusammen, sodass nur noch ihr Header sichtbar ist. Das schafft Übersicht bei Spalten mit vielen Karten, die gerade nicht bearbeitet werden (z. B. „Done"). Der Zustand ist pro Spalte, wird mit dem Board persistiert und ist nach einem App-Neustart wiederhergestellt.

## 2. Verhalten

- **Eingeklappt** zeigt die Spalte nur den Header: Titel (inkl. Inline-Edit per Klick), Farbpunkt der Default-Kartenfarbe, Kartenzähler-Badge (sofern in den Settings aktiv), den neuen Ein-/Ausklapp-Button und das Dropdown (⋯).
- Die Kartenliste (smooth-dnd-`Container` mit den Karten) und die „Add card"-Zeile bzw. das „Add card"-Formular werden **nicht gerendert**.
- Die **Breite** der Spalte bleibt unverändert (zoomabhängig wie bisher); nur die Höhe schrumpft auf den Header. Spaltenhintergrund (`backgroundColor`) bleibt erhalten.
- **Ausklappen** stellt die Spalte unverändert wieder her (Karten, Reihenfolge, Scrollbereich).
- **Karte anlegen in eingeklappter Spalte**: Jeder Weg in den „Add card"-Modus klappt die Spalte zuerst aus und öffnet dann das Eingabefeld wie bisher. Das betrifft „Add card to the top" im Dropdown und den Shortcut Strg+N (Event `enableColumnCardAddMode`), da beide über `enableCardAddMode()` laufen.
- **Einklappen während das „Add card"-Formular offen ist** bricht die Eingabe ab (wie „Cancel": Formular zu, Text verworfen, Dragging wieder aktiv). Sonst bliebe das Dragging deaktiviert, ohne dass ein Formular sichtbar ist.
- **Spalten-Drag & Drop** funktioniert für ein- und ausgeklappte Spalten unverändert. Die ganze Spalte ist Drag-Handle (`dragging-handle` auf `KanbanColumn` in `[id].vue`); smooth-dnd startet einen Drag erst nach Mausbewegung, ein einfacher Klick auf den Toggle-Button löst also nur den Klick aus. Das ist dasselbe Verhalten wie beim bestehenden Dropdown-Trigger, der ebenfalls keine Sonderbehandlung hat.
- **Karten-Drop** auf eine eingeklappte Spalte ist nicht möglich, weil dort kein Karten-Container gerendert ist (siehe Nicht-Ziele).
- **Suche**: Die Suche klappt Spalten nicht automatisch aus. Treffer in eingeklappten Spalten sind erst nach dem Ausklappen sichtbar. Der Kartenzähler zeigt wie bisher die Gesamtzahl der Karten.
- Export/Import: `collapsed` wird mit exportiert und beim Import übernommen.

## 3. UI

- **Toggle-Button** im Header rechts, direkt links neben dem Dropdown-Trigger (beide in einem gemeinsamen Flex-Wrapper).
  - Icon: `ChevronUpIcon` im ausgeklappten Zustand (Aktion „einklappen"), `ChevronDownIcon` im eingeklappten Zustand (Aktion „ausklappen"), beide aus `@heroicons/vue/24/solid`.
  - Größe `size-6` wie das bestehende `EllipsisHorizontalIcon` des Dropdown-Triggers (das Header-Icon ist nicht zoomabhängig; beide Buttons bleiben dadurch gleich groß).
  - Styling identisch zum Dropdown-Trigger über das gemeinsame `computed` `headerButtonClass`: ohne Spaltenhintergrund `bg-elevation-1 bg-elevation-2-hover`, mit Spaltenhintergrund `bg-transparent hover:bg-black/10`, plus Kontrast-Textklasse `columnTextClass`.
  - `:title` und `:aria-label` = „Collapse column" bzw. „Expand column" (i18n), zusätzlich `aria-expanded`.
- **Dropdown-Eintrag** direkt nach „Column colors…": „Collapse column" bzw. „Expand column" je nach Zustand, toggelt wie der Button.

## 4. Datenmodell

`types/kanban-types.d.ts`:

```ts
export declare interface Column {
  cards: Array<Card>;
  id: string;
  title: string;
  defaultCardColor?: string | null;
  backgroundColor?: string | null;
  collapsed?: boolean;
}
```

- `types/json-schemas.ts` → `kanriColumnSchema` um `collapsed: z.boolean().optional()` ergänzen (sonst strippt zod das Feld beim Import).
- `undefined`/fehlend = ausgeklappt. Keine Migration nötig, Altdaten bleiben ausgeklappt.
- Persistenz ohne Zusatzaufwand über das deep-reaktive Auto-Save des Boards-Stores.

## 5. Store-Logik (`stores/boards.ts`)

Neue Action nach dem Muster von `setColumnDefaultCardColor`:

```ts
setColumnCollapsed(boardId, columnId, collapsed: boolean)
```

Setzt `col.collapsed` und `b.lastEdited`. Keine Änderung an bestehenden Actions.

`composables/useBoard.ts`: als `setColumnCollapsed(columnId, collapsed)` spiegeln und exportieren.

## 6. Komponentenänderungen

### `components/kanban/Column.vue`
- Neue Prop `collapsed?: boolean`, neues Emit `(e: "setColumnCollapsed", columnId: string, collapsed: boolean): void`.
- Header: Toggle-Button + Dropdown in einem Wrapper `flex shrink-0 flex-row gap-0.5`; Klassen beider Buttons aus `headerButtonClass` (vorher inline am Dropdown-Trigger).
- `collapseToggleLabel` (`computed`, `useI18n().t`) liefert das Label für Button-Title, Aria-Label und Dropdown-Eintrag.
- `toggleCollapsed()` emittiert `setColumnCollapsed(id, !collapsed)`; beim Einklappen wird ein offener „Add card"-Modus vorher abgebrochen.
- `enableCardAddMode()` emittiert zuerst `setColumnCollapsed(id, false)`, falls die Spalte eingeklappt ist.
- Kartenliste, „Add card"-Formular und „Add card"-Zeile stehen in `<template v-if="!collapsed">`. Die Drop-Logik der ausgeklappten Spalte ist unverändert.

### `pages/kanban/[id].vue`
- `KanbanColumn` zusätzlich mit `:collapsed="column.collapsed"` und `@setColumnCollapsed="board.setColumnCollapsed"`.

### `components/kanban/BoardPreview.vue`
Keine Änderung, siehe Nicht-Ziele.

## 7. i18n (`i18n/locales/en.json` und `de.json`, übrige Sprachen fallen auf en zurück)

```
components.kanban.column.collapseAction   "Collapse column"   "Spalte einklappen"
components.kanban.column.expandAction     "Expand column"     "Spalte ausklappen"
```

Dieselben Keys dienen als Dropdown-Label und als Title/Aria-Label des Toggle-Buttons.

## 8. Nicht-Ziele
- Kein Karten-Drop auf eingeklappte Spalten (kein automatisches Ausklappen beim Darüberziehen).
- Kein „Alle ein-/ausklappen".
- Kein Tastatur-Shortcut für Ein-/Ausklappen.
- Kein horizontales Einklappen (Breite bleibt).
- Die Board-Vorschau auf der Startseite (`BoardPreview.vue`) zeigt die Karten unabhängig vom Einklapp-Zustand.

## 9. Abnahme / Verifikation
- `corepack pnpm exec eslint .` → keine neuen Fehler/Warnungen gegenüber Baseline (`main` @ 092a207: 4 Fehler/75 Warnungen). Hinweis: `pnpm lint` ruft `eslint . --fix` auf und ändert dabei fremde Dateien, deshalb für den Vergleich `eslint .` ohne `--fix` verwenden.
- `corepack pnpm generate` läuft fehlerfrei durch.
- Manuell in `corepack pnpm tauri dev` bzw. `corepack pnpm dev`:
  1. Spalte „Done" per Chevron einklappen → nur Header sichtbar, Zähler zeigt weiterhin die Kartenanzahl, Breite unverändert, Icon wechselt auf Chevron nach unten, Tooltip „Expand column".
  2. Per Dropdown „Expand column" wieder ausklappen → Karten unverändert da.
  3. Eingeklappte Spalte → Dropdown „Add card to the top" → Spalte klappt aus, Eingabefeld hat Fokus, Karte landet oben. Dasselbe mit Strg+N für die betroffene Spalte.
  4. „Add card" öffnen, dann einklappen → Formular weg, Spalte danach per Header verschiebbar.
  5. Eingeklappte und ausgeklappte Spalten per Header-Drag umsortieren; ein Klick auf den Chevron startet keinen Drag.
  6. Spalte mit Hintergrundfarbe (hell und dunkel): Chevron-Button lesbar, Hover wie beim Dropdown-Trigger.
  7. Zoomstufen −1 bis 2 durchklicken: Header-Layout bleibt intakt.
  8. App neu starten → Zustand erhalten. Board exportieren und neu importieren → Zustand erhalten.
  9. Sprache Deutsch → Labels „Spalte einklappen"/„Spalte ausklappen".
