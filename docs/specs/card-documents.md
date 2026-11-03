<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Markdown-Dokumente an Karten

Status: implementiert (Branch `feat/card-documents`, 2026-11-03), manueller UI-Test gemäß §9 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`. Entscheidungen stammen aus einer Grill-Session mit dem Nutzer am 2026-11-03; sie sind nicht neu zu verhandeln.

## 1. Ziel

Eine Karte kann beliebig viele Markdown-Dokumente verknüpfen. Die Dokumente sind echte `.md`-Dateien im Dateisystem; die Karte speichert nur Verweise. Man kann bestehende Dateien verknüpfen oder neue anlegen. Ein Klick auf ein Dokument öffnet einen eigenen, einfachen Texteditor in der App mit Syntax-Highlighting, rudimentärem Syntaxcheck (markdownlint) und Live-Vorschau.

## 2. Verhalten

- **Verknüpfen:** Im Karten-Dialog gibt es einen Abschnitt „Dokumente" mit Liste, Button „Vorhandenes hinzufügen…" (Öffnen-Dialog, Mehrfachauswahl, Filter `md`, `markdown`) und Button „Neu erstellen…" (Speichern-Dialog, vorbelegt mit `<Kartentitel>.md`, siehe §2 „Standardordner").
- **Neu erstellen:** Die Datei wird sofort mit dem Inhalt `# <Kartentitel>\n` geschrieben, als Verweis an die Karte gehängt und direkt im Editor geöffnet.
- **Doppelte Pfade:** Ein Pfad wird pro Karte höchstens einmal verknüpft (Vergleich nach `normalize()`); ein zweiter Versuch wird stumm ignoriert.
- **Anzeigename:** Dateiname ohne Endung, aus dem Pfad abgeleitet, nicht editierbar.
- **Reihenfolge:** Einfügereihenfolge, neueste unten, kein Sortieren.
- **Öffnen:** Klick auf einen Eintrag schließt den Karten-Dialog und navigiert zur Editor-Seite (§3.2).
- **Kontextmenü je Eintrag** (radix `ContextMenu`, wie in `Card.vue`): „Öffnen", „Im Explorer anzeigen" (`revealItemInDir`), „Mit Standardprogramm öffnen" (`openPath`), „Neu verknüpfen…" (Öffnen-Dialog, Einzelauswahl, ersetzt den Pfad), „Verknüpfung entfernen" (entfernt nur den Verweis, nie die Datei, keine Rückfrage).
- **Datei fehlt:** Beim Öffnen des Karten-Dialogs wird für jeden Verweis `exists()` geprüft (asynchron, Ergebnis in einer Map `documentExists[docId]`). Fehlende Dateien zeigen ein Warn-Icon, der Klick öffnet nichts, im Kontextmenü sind nur „Neu verknüpfen…" und „Verknüpfung entfernen" aktiv. Nichts wird automatisch entfernt. Ein `exists()`-Fehler (Pfad außerhalb des Tauri-fs-Scopes, z. B. nach Import auf anderem Rechner) zählt als „fehlt".
- **Standardordner:** Globale Einstellung „Standardordner für Markdown-Dokumente" (Settings-Seite, Ordner-Dialog, leerbar). Ist er gesetzt, starten Öffnen- und Speichern-Dialoge dort (`defaultPath`). Ist er leer, wird kein `defaultPath` übergeben (System-Default). Kein Merken des zuletzt benutzten Ordners.
- **Speichern im Editor:** Autosave, entprellt 1000 ms nach der letzten Änderung, plus `Strg+S` (sofort). Beim Verlassen der Seite (Zurück-Button, `Escape`, Router-Leave) wird ein ausstehender Save vorher geschrieben. Keine „ungespeicherte Änderungen"-Abfrage.
- **Vorschau:** Live, `markdown-it` mit `html: false` (rohes HTML wird escaped), `linkify: true`. Links in der Vorschau navigieren nie den WebView: `click` auf `a` wird abgefangen; `http(s)`-Links werden über `openUrl` im Systembrowser geöffnet, andere ignoriert. Bilder mit relativem Pfad werden nicht aufgelöst (Nicht-Ziel).
- **Syntaxcheck:** `markdownlint` (Browser-Build, `lint` aus `markdownlint/sync`) auf dem Editor-Inhalt, Ergebnis als CodeMirror-Diagnostics (Severity `warning`) in der Zeile plus Zähler im Kopf. Regelsatz: Default minus `MD013` (Zeilenlänge), `MD033` (Inline-HTML), `MD034` (nackte URLs), `MD041` (erste Zeile Überschrift). Lint läuft entprellt (300 ms) über `linter()` aus `@codemirror/lint`.
- **Karte duplizieren:** Verweise werden mitkopiert (beide Karten zeigen auf dieselben Dateien). **Karte löschen:** nur Verweise verschwinden, Dateien bleiben.
- **Export/Import:** Pfade bleiben im Board-JSON wie sie sind (analog Hintergrundbild). Nach Import auf anderem Rechner erscheinen die Dokumente als „fehlt".

