<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Kanri – Architekturüberblick

Stand: 2026-11-02, Fork-Basis upstream `main` @ 48f19e3 (v0.8.2).
Zweck: schnelle Orientierung für Änderungen im privaten Fork. Bei Abweichungen gilt der Code.

## 1. Was Kanri ist

Offline-Kanban-Desktop-App: **Tauri 2** (Rust-Shell, `src-tauri/`) + **Nuxt 4 / Vue 3** SPA (`ssr: false`).
Die gesamte Fachlogik liegt im Frontend; Rust ist nur die Hülle (Fenster, Plugins: store, fs, dialog, log, opener, autostart, os).
Persistenz: eine JSON-Datei `.kanri.dat` im App-Data-Verzeichnis über `@tauri-apps/plugin-store` (`LazyStore`).

```
src-tauri/            Rust-Shell, tauri.conf.json, capabilities
app.vue               Root, leitet console.* an Tauri-Log weiter
layouts/default.vue   Lädt alle Stores, setzt Theme-CSS-Variablen, Sidebar; Teleport-Ziel ".default-layout"
pages/                index (Board-Übersicht), kanban/[id] (Board-Ansicht), settings, import, licenses/*
components/           kanban/*, modal/*, icon/*, generische (Dropdown, Modal, Tooltip, HexColorInput, ...)
composables/          useBoard (Board-Fassade), useBackgroundImage, useContextMenuClasses
stores/               Pinia: boards, settings, theme, layout, tauriStore
types/                kanban-types.d.ts (Domänentypen), json-schemas.ts (zod, für Import)
utils/                colorUtils, drag-n-drop, emitter (mitt), exampleData, idGenerator, sorting, themes, iconManager
i18n/locales/*.json   11 Sprachen, Fallback en
assets/css/           global.css, scrollbars.css (Theme-Klassen liegen in layouts/default.vue <style>)
```

## 2. Datenmodell (`types/kanban-types.d.ts`)

```
Board { id, title, columns: Column[], background?: {src, blur, brightness}|null,
        globalTags?: Tag[]|null, lastEdited?, createdAt? }
Column { id, title, cards: Card[], defaultCardColor?, backgroundColor?, collapsed? }
Card { id?, name, description? (HTML aus tiptap), color?, dueDate?, isDueDateCounterRelative?,
       isDueDateCompleted?, tasks?: Task[], tags?: Tag[]|null }
Tag { id?, text, color?, style? }            Task { id?, finished, name }
```

- **IDs**: `generateUniqueID()` (cuid2). `Card.id` ist historisch optional; `Column.vue` ergänzt fehlende IDs beim Mount.
- **`Card.color`** ist ein String in einem von zwei Formaten: Tailwind-Klasse (`bg-pink-600`, `bg-elevation-2` = Standard) **oder** Hex (`#rrggbb`). Leerer String/undefined = Standard. Konsumenten unterscheiden per `startsWith("#")` (Klasse → `:class`, Hex → `:style`). Dieses Muster für neue Farbfelder beibehalten.
- **Sondername** `---`: Karte wird als Trennlinie gerendert.
- **`Column.collapsed`**: `true` = Spalte eingeklappt (nur Header sichtbar), fehlend/`undefined` = ausgeklappt. Gesetzt über `setColumnCollapsed`, persistiert per Auto-Save (Spec: `docs/specs/column-collapse.md`).
- **zod-Schemas** (`types/json-schemas.ts`) spiegeln die Typen und werden nur beim **Import** (`pages/import.vue`) angewendet. zod strippt unbekannte Keys → neue Felder müssen dort ergänzt werden, sonst gehen sie beim Re-Import verloren. `kanriJsonSchema` = komplettes `.kanri.dat`.
- Der Tauri-Store speichert die Objekte wie sie sind; neue optionale Felder sind damit automatisch rückwärtskompatibel (alte Daten haben `undefined`).

