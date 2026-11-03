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
pages/                index (Board-Übersicht), kanban/[id] (Board-Ansicht), document (Markdown-Editor), search (Volltextsuche),
                      settings, import, licenses/*
components/           kanban/*, modal/*, document/*, icon/*, generische (Dropdown, Modal, Tooltip, HexColorInput, ...)
composables/          useBoard (Board-Fassade), useBackgroundImage, useContextMenuClasses, useDocumentHistory, useSearch
stores/               Pinia: boards, settings, theme, layout, tauriStore
types/                kanban-types.d.ts (Domänentypen), json-schemas.ts (zod, für Import)
utils/                colorUtils, drag-n-drop, emitter (mitt), exampleData, idGenerator, sorting, themes, iconManager,
                      documentPaths, markdownLint, cardLinks, search
i18n/locales/*.json   11 Sprachen, Fallback en
assets/css/           global.css, scrollbars.css (Theme-Klassen liegen in layouts/default.vue <style>)
```

## 2. Datenmodell (`types/kanban-types.d.ts`)

```
Board { id, title, columns: Column[], background?: {src, blur, brightness}|null,
        globalTags?: Tag[]|null, lastEdited?, createdAt? }
Column { id, title, cards: Card[], defaultCardColor?, backgroundColor?, collapsed? }
Card { id?, name, description? (HTML aus tiptap), color?, dueDate?, isDueDateCounterRelative?,
       isDueDateCompleted?, tasks?: Task[], tags?: Tag[]|null, documents?: CardDocument[]|null,
       links?: CardLink[]|null }
Tag { id?, text, color?, style? }            Task { id?, finished, name }
CardDocument { id, path }                    (absoluter Pfad einer .md-Datei)
CardLink { id, url, title? }                 (http/https/mailto-URL, optionaler Anzeigename)
```

- **IDs**: `generateUniqueID()` (cuid2). `Card.id` ist historisch optional; `Column.vue` ergänzt fehlende IDs beim Mount.
- **`Card.color`** ist ein String in einem von zwei Formaten: Tailwind-Klasse (`bg-pink-600`, `bg-elevation-2` = Standard) **oder** Hex (`#rrggbb`). Leerer String/undefined = Standard. Konsumenten unterscheiden per `startsWith("#")` (Klasse → `:class`, Hex → `:style`). Dieses Muster für neue Farbfelder beibehalten.
- **Sondername** `---`: Karte wird als Trennlinie gerendert.
- **`Column.collapsed`**: `true` = Spalte eingeklappt (nur Header sichtbar), fehlend/`undefined` = ausgeklappt. Gesetzt über `setColumnCollapsed`, persistiert per Auto-Save (Spec: `docs/specs/column-collapse.md`).
- **`Card.documents`**: Verweise auf Markdown-Dateien im Dateisystem; die Board-Daten enthalten nur Pfade, nie den Text. Ein Pfad je Karte höchstens einmal (Vergleich über `normalizeDocumentPath` aus `utils/documentPaths.ts`). Duplizieren kopiert die Verweise, Löschen/Entfernen fasst die Dateien nie an (Spec: `docs/specs/card-documents.md`).
- **`Card.links`**: Web-Links, die per `openUrl` im Standardbrowser geöffnet werden. Die URL wird vor dem Speichern mit `normalizeLinkUrl` (`utils/cardLinks.ts`) normalisiert: ohne Schema `https://` davor, nur `http`, `https`, `mailto`; beim Öffnen wird das Schema erneut geprüft. Doppelte URLs sind erlaubt. Anzeigename über `linkDisplayName` (Titel, sonst Host + Pfad). Duplizieren kopiert die Links (Spec: `docs/specs/card-links.md`).
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
  - Karten-Dokumente: `addCardDocument` (gibt die id zurück, ignoriert doppelte Pfade), `removeCardDocument`, `setCardDocumentPath`; Getter `findCardDocument(boardId, cardId, docId)` für die Editor-Seite
  - Karten-Links: `addCardLink` (gibt die id zurück), `updateCardLink`, `removeCardLink`; Lookup über den internen Helfer `_findCard(boardId, colId, cardId)`. Validierung passiert vorher im Dialog
- **Karten-Bewegungen landen an genau drei Stellen**: `createCard` (neu), `reorderCards` (Drag & Drop, siehe §5), `moveCard` (Kontextmenü „Move to", auch board-übergreifend).

### `composables/useBoard.ts` – Fassade für eine Board-Seite
Bindet `boardId` (Ref) und reicht an den Store durch: `board` (computed), `isPinned`, `init()`, alle Column-/Card-Actions ohne `boardId`-Parameter, plus `setCardName/Description/Color/Tasks/DueDate/Tags` (alle via `mutateCard`). Neue Store-Actions hier spiegeln.

### Weitere Stores
- `settings`: Locale, Animationen, Zoom (`columnZoomLevel` -1..2), Add-to-top-Button, Kartenzähler, Sortierung, `markdownDocumentsFolder` (Startordner der Dokument-Dialoge, `""` = System-Default), `markdownPreviewEnabled` (Vorschau im Editor), `searchDocumentContentsEnabled` (Volltextsuche liest Dokumentinhalte). Jede Action schreibt direkt in den Tauri-Store (kein Auto-Save).
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
- **Dokumente** (`EditCard.vue` → `[id].vue`): Abschnitt „Dokumente" mit Liste, Kontextmenü und Datei-Dialogen; `exists()` wird bei jedem Öffnen des Dialogs geprüft (Signal `editCardModalOpened` über den Emitter, weil das Modal per `v-show` gemountet bleibt). `openDocument` schließt den Dialog und navigiert nach `/document?board=&card=&doc=`. Das Kontextmenü im Modal braucht einen z-index über dem des Modals (`z-[10000001]`).
- **Links** (`EditCard.vue`): Abschnitt „Links" unter „Dokumente" mit Liste (Klick = `openUrl`, Dialog bleibt offen), Kontextmenü (Öffnen, URL kopieren, Bearbeiten, Entfernen ohne Rückfrage) und einem Formular aus URL- und Titelfeld, das im Bearbeiten-Modus „Speichern" zeigt. Kopieren über `navigator.clipboard.writeText` (im WebView verfügbar, `*.localhost` ist sicherer Kontext) mit `execCommand("copy")`-Fallback, kein Clipboard-Plugin. Die Kachel zeigt `PhLink` + Anzahl neben dem Dokument-Indikator.
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

## 6a. Markdown-Editor (`pages/document.vue`)

- Seite im `default`-Layout, Vollhöhe (`h-screen`, Panes mit `min-h-0`/`overflow-y-auto`). Liest die Datei mit `readTextFile`, Fehler oder fehlende Query-Parameter → Fehlermeldung mit Zurück-Button.
- `components/document/MarkdownEditor.vue`: CodeMirror 6 (einzelne `@codemirror/*`-Pakete, nicht das Meta-Paket), `v-model` + `lintCount`-Event; Theme über die CSS-Variablen aus `layouts/default.vue` (transparenter Hintergrund, Container trägt `bg-elevation-1`).
- `components/document/MarkdownPreview.vue`: `markdown-it` mit `html: false` per `v-html`; Link-Klicks werden abgefangen, `http(s)` über `openUrl`.
- `utils/markdownLint.ts`: `markdownlint/sync` (Browser-Build über die `browser`-Condition) als CodeMirror-`LintSource`; Regeln Default minus MD013/MD033/MD034/MD041.
- Speichern: Autosave 1 s nach der letzten Änderung, `Strg+S`, Flush in `onBeforeRouteLeave`; Dateien mit CRLF werden mit CRLF zurückgeschrieben (CodeMirror arbeitet intern mit `\n`).
- Versionshistorie (Spec: `docs/specs/document-history.md`): `utils/documentHistory.ts` (reine Helfer: Key = FNV-1a des normalisierten Pfads, Snapshot-Dateinamen, Konstanten) und `composables/useDocumentHistory.ts` (fs-Zugriffe, Fehler nur geloggt). Ablage im App-Datenordner (`%APPDATA%\tech.trobonox.kanri\document-history\<key>\<zeitstempel>.md`), höchstens 20 je Dokument. `flushSave` sichert den Plattenstand vor dem Schreiben (erste Speicherung der Sitzung, danach alle 10 min); Dropdown „Verlauf" für manuelles Sichern und Wiederherstellen. `Dropdown.vue` reicht dafür optional `update:open` durch. Escape schließt ein offenes radix-Menü, ohne das Event als behandelt zu markieren; die Seite prüft deshalb den Öffnungszustand. Automatische Bereinigung (`runScheduledDocumentHistoryCleanup`, aufgerufen in `layouts/default.vue` nach `boards.init()`): höchstens einmal je 24 h werden verwaiste Historien (Key zu keinem Dokumentpfad eines Boards) und Snapshots älter als 30 Tage gelöscht; Zeitstempel des letzten Laufs in `settings.documentHistoryLastCleanup`.
- `.bg-accent-checked` (Switch-Farbe) ist in `pages/settings.vue` definiert und nur mit deren CSS-Chunk geladen; die Editor-Seite definiert die Regel deshalb selbst.

## 6b. Volltextsuche (`pages/search.vue`)

- Spec: `docs/specs/full-text-search.md`. Aufruf über den Sidebar-Eintrag (Lupe) oder `Strg+Umschalt+F`; das Kürzel hängt am `keydown`-Listener in `components/Sidebar.vue` (dort liegt auch `F1`), ignoriert Events aus Eingabefeldern und `contenteditable`. Ein zentrales Shortcut-System gibt es nicht; Board-Shortcuts sind seitenlokal in `[id].vue`.
- `utils/search.ts` (rein): `buildSearchIndex(boards, documentTexts)` baut je Karte Felder (Titel, Beschreibung via `stripHtml`, Aufgaben, Tags, Links, Dokument-Dateinamen, Dokumentinhalte), `searchIndex(index, parseQuery(q))` liefert nach Board gruppierte Treffer (UND über alle Felder einer Karte, ein Treffer je Karte), Ausschnitte als Segmente `{ text, match }`. Die Seite rendert die Segmente per Textinterpolation mit `<mark>`, kein `v-html`.
- `composables/useSearch.ts`: modulweiter Cache der Dokumentinhalte (Schlüssel `normalizeDocumentPath`), einmal je Sitzung per `readTextFile` gefüllt, Lesefehler werden übersprungen; `resetDocumentTexts` für „Neu einlesen", `updateCachedDocumentText` wird vom Editor nach dem Speichern aufgerufen.
- Der Index wird bei jedem Suchlauf (200 ms entprellt) neu aus dem Boards-Store gebaut.
- Ergebnis-Klick → `/kanban/<boardId>?card=<cardId>`; `[id].vue` öffnet in `openCardFromQuery` nach dem Laden den Karten-Dialog und entfernt den Parameter per `router.replace`. Dieser Query-Parameter ist der Einstiegspunkt für jede künftige „Karte direkt öffnen"-Navigation.

## 7. Startseite, Import/Export, Settings

- `pages/index.vue`: Board-Liste mit `KanbanBoardPreview` (Mini-Rendering der Spalten/Karten inkl. `card.color`), Sortierung (`utils/sorting.ts`), NewBoard-Modal (`utils/exampleData.ts`), Pins.
- `pages/import.vue`: Import von Kanri-Vollexport, einzelnem Board, KanbanElectron und Trello, jeweils via zod-Schema; Export eines Boards in `[id].vue` (`exportBoardToJson`, `JSON.stringify(board)`).
- `pages/settings.vue`: Theme-Wahl (`CustomThemeEditor` mit `HexColorInput` + `<input type="color">`), Sprache, Verhalten, Standardordner für Markdown-Dokumente.
- **Capabilities** (`src-tauri/capabilities/main.json`): für Dokumente zusätzlich `fs:allow-exists`, `opener:allow-open-path` (Scope `**/*.md`, `**/*.markdown`) und `http(s)://**` bei `opener:allow-open-url`; Karten-Links (`http`, `https`, `mailto`) deckt bereits `opener:default` ab (`allow-default-urls`, Glob-Scope, `*` matcht auch `/`); für die Versionshistorie `fs:allow-appdata-read/write/meta-recursive`, `fs:allow-mkdir`, `fs:allow-read-dir`, `fs:allow-remove`, `fs:allow-stat`. Dateizugriff auf per Dialog gewählte Pfade kommt über den Dialog-Scope, `tauri-plugin-persisted-scope` hält ihn über Neustarts.

## 8. Toolchain & Qualitätssicherung

- pnpm via `corepack pnpm …` (pnpm nicht global). `nuxi prepare` erzeugt `.nuxt/` (nötig für ESLint-Config und Typen).
- `pnpm lint` (eslint + tailwind-Plugin), `pnpm generate` (statischer Build nach `.output/public`, den Tauri bündelt), `pnpm tauri dev` für die Desktop-App (Rust-Toolchain vorhanden).
- Keine lauffähige Testsuite (vitest fehlt in devDependencies). Manuelles Testen der CRUD-Kernfunktionen ist laut CONTRIBUTING Pflicht.
- Lizenz-/REUSE-Regeln: siehe `CLAUDE.md`.

## 9. Bekannte Fallstricke

- `Column.vue`/`Card.vue` kopieren Props in lokale Refs; direkte Mutation von Props vermeiden, Änderungen immer über Store-Actions.
- Arrays an Karten (`tasks`, `tags`, `documents`, `links`) in Store-Actions in place mutieren (`push`, `splice`), nicht durch eine gefilterte Kopie ersetzen: Kachel und Karten-Dialog halten das ursprüngliche Array in lokalen Refs, eine neue Array-Instanz erreicht sie erst beim nächsten Öffnen (Bug beim Entfernen von Dokumenten, behoben 2026-11-03).
- Tailwind-Klassen dynamisch zusammenzusetzen (`"bg-" + name`) funktioniert nicht (JIT). Vollständige Klassennamen verwenden.
- `Card.id` kann in Altdaten fehlen → Vergleiche über `id` defensiv halten.
- Auto-Save ist deep-reaktiv: große Arrays ersetzen ist ok, aber Mutationen außerhalb des Stores (z. B. direkt am `props.card`) werden ebenfalls persistiert, nur ohne `lastEdited`.
- Zoom-Level (-1..2) beeinflusst fast jede Klasse in Column/Card; neue UI-Elemente in Spalte/Karte sollten ein `computed` für die Größe bekommen.
- Die Upstream-CONTRIBUTING lehnt KI-generierte Beiträge ab; Änderungen in diesem Fork sind nicht für Upstream-PRs gedacht.