## 3. UI

### 3.1 Karten-Dialog (`components/modal/EditCard.vue`)

Neuer Abschnitt „Dokumente" nach dem Aufgaben-Abschnitt und vor den Tags, gleiche Überschriften-Optik (`h2 text-lg font-semibold`). Liste: je Eintrag Zeile mit Icon (`PhFileText` aus `@phosphor-icons/vue`, bei fehlender Datei `PhWarning` in `text-red-500`), Anzeigename, Tooltip (`title`) mit vollem Pfad. Zeile ist `button` (Klick = Öffnen), umschlossen von `ContextMenuRoot/Trigger/Portal/Content` wie in `Card.vue`. Darunter die zwei Buttons im Stil der bestehenden Dialog-Buttons (`bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1`).

### 3.2 Editor-Seite (`pages/document.vue`)

Route `/document?board=<boardId>&card=<cardId>&doc=<docId>`. Die Seite sucht den Verweis im Boards-Store (Board → alle Spalten → Karte → `documents`), liest die Datei mit `readTextFile`. Fehlt ein Parameter oder schlägt das Lesen fehl: Fehlermeldung mit Zurück-Button, kein Editor.

Layout (Vollfenster, `default`-Layout wie die Settings-Seite):

- Kopfzeile: Zurück-Button (`ArrowLeftIcon`, führt nach `/kanban/<boardId>`), Dateiname (Tooltip: Pfad), Speicherstatus (`pages.document.statusSaved` / `statusSaving` / `statusError`; „Speichert…" erscheint bereits ab der ersten ungesicherten Änderung), Lint-Zähler (`n Hinweise`, ausgeblendet bei 0), Umschalter „Vorschau" (Toggle wie in den Settings, Zustand in Setting `markdownPreviewEnabled`, Default `true`).
- Darunter `flex-row`: Editor (`MarkdownEditor`) und, wenn aktiviert, Vorschau (`MarkdownPreview`) je `basis-1/2`, beide eigenständig scrollbar (`overflow-y-auto`), Höhe = Restfenster. Ohne Vorschau Editor volle Breite.
- `Escape` (Window-Listener, nur wenn kein Dialog offen) = Zurück. Beim Zurück und in `onBeforeRouteLeave` wird ein ausstehender Save geflusht.

### 3.3 Komponenten

- `components/document/MarkdownEditor.vue`: kapselt CodeMirror 6. Props `modelValue: string`; Emits `update:modelValue(value)`, `lintCount(count: number)`. Extensions: `lineNumbers`, `history`, `highlightActiveLine`, `drawSelection`, `EditorView.lineWrapping`, `keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab])`, `markdown()` aus `@codemirror/lang-markdown`, `linter(markdownLinter, { delay: 300 })` + `lintGutter()`, Theme (§3.4). Externe Änderungen von `modelValue` werden nur übernommen, wenn sie vom Editor-Inhalt abweichen (kein Cursor-Reset bei eigenen Updates). `Strg+S` wird in der Seite behandelt (Window-`keydown`), nicht im Editor; der Editor darf das Browser-Default nicht auslösen (`preventDefault` in der Seite).
- `components/document/MarkdownPreview.vue`: Prop `source: string`; rendert über `markdown-it` (`html: false, linkify: true, breaks: false`) in ein `div.markdown-preview` per `v-html`; Klick-Handler für Links (§2). Eigene scoped Styles für `h1..h6`, `p`, `ul/ol`, `blockquote`, `code`, `pre`, `table`, `hr`, `a` (Akzentfarbe) – Orientierung an den `.tiptap`-Styles in `components/kanban/KanbanDescriptionEditor.vue`.
- `utils/markdownLint.ts`: exportiert `markdownLinter` (CodeMirror `LintSource`): ruft `lint({ strings: { doc: text }, config })`, mappt jede Meldung auf `{ from, to, severity: "warning", message: "<ruleNames[0]>: <ruleDescription>" }` (Zeile → `doc.line(lineNumber)`, `from = line.from`, `to = line.to`). Config-Objekt mit `default: true` und den vier abgeschalteten Regeln.
- `utils/documentPaths.ts`: `documentDisplayName(path)` (Basename ohne Endung, Windows- und POSIX-Trenner), `cardTitleToFileName(title)` (Slug: Whitespace → `-`, verbotene Zeichen `<>:"/\|?*` entfernen, Trim, Fallback `document`) und `.md` anhängen.

### 3.4 Theme

CodeMirror-Theme über `EditorView.theme({...})` mit den Kanri-CSS-Variablen (siehe `assets/css/themes`): Hintergrund `bg-elevation-1`-Farbe, Text normal, Gutter `bg-elevation-2`, aktive Zeile leicht abgesetzt, Auswahl in Akzentfarbe mit Transparenz. `HighlightStyle` aus `@lezer/highlight` mit wenigen Tags: `heading` fett, `emphasis` kursiv, `strong` fett, `link`/`url` Akzentfarbe, `monospace` Monospace, `quote` gedimmt. Kein Fremd-Theme. Ob die Theme-Klassen als CSS-Variablen verfügbar sind, ist im Theme-CSS zu prüfen; falls nicht, die Farben über `getComputedStyle` auf einem Element mit den Theme-Klassen einmalig lesen oder, einfacher, den Editor-Container mit den Theme-Klassen stylen und CodeMirror auf `background: transparent` + `color: inherit` setzen (bevorzugt).

### 3.5 Karten-Kachel (`components/kanban/Card.vue`)

Im Footer neben Aufgaben und Fälligkeit: `PhFileText` plus Anzahl, nur wenn `documents.length > 0`, gleiche Klassen wie die Aufgaben-Anzeige (`cardTextColorDim`, `iconSizeClass`, `taskTextClass`). Der lokale `card`-Watcher in `Card.vue` muss `documents` mit übernehmen.

### 3.6 Settings-Seite (`pages/settings.vue`)

Neue Zeile im Abschnitt „Preferences": Überschrift, Subtext, darunter Pfadanzeige (gedimmt, „nicht gesetzt" wenn leer), Button „Ordner wählen…" (`open({ directory: true })`), Button „Zurücksetzen" (nur wenn gesetzt).