## 3. State & Persistenz

### `stores/boards.ts` – die einzige Wahrheit für Boards
- State: `boards: Board[]`, `pins`, `initialized`. Getter `boardById(id)`.
- `init()` lädt einmalig aus dem Tauri-Store und richtet **Auto-Save** ein: `$subscribe(..., {deep: true})` → 100 ms debounced `save()` (schreibt `boards` + `pins`). **Jede Mutation am Store-State wird also automatisch persistiert**, es gibt keinen expliziten Save-Aufruf in der UI.
- Actions mutieren in place und setzen `board.lastEdited`:
  - Board: `upsertBoard`, `removeBoard`, `duplicateBoard`, `renameBoard`, `togglePin`
  - Global Tags: `addGlobalTag`, `removeGlobalTag`, `setGlobalTagColor`, `updateGlobalTagName`, `_propagateGlobalTag` (Vorbild für „Änderung an einer Entität auf viele Karten propagieren")
  - Spalten: `addColumn`, `removeColumn`, `reorderColumns(boardId, nextColumns)`, `setColumnTitle`, `updateColumn`
  - Karten: `createCard(boardId, colId, card, addToTop)`, `duplicateCard`, `deleteCard`, `deleteAllColumnCards`, `mutateCard(boardId, colId, cardId, fn)`, `reorderCards(boardId, colId, nextCards)`, `moveCard(srcBoard, dstBoard, srcCol, dstCol, cardId)`
- **Karten-Bewegungen landen an genau drei Stellen**: `createCard` (neu), `reorderCards` (Drag & Drop, siehe §5), `moveCard` (Kontextmenü „Move to", auch board-übergreifend).

### `composables/useBoard.ts` – Fassade für eine Board-Seite
Bindet `boardId` (Ref) und reicht an den Store durch: `board` (computed), `isPinned`, `init()`, alle Column-/Card-Actions ohne `boardId`-Parameter, plus `setCardName/Description/Color/Tasks/DueDate/Tags` (alle via `mutateCard`). Neue Store-Actions hier spiegeln.

### Weitere Stores
- `settings`: Locale, Animationen, Zoom (`columnZoomLevel` -1..2), Add-to-top-Button, Kartenzähler, Sortierung. Jede Action schreibt direkt in den Tauri-Store (kein Auto-Save).
- `theme`: `activeTheme` (dark/light/catppuccin/custom/auto), `colors: Theme`. `layouts/default.vue` mappt `colors` auf CSS-Variablen (`--elevation-1`, `--text-dim-1`, …) und definiert dort im `<style>` die Utility-Klassen `bg-elevation-1/2/3`, `bg-elevation-2-hover`, `border-elevation-*`, `text-dim-*`, `bg-accent`, `text-buttons`, `bg-primary-darker`.
- `layout`: Sidebar-Flags, Changelog-Anzeige. `tauriStore`: hält die `LazyStore`-Instanz.
- ESLint-Regel `custom/no-store-outside-stores`: `useTauriStore()` nur in `stores/`.

## 4. Komponenten der Board-Ansicht

```
pages/kanban/[id].vue                       Seite: Header (Titel, Buttons, Dropdown), Spalten-Container,
  │                                          alle Modals (v-show), Keyboard-Shortcuts, Confirm-Dialoge
  ├─ smooth-dnd Container (horizontal, group "columns")
  │    └─ Draggable → KanbanColumn (components/kanban/Column.vue)   props: id, title, cardsList, colIndex, zoomLevel, ...
  │         ├─ Header: Titel (Klick = inline edit), Kartenzähler, Dropdown (⋯) mit Spaltenaktionen
  │         ├─ smooth-dnd Container (vertical, group "cards") → Draggable → KanbanCard (Card.vue)
  │         └─ „Add card"-Formular
  ├─ ModalEditCard (components/modal/EditCard.vue)  Farbe, Titel, Beschreibung (tiptap), Tasks, Due Date, Tags
  ├─ ModalCardTags, ModalCustomBackground, ModalRenameBoard, ModalConfirmation (×4)
  └─ KanbanSearchBar, KanbanZoomAdjustment
```

- **Datenfluss**: Props runter, Events hoch. Column/Card emittieren fachliche Events (`addCard`, `reorderCards`, `setCardName`, …), die Seite bindet sie direkt an `useBoard`-Funktionen (`@addCard="board.createCard"`). Column reicht Card-Events mit `props.id` angereichert weiter. Neue Spalten-/Kartenaktionen folgen diesem Weg: Event in Card/Column definieren → in `[id].vue` an `board.xyz` binden → Action in `useBoard` + Store.
- **Column.vue** hält eine lokale Kopie `cards = ref(props.cardsList)` mit Watcher (TODO im Code: entfernen). `provide('columnId')` für `KanbanMoveTo`. Prop `collapsed`: Chevron-Button im Header bzw. Dropdown-Eintrag emittiert `setColumnCollapsed`; eingeklappt werden Karten-Container und „Add card" nicht gerendert, der „Add card"-Modus klappt die Spalte vorher aus. Sehr viele `computed` Zoom-Klassen (`columnSizeClass`, …) – Muster beibehalten, wenn Elemente skalieren sollen.
- **Card.vue** spiegelt `props.card` in lokale Refs (deep watch) und berechnet `cardBackgroundColor` (`card.color || "bg-elevation-2"`), `cardTextColor`/`cardTextColorDim` via `getContrast()` aus `utils/colorUtils` (liefert `text-gray-50` oder eine dunkle Textklasse). Kontextmenü (radix `ContextMenu*`) mit Edit/Move to/Duplicate/Delete.
- **EditCard.vue**: Farbwahl = 9 feste Swatches (`bg-pink/red/orange/yellow/green/teal/blue/purple-600`, `bg-elevation-2`) + Custom (`<input type="color">` + `HexColorInput`). Diese Klassennamen stehen wörtlich im Template, damit Tailwind-JIT sie generiert; neue Farbklassen müssen irgendwo wörtlich im Quelltext vorkommen.
- **Modals**: `components/Modal.vue` (fixed overlay, Esc schließt, Enter → `enterKeyPressed`). Die Seite rendert alle Modals dauerhaft mit `v-show`; Inhalt wird über Props/Emitter befüllt. Confirm-Dialoge nutzen `useConfirmDialog` (vueuse) + `emitter.emit("openModalWithCustomDescription")`.
- **Dropdown.vue** (radix DropdownMenu) teleportiert nach `.default-layout`; Items sind `DropdownMenuItem` mit Klassen `bg-elevation-2-hover ... rounded-md px-4 py-1.5`.
- **Emitter** (`utils/emitter.ts`, mitt, typisiert): seitenweite Signale (`columnActionDone`, `enableColumnTitleEditing`, `columnDraggingOn/Off`, Modal-Steuerung). Neue Events im `Events`-Typ ergänzen; Listener in `onBeforeUnmount` wieder abmelden.

## 5. Drag & Drop (vue3-smooth-dnd)

- Spalten: Container in `[id].vue`, `onDrop` → `applyDrag(columns, dropResult)` → `board.reorderColumns`.
- Karten: Container pro Column (`group-name="cards"`). Bei spaltenübergreifendem Drag feuert `@drop` **in beiden Spalten**: Quelle mit `{removedIndex: n, addedIndex: null}`, Ziel mit `{removedIndex: null, addedIndex: m, payload: card}`. Jede Spalte ruft `applyDrag(cards, dropResult)` (`utils/drag-n-drop.js`, entfernt/fügt per Payload-Identität bzw. Index) und emittiert `reorderCards(columnId, nextCards)` → Store ersetzt `col.cards`.
- Das Payload-Objekt ist dasselbe reaktive Card-Objekt, das aus der Quellspalte stammt; es wandert also als Referenz in das neue Array.
- Konsequenz: Im Store lässt sich „Karte neu in Spalte angekommen" in `reorderCards` erkennen über `nextCards`-IDs, die vorher nicht in `col.cards` waren. Das ist der robusteste Hook für „beim Verschieben etwas an der Karte ändern" (deckt D&D ab; `moveCard` und `createCard` separat behandeln).
- Suche: `filteredCards` filtert nur die Anzeige; `getChildPayload` mappt den Index zurück.
- Drag wird über Klassen gesteuert (`kanbancard-drag` vs. `nomoredragging`, `draggingEnabled`), bei Inline-Edits deaktiviert.

## 6. Farben & Kontrast (`utils/colorUtils.ts`)

Exporte: `getContrast(hex)` → `"text-gray-50"` oder dunkle Textklasse, `lightenColor`, `hexToRgb`, `rgbToHex`, `rgbToHsl`, `hslToHex`, `cssColorStringToHex`, `getAverageColor` (für Board-Hintergrund). Hat Unit-Tests (`colorUtils.spec.ts`), die aber mangels vitest nicht laufen.
Für Tailwind-Klassen-Farben (`bg-*-600`) wird pauschal heller Text angenommen (`text-gray-50`); nur Hex-Farben werden berechnet.

## 7. Startseite, Import/Export, Settings

- `pages/index.vue`: Board-Liste mit `KanbanBoardPreview` (Mini-Rendering der Spalten/Karten inkl. `card.color`), Sortierung (`utils/sorting.ts`), NewBoard-Modal (`utils/exampleData.ts`), Pins.
- `pages/import.vue`: Import von Kanri-Vollexport, einzelnem Board, KanbanElectron und Trello, jeweils via zod-Schema; Export eines Boards in `[id].vue` (`exportBoardToJson`, `JSON.stringify(board)`).
- `pages/settings.vue`: Theme-Wahl (`CustomThemeEditor` mit `HexColorInput` + `<input type="color">`), Sprache, Verhalten.

## 8. Toolchain & Qualitätssicherung

- pnpm via `corepack pnpm …` (pnpm nicht global). `nuxi prepare` erzeugt `.nuxt/` (nötig für ESLint-Config und Typen).
- `pnpm lint` (eslint + tailwind-Plugin), `pnpm generate` (statischer Build nach `.output/public`, den Tauri bündelt), `pnpm tauri dev` für die Desktop-App (Rust-Toolchain vorhanden).
- Keine lauffähige Testsuite (vitest fehlt in devDependencies). Manuelles Testen der CRUD-Kernfunktionen ist laut CONTRIBUTING Pflicht.
- Lizenz-/REUSE-Regeln: siehe `CLAUDE.md`.

## 9. Bekannte Fallstricke

- `Column.vue`/`Card.vue` kopieren Props in lokale Refs; direkte Mutation von Props vermeiden, Änderungen immer über Store-Actions.
- Tailwind-Klassen dynamisch zusammenzusetzen (`"bg-" + name`) funktioniert nicht (JIT). Vollständige Klassennamen verwenden.
- `Card.id` kann in Altdaten fehlen → Vergleiche über `id` defensiv halten.
- Auto-Save ist deep-reaktiv: große Arrays ersetzen ist ok, aber Mutationen außerhalb des Stores (z. B. direkt am `props.card`) werden ebenfalls persistiert, nur ohne `lastEdited`.
- Zoom-Level (-1..2) beeinflusst fast jede Klasse in Column/Card; neue UI-Elemente in Spalte/Karte sollten ein `computed` für die Größe bekommen.
- Die Upstream-CONTRIBUTING lehnt KI-generierte Beiträge ab; Änderungen in diesem Fork sind nicht für Upstream-PRs gedacht.
