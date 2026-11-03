<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Volltextsuche über alle Boards

Status: implementiert (Branch `feat/full-text-search`, abgezweigt von `feat/card-links`, 2026-11-03), manueller UI-Test gemäß §9 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`, verwandte Specs: `docs/specs/card-documents.md`, `docs/specs/card-links.md`.

## 1. Ziel

Eine eigene Suchseite findet Karten über alle Boards hinweg: in Kartentitel, Beschreibung, Aufgaben, Tags, Link-Titeln und -URLs, Dateinamen verknüpfter Dokumente und im Inhalt der verknüpften Markdown-Dokumente. Ein Treffer führt direkt zur Karte.

## 2. Verhalten

- **Aufruf:** Sidebar-Eintrag mit Lupe (`/search`) oder `Strg+Umschalt+F` überall in der App. Das Kürzel feuert nicht, solange der Fokus in einem Eingabefeld liegt (`input`, `textarea`, `select`, `contenteditable`, also auch tiptap und CodeMirror).
- **Suchfeld** mit Autofokus beim Öffnen der Seite. `Escape` im Feld leert es.
- **Suchlauf:** entprellt 200 ms nach der letzten Eingabe. Erst ab 2 Zeichen (getrimmte Eingabe), darunter der leere Zustand.
- **Abfrage:** Eingabe wird an Leerraum in Wörter zerlegt, doppelte Wörter entfallen. Vergleich case-insensitiv (`toLowerCase`), Teilwort-Treffer (`"plan"` findet `"Releaseplanung"`). Umlaute werden nicht gefaltet (`ae` findet kein `ä`, `ss` kein `ß`). Keine Phrasen, keine Operatoren.
- **UND-Verknüpfung je Karte:** Eine Karte ist ein Treffer, wenn jedes Wort in irgendeinem ihrer Felder vorkommt (die Wörter dürfen in verschiedenen Feldern stehen, z. B. eines im Titel, eines im Dokument).
- **Durchsuchte Felder** (Reihenfolge = Priorität bei der Anzeige):
  1. Titel
  2. Beschreibung (tiptap-HTML ohne Tags, Entities dekodiert, Blockgrenzen als Leerzeichen)
  3. jede Aufgabe
  4. jedes Tag
  5. jeder Link (`"<Titel> <URL>"` bzw. nur URL)
  6. jeder Dokument-Dateiname (mit Endung)
  7. jeder Dokumentinhalt (roh, Markdown-Syntax bleibt, Leerraum zusammengefasst)
- Trennkarten (`---`) werden nicht durchsucht.
- **Ein Ergebnis je Karte.** Angezeigt wird das Feld, das die meisten Suchwörter enthält; bei Gleichstand das mit der höchsten Priorität.
- **Textausschnitt:** ca. 120 Zeichen, beginnend etwa 40 Zeichen vor dem ersten Treffer eines Suchworts im gewählten Feld; Ränder werden bis zu 15 Zeichen auf eine Wortgrenze verschoben; abgeschnittene Enden bekommen `…`. Alle Suchwörter im Ausschnitt werden hervorgehoben.
- **Dokumentinhalte:** Checkbox „In Dokumentinhalten suchen" (Default an, persistiert in den Settings). Beim ersten Suchlauf der Sitzung mit aktiver Checkbox werden alle verknüpften Dokumente einmal mit `readTextFile` gelesen (in Batches zu 8 parallel) und im Speicher gecacht (Modulvariable, überlebt Seitenwechsel, nicht App-Neustarts). Spätere Suchläufe lesen nur Pfade, die noch nicht im Cache sind (z. B. neu verknüpfte Dokumente). Lesefehler (Datei fehlt, Pfad außerhalb des fs-Scopes) → Dokument wird übersprungen und bis zum Neueinlesen nicht erneut versucht, nur `console.warn`, kein Dialog. Während des Lesens erscheint „Dokumente werden eingelesen…".
- **Button „Dokumente neu einlesen"** leert den Cache und startet die Suche neu. Deaktiviert, solange gelesen wird oder die Checkbox aus ist.
- **Ergänzung zur Vorgabe:** Speichert der In-App-Editor (`pages/document.vue`) ein Dokument, wird ein bereits gecachter Inhalt sofort aktualisiert (`updateCachedDocumentText`). Sonst würde die Suche Änderungen aus der App selbst erst nach „Neu einlesen" finden. Änderungen außerhalb der App brauchen weiterhin „Neu einlesen".
- **Aktualität der Board-Daten:** Der Index wird bei jedem Suchlauf neu aus dem Boards-Store gebaut (kein persistenter Index). Bei üblichen Datenmengen ist das im Millisekundenbereich.
- **Archivierte Karten** (`docs/specs/card-archive.md`) werden mit allen Feldern mitindexiert, im Ergebnis mit dem Badge „Archiv" und ihrer ursprünglichen Spalte angezeigt, und ein Klick öffnet die Archiv-Seite des Boards (`/kanban/<boardId>/archive`) statt eines Karten-Dialogs.
- **Ergebnis öffnen:** Klick navigiert zu `/kanban/<boardId>?card=<cardId>`. Die Board-Seite öffnet nach dem Laden das Karten-Dialog dieser Karte (`openEditCardModal`) und entfernt den Query-Parameter per `router.replace`. Bei Dokument-Treffern wird ebenfalls die Karte geöffnet; das Dokument ist von dort erreichbar. Karten ohne `id` (Altdaten, nie in einer Spalte gerendert) öffnen nur das Board. Unbekannte `card`-IDs werden still ignoriert (Parameter wird trotzdem entfernt).

## 3. UI

### 3.1 Suchseite (`pages/search.vue`)

Layout wie die Settings-Seite (`default`-Layout, Überschrift `text-4xl font-bold`, Untertitel `text-dim-3`).

- Suchfeld in einem Rahmen `bg-elevation-1 border-elevation-3 rounded-md border` mit `PhMagnifyingGlass`, Eingabe transparent, `text-lg`, max. Breite `max-w-3xl`.
- Darunter: Checkbox (radix `CheckboxRoot`, gleiche Klassen wie die Aufgaben-Checkboxen im Karten-Dialog) mit Label, Button „Dokumente neu einlesen" (`bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1`, `disabled:opacity-50`), Ladehinweis.
- Zustände: weniger als 2 Zeichen → `emptyState`; Suche für die aktuelle Eingabe fertig und leer → `noResults`; sonst Trefferanzahl (`hitCount`, Plural) und Gruppen. Solange eine neue Suche aussteht, bleiben die alten Ergebnisse verborgen (kein Flackern mit veralteten Treffern).
- Gruppe je Board (Reihenfolge wie im Store): `h2` mit Boardtitel. Je Treffer ein `button` (`bg-elevation-1 bg-elevation-2-hover … rounded-md px-4 py-2 text-left`): erste Zeile Kartentitel (fett, einzeilig gekürzt) und rechts gedimmt „Spalte · Trefferfeld"; zweite Zeile Ausschnitt (`text-dim-2 text-sm`).
- **Hervorhebung ohne `v-html`:** `utils/search.ts` liefert den Ausschnitt als Liste von Segmenten `{ text, match }`; das Template rendert sie per Textinterpolation, Treffer in `<mark class="search-mark">`. Vue escaped damit jeden Inhalt, auch HTML aus Beschreibungen oder Dokumenten. `.search-mark` (scoped): Hintergrund `var(--accent)`, Text `var(--text-buttons)`.
- Trefferfeld-Bezeichnungen: Titel, Beschreibung, Aufgabe, Tag, Link, „Dokumentname <Name>", „Dokument <Name>" (Name = Dateiname ohne Endung).

### 3.2 Sidebar (`components/Sidebar.vue`)

Eintrag direkt unter „Startseite": `nuxt-link` nach `/search` mit `PhMagnifyingGlass size-7`, gleiche Klassen wie die übrigen Einträge, Tooltip „Suche (Strg+Umschalt+F)". Das Kürzel hängt am bestehenden `keydown`-Listener der Sidebar (dort liegt schon `F1` für die Hilfe; die Sidebar ist auf jeder Seite des `default`-Layouts gemountet). Ein eigenes Shortcut-System oder eine Command-Palette gibt es nicht; die Board-Shortcuts in `pages/kanban/[id].vue` sind seitenlokal und reagieren nicht auf `f`.

### 3.3 Board-Seite (`pages/kanban/[id].vue`)

`openCardFromQuery()` am Ende von `onMounted` (nach `board.init()`, Hintergrundbild und einem `nextTick`, damit das per `v-show` gemountete `ModalEditCard` existiert).

## 4. Datenmodell

Keine Änderung an Boards/Karten. Neues Setting in `stores/settings.ts` (Tauri-Store-Key gleichnamig): `searchDocumentContentsEnabled: boolean`, Default `true`, Setter `setSearchDocumentContentsEnabled` nach dem Muster von `setMarkdownPreviewEnabled`.

## 5. Module

### 5.1 `utils/search.ts` (rein, ohne DOM/Store/Tauri, Node-Smoke-Test)

- `stripHtml(html)`, `parseQuery(query) → string[]` (leer unter `MIN_QUERY_LENGTH = 2`)
- `buildSearchIndex(boards, documentTexts: Map<normalizeDocumentPath(path), text>) → SearchIndexCard[]` (je Karte Board/Spalte/Karte-Metadaten und Felder `{ field, detail?, text, lower }`)
- `searchIndex(index, terms) → SearchResultGroup[]` (UND je Karte, Feldwahl, Gruppierung)
- `buildSnippet(text, terms, length = 120) → SnippetSegment[]`, `highlightSegments(text, terms)` (Regex aus escapten Suchwörtern, längste zuerst, Flags `giu`)
- `countHits(groups)`

### 5.2 `composables/useSearch.ts` (fs-Zugriff)

- Modulweiter Cache `Map<normalisierter Pfad, string | null>`, `documentsLoading`-Ref, Generationszähler gegen Lesevorgänge, die ein Reset überholt hat, und eine Promise-Kette, damit parallele Suchläufe nicht doppelt lesen.
- `useSearch()` → `{ documentsLoading, ensureDocumentTexts(boards), resetDocumentTexts() }`; `ensureDocumentTexts` liefert eine `Map` der lesbaren Texte für `buildSearchIndex`.
- `updateCachedDocumentText(path, text)` für den Editor (§2).
- **Capabilities:** keine Änderung. `readTextFile` auf Dokumentpfade nutzt denselben Weg wie der Editor (Dialog-Scope + `tauri-plugin-persisted-scope`, `fs:allow-read-text-file`). Nicht lesbare Pfade werden übersprungen.

### 5.3 Suchseite, Wettlauf

Jeder Suchlauf bekommt eine laufende Nummer; nur der neueste schreibt Ergebnisse (ein langsamer erster Lauf mit Dokument-Lesen überschreibt keine neueren Treffer). Wechsel der Checkbox speichert das Setting und sucht sofort neu.

## 6. Komponentenänderungen (Übersicht)

- neu: `pages/search.vue`, `utils/search.ts`, `composables/useSearch.ts`
- `components/Sidebar.vue`: Eintrag + Kürzel (§3.2)
- `pages/kanban/[id].vue`: `openCardFromQuery` (§3.3)
- `pages/document.vue`: `updateCachedDocumentText` nach erfolgreichem Schreiben
- `stores/settings.ts`: Setting (§4)
- `i18n/locales/en.json`, `de.json`: Keys (§7)

## 7. i18n-Keys (en + de)

- `components.sidebar.search`: "Search (Ctrl+Shift+F)" / "Suche (Strg+Umschalt+F)"
- `pages.search.title`: "Search" / "Suche"
- `pages.search.subtitle`: "Search all boards: card titles, descriptions, tasks, tags, links and linked documents." / "Alle Boards durchsuchen: Kartentitel, Beschreibungen, Aufgaben, Tags, Links und verknüpfte Dokumente."
- `pages.search.placeholder`: "Search for words…" / "Nach Wörtern suchen…"
- `pages.search.searchDocumentContents`: "Search in document contents" / "In Dokumentinhalten suchen"
- `pages.search.reloadDocuments`: "Reload documents" / "Dokumente neu einlesen"
- `pages.search.loadingDocuments`: "Reading documents…" / "Dokumente werden eingelesen…"
- `pages.search.emptyState`: "Enter at least two characters. All words have to occur in a card." / "Mindestens zwei Zeichen eingeben. Alle Wörter müssen in einer Karte vorkommen."
- `pages.search.noResults`: "No results." / "Keine Treffer."
- `pages.search.hitCount`: "{count} result | {count} results" / "{count} Treffer | {count} Treffer"
- `pages.search.fieldTitle` / `fieldDescription` / `fieldTask` / `fieldTag` / `fieldLink`: "Title"/"Titel", "Description"/"Beschreibung", "Task"/"Aufgabe", "Tag"/"Tag", "Link"/"Link"
- `pages.search.fieldDocumentName`: "Document name {name}" / "Dokumentname {name}"
- `pages.search.fieldDocumentContent`: "Document {name}" / "Dokument {name}"

## 8. Nicht-Ziele

- Persistenter Suchindex, Volltextindex im Hintergrund, Dateisystem-Watcher für Dokumente.
- Fuzzy-Suche, Umlaut-/Akzent-Faltung, Stemming, Phrasen- oder Operator-Syntax, Ranking über Boards hinweg.
- Mehrere Ergebnisse je Karte (alle Trefferfelder), Treffer innerhalb von Dokumenten anspringen, Dokument direkt öffnen.
- Hervorhebung des Treffers auf dem Board oder im Karten-Dialog.
- Filter nach Board, Spalte, Tag oder Fälligkeit.
- Eintrag des Kürzels in der Hilfe (`ModalHelp`); das Kürzel steht im Tooltip des Sidebar-Eintrags.

## 9. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen; keine neuen. `corepack pnpm generate` erfolgreich, neue Klassen und `.search-mark` im generierten CSS. Node-Smoke-Test für `utils/search.ts` (HTML-Strip, Abfrage, Hervorhebung, Ausschnitt, UND über Felder, Feldwahl, Trennkarten, Karten ohne id).

Manueller UI-Test (`corepack pnpm tauri dev`, PowerShell):

1. Sidebar zeigt die Lupe unter „Startseite", Tooltip mit Kürzel; Klick öffnet die Suche, das Feld hat den Fokus.
2. Von der Startseite, einem Board und den Settings aus `Strg+Umschalt+F` → Suchseite. Im Kartentitel-Edit, in der Beschreibung (tiptap) und im Markdown-Editor löst das Kürzel nichts aus.
3. Ein Zeichen → leerer Zustand; zwei Zeichen → Treffer erscheinen nach kurzer Pause; Groß-/Kleinschreibung egal.
4. Zwei Wörter, eines im Titel, eines in einer Aufgabe einer Karte → Karte erscheint; ein Wort, das nirgends vorkommt, ergänzt → „Keine Treffer".
5. Treffer in Beschreibung zeigt „Beschreibung" und Klartext ohne HTML; Beschreibung mit `<b>` als Text (im Editor getippt) erscheint als Text, nicht fett.
6. Tag-, Link-Titel-, Link-URL- und Dokumentnamen-Treffer zeigen das passende Trefferfeld.
7. Wort, das nur in einem verknüpften Markdown-Dokument steht → Treffer „Dokument <Name>". Checkbox aus → Treffer verschwindet; nach App-Neustart ist die Checkbox weiterhin aus.
8. Dokument extern ändern → ohne Neueinlesen alter Stand; „Dokumente neu einlesen" → neuer Stand. Dokument im In-App-Editor ändern, zurück zur Suche → neuer Stand ohne Neueinlesen.
9. Verknüpftes Dokument umbenennen/löschen → Suche läuft ohne Dialog, das Dokument fehlt nur in den Treffern.
10. Klick auf einen Treffer → Board öffnet sich, Karten-Dialog der Karte ist offen, URL enthält kein `?card=` mehr; Schließen und Zurück-Navigation öffnen den Dialog nicht erneut.
11. Trefferanzahl stimmt mit der Zahl der Einträge überein; Gruppen tragen den Boardtitel, Einträge den Spaltennamen.
12. Sprache Deutsch: alle Texte übersetzt.