## 4. Datenmodell

`types/kanban-types.d.ts`:

```ts
export declare interface CardDocument {
  id: string;   // generateUniqueID()
  path: string; // absoluter Pfad
}
// Card:
documents?: Array<CardDocument> | null;
```

`types/json-schemas.ts`, `kanriCardSchema`: `documents: z.array(z.object({ id: z.string().optional(), path: z.string() })).optional().nullable()`.

Settings (`stores/settings.ts`, Tauri-Store-Keys gleichnamig): `markdownDocumentsFolder: string` (Default `""`), `markdownPreviewEnabled: boolean` (Default `true`), mit `loadSettings`-Einlesen und Settern `setMarkdownDocumentsFolder`, `setMarkdownPreviewEnabled` nach dem Muster der bestehenden Setter.

## 5. Store-Logik (`stores/boards.ts` + Fassade `composables/useBoard.ts`)

| Aktion | Verhalten |
| --- | --- |
| `addCardDocument(boardId, columnId, cardId, path)` | legt `card.documents` bei Bedarf an; ignoriert, wenn ein Eintrag mit gleichem Pfad existiert; pusht `{ id: generateUniqueID(), path }`; `lastEdited`; gibt die neue `id` (oder die vorhandene) zurück |
| `removeCardDocument(boardId, columnId, cardId, documentId)` | filtert den Eintrag heraus; `lastEdited` |
| `setCardDocumentPath(boardId, columnId, cardId, documentId, path)` | ersetzt `path`; zeigt bereits ein anderer Eintrag der Karte auf diesen Pfad, wird der neu verknüpfte Eintrag stattdessen entfernt (ein Pfad pro Karte höchstens einmal); `lastEdited` |
| `duplicateCard` (bestehend) | prüfen, dass die Kopie `documents` tief kopiert (Objekt-Kopie je Eintrag, gleiche `id`s sind zulässig) |

`useBoard` spiegelt die drei neuen Aktionen mit `columnId, cardId, …` und exportiert sie. Ein Lookup-Helfer `findCardDocument(boardId, documentId)` im Store (oder in `useBoard`) für die Editor-Seite.

## 6. Komponentenänderungen

- `EditCard.vue`: Abschnitt Dokumente (§3.1), neue Emits `addCardDocument(columnId, cardId, path)`, `removeCardDocument(columnId, cardId, documentId)`, `setCardDocumentPath(columnId, cardId, documentId, path)`, `openDocument(columnId, cardId, documentId)`; Dialoge (`open`/`save` aus `@tauri-apps/plugin-dialog`), `writeTextFile` für neue Dateien, `exists` für die Prüfung. Prop `card` liefert `documents`.
- `pages/kanban/[id].vue`: die neuen Emits an `board.*` binden; `openDocument` schließt den Dialog und ruft `router.push({ path: "/document", query: { board, card, doc } })`.
- `Card.vue`: Indikator (§3.5).
- `pages/document.vue`, `components/document/MarkdownEditor.vue`, `components/document/MarkdownPreview.vue`, `utils/markdownLint.ts`, `utils/documentPaths.ts`: neu.
- `pages/settings.vue`, `stores/settings.ts`: Einstellung (§3.6, §4).
- `src-tauri/capabilities/*.json`: ergänzen `fs:allow-exists` (für die Fehlt-Prüfung) und `opener:allow-open-path` mit `allow` für `**/*.md`, `**/*.MD`, `**/*.markdown`, `**/*.MARKDOWN` (der Scope-Glob ist case-sensitiv, der Windows-Dateidialog nicht). `http(s)`-Links sind über `opener:default` (`allow-default-urls`) bereits erlaubt. `dialog:allow-save` ist über `dialog:default` abgedeckt; `fs`-Zugriff auf per Dialog gewählte Pfade kommt über den Dialog-Scope plus `tauri-plugin-persisted-scope`.
- `package.json`: neue Dependencies (exakte Versionen eintragen, Stand 2026-11-03): `@codemirror/state 6.7.6`, `@codemirror/view 6.43.15`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/lang-markdown 6.5.2`, `@codemirror/lint 6.9.7`, `@lezer/highlight`, `markdown-it 15.0.3`, `@types/markdown-it 14.2.0` (dev), `markdownlint 0.42.0`. Alle MIT. Nicht das Meta-Paket `codemirror` (zieht Autocomplete u. a. mit). Prüfen, ob `pages/licenses/index.vue` eine generierte Liste nutzt und ob sie zu aktualisieren ist.

## 7. i18n-Keys (en + de)

- `modals.editCard.documentsTitle`: "Documents" / "Dokumente"
- `modals.editCard.documentsAddExisting`: "Add existing…" / "Vorhandenes hinzufügen…"
- `modals.editCard.documentsCreateNew`: "Create new…" / "Neu erstellen…"
- `modals.editCard.documentMissing`: "File not found" / "Datei nicht gefunden"
- `modals.editCard.documentOpen`: "Open" / "Öffnen"
- `modals.editCard.documentReveal`: "Show in file manager" / "Im Explorer anzeigen"
- `modals.editCard.documentOpenExternal`: "Open with default app" / "Mit Standardprogramm öffnen"
- `modals.editCard.documentRelink`: "Relink…" / "Neu verknüpfen…"
- `modals.editCard.documentRemove`: "Remove link" / "Verknüpfung entfernen"
- `pages.document.back`: "Back to board" / "Zurück zum Board"
- `pages.document.statusSaved`: "Saved" / "Gespeichert"
- `pages.document.statusSaving`: "Saving…" / "Speichert…"
- `pages.document.statusError`: "Could not save" / "Speichern fehlgeschlagen"
- `pages.document.lintCount`: "{count} hint | {count} hints" / "{count} Hinweis | {count} Hinweise"
- `pages.document.previewToggle`: "Preview" / "Vorschau"
- `pages.document.loadError`: "The document could not be opened." / "Das Dokument konnte nicht geöffnet werden."
- `pages.settings.preferencesMarkdownFolderHeading`: "Default folder for Markdown documents" / "Standardordner für Markdown-Dokumente"
- `pages.settings.preferencesMarkdownFolderSubtext`: "Open and save dialogs for card documents start in this folder." / "Öffnen- und Speichern-Dialoge für Kartendokumente starten in diesem Ordner."
- `pages.settings.preferencesMarkdownFolderNotSet`: "Not set" / "Nicht gesetzt"
- `pages.settings.preferencesMarkdownFolderChoose`: "Choose folder…" / "Ordner wählen…"
- `pages.settings.preferencesMarkdownFolderClear`: "Reset" / "Zurücksetzen"

## 8. Nicht-Ziele

- Markdown-Text in den Board-Daten einbetten; Dateien beim Export einpacken.
- Bilder mit relativen Pfaden in der Vorschau auflösen.
- WYSIWYG, Toolbar, Tabellen-Editor, Rechtschreibprüfung im Editor.
- Mehrere Dokumente gleichzeitig offen, Tabs, zweites Fenster.
- Sortieren der Dokumentliste; editierbarer Anzeigename.
- Rückfrage beim Entfernen einer Verknüpfung; Löschen von Dateien aus der App.
- Automatisches Entfernen fehlender Verweise.

## 9. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen auf `feat/column-collapse`; keine neuen Fehler oder Warnungen. `corepack pnpm generate` erfolgreich. Neue Tailwind-Klassen im generierten CSS vorhanden.

Manueller UI-Test (`corepack pnpm tauri dev`, PowerShell):

1. Settings: Standardordner wählen, App neu starten, Einstellung ist erhalten; zurücksetzen funktioniert.
2. Karte öffnen → „Neu erstellen…": Speichern-Dialog startet im Standardordner, Name ist `<Kartentitel>.md`; nach Bestätigen öffnet sich der Editor mit `# <Kartentitel>`.
3. Tippen → nach ~1 s Status „Gespeichert"; Datei auf der Platte enthält den Text. `Strg+S` speichert sofort.
4. Vorschau zeigt Überschriften, Listen, Code, Links; Link-Klick öffnet den Browser, WebView bleibt. Vorschau-Toggle wird nach Neustart erinnert.
5. Lint: ungeschlossener Code-Block oder Überschriften-Sprung (`#` → `###`) erzeugt Marker und Zähler; `MD013` (lange Zeile) meldet nichts.
6. `Escape`/Zurück führt zum Board; Karte zeigt Dokument-Icon mit Anzahl.
7. „Vorhandenes hinzufügen…" mit Mehrfachauswahl; doppelter Pfad wird nicht doppelt gelistet.
8. Kontextmenü: Im Explorer anzeigen, Mit Standardprogramm öffnen, Neu verknüpfen, Entfernen (Datei bleibt bestehen).
9. Datei im Explorer umbenennen → Karte öffnen: Eintrag mit Warn-Icon, nur Neu verknüpfen/Entfernen aktiv.
10. Karte duplizieren: Kopie hat dieselben Dokumente. Karte löschen: Dateien bleiben.
11. App neu starten: Verweise erhalten, Dateien ohne erneuten Dialog lesbar (persisted scope).
12. Board exportieren und JSON prüfen: `documents` mit Pfaden enthalten.
