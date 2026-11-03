<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Versionshistorie für Kartendokumente

Status: in Umsetzung (Branch `feat/document-history`, 2026-11-03). Baut auf `docs/specs/card-documents.md` auf. Architekturkontext: `docs/ARCHITECTURE.md`.

## 1. Ziel

Der Markdown-Editor speichert automatisch (Autosave nach 1 s). Damit ein versehentlich überschriebener Stand nicht verloren ist, legt die App in begrenztem Umfang Versionen (Snapshots) des Dokuments ab, die sich aus dem Editor heraus wiederherstellen lassen. Das ergänzt das Undo innerhalb der Sitzung (`Strg+Z`, CodeMirror-History), das beim Verlassen der Seite verloren geht.

## 2. Verhalten

- **Ablageort:** App-Datenordner (`BaseDirectory.AppData`), Unterordner `document-history/<key>/`, wobei `<key>` ein stabiler Hash des normalisierten Dokumentpfads ist (FNV-1a 32 Bit, hex; Normalisierung über `normalizeDocumentPath` aus `utils/documentPaths.ts`). Je Snapshot eine Datei `<zeitstempel>.md` mit dem vollständigen Text; Zeitstempel ISO-8601 UTC mit `:` und `.` durch `-` ersetzt (z. B. `2026-11-03T08-15-30-123Z.md`), so dass die Namen chronologisch sortieren. Keine Metadatei.
- **Wann ein Snapshot entsteht** (immer vom Stand, der gerade auf der Platte liegt, also `lastSavedContent` vor dem Überschreiben):
  1. Beim ersten Schreibvorgang einer Editor-Sitzung immer, außer der Text ist identisch mit dem neuesten vorhandenen Snapshot.
  2. Bei jedem weiteren Schreibvorgang, wenn der neueste Snapshot älter als 10 Minuten ist (`SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000`).
  3. Vor jeder Wiederherstellung vom aktuellen Editortext (nicht vom Plattenstand), außer identisch mit dem neuesten Snapshot.
  4. Manuell über den Menüeintrag „Aktuelle Version sichern" vom aktuellen Editortext, außer identisch mit dem neuesten Snapshot.
- **Begrenzung:** Höchstens 20 Snapshots je Dokument (`MAX_SNAPSHOTS = 20`); nach jedem neuen Snapshot werden die ältesten darüber hinaus gelöscht.
- **Wiederherstellen:** Ersetzt den Editortext durch den Snapshot-Text (ein CodeMirror-Transaktion, also per `Strg+Z` rückgängig); Autosave schreibt den Stand danach wie üblich auf die Platte. Keine Rückfrage, weil der vorherige Text als Snapshot gesichert ist (Regel 3).
- **Fehler** beim Anlegen, Lesen oder Löschen von Snapshots werden in der Konsole protokolliert und blockieren nie das Speichern des Dokuments.
- **Nicht gelöscht** werden Historien, wenn ein Dokumentverweis entfernt oder eine Karte gelöscht wird (Nicht-Ziel: Aufräumen verwaister Historien).

## 3. UI (`pages/document.vue`)

In der Kopfzeile zwischen Lint-Zähler und Vorschau-Umschalter ein Button „Verlauf" (`ClockIcon` aus `@heroicons/vue/24/outline`, gleiche Button-Klassen wie der Zurück-Button, Text ab `lg:` sichtbar) als Trigger der bestehenden `Dropdown`-Komponente (`align="end"`, Einträge als `DropdownMenuItem` mit den Klassen wie in `components/kanban/Column.vue`). Inhalt des Dropdowns, von oben:

1. Eintrag „Aktuelle Version sichern" (Regel 4), danach ein Trenner (`DropdownMenuSeparator` aus radix-vue, falls im Projekt schon genutzt; sonst eine `div` mit `border-elevation-3 border-t my-1`).
2. Hinweistext klein und gedimmt (`text-dim-3 text-xs px-4 py-1 max-w-72`): „Wiederherstellen ersetzt den Editortext. Der aktuelle Text wird vorher als Version gesichert."
3. Die Snapshots, neueste zuerst, je Eintrag Datum und Uhrzeit lokalisiert (`Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })`, `locale` aus `useI18n()`) und rechts gedimmt die Größe in KB (eine Nachkommastelle). Klick = Wiederherstellen.
4. Bei leerer Historie statt 3: gedimmter Eintrag „Noch keine gesicherten Versionen".

Die Liste wird beim Öffnen des Dropdowns geladen (`readDir`), nicht beim Seitenaufruf. Nach einem manuellen Snapshot oder einer Wiederherstellung schließt das Dropdown.

## 4. Code-Struktur

- `utils/documentHistory.ts` (rein, synchron, testbar): `documentHistoryKey(path): string`, `snapshotFileName(date: Date): string`, `parseSnapshotFileName(name: string): Date | null`, Konstanten `MAX_SNAPSHOTS`, `SNAPSHOT_INTERVAL_MS`, `DOCUMENT_HISTORY_DIR = "document-history"`.
- `composables/useDocumentHistory.ts`: `useDocumentHistory(documentPath: Ref<string>)` mit `listSnapshots(): Promise<Array<{ name: string; date: Date; size: number }>>`, `readSnapshot(name): Promise<string>`, `createSnapshot(content: string): Promise<boolean>` (legt an, prunt, gibt `false` zurück wenn identisch mit dem neuesten oder bei Fehler), `newestSnapshotDate(): Promise<Date | null>`. Alle fs-Aufrufe mit `{ baseDir: BaseDirectory.AppData }` und relativen Pfaden (`mkdir` mit `recursive: true`, `readDir`, `readTextFile`, `writeTextFile`, `remove`, `stat` für die Größe oder Größe aus dem gelesenen Text ableiten; `stat` nur wenn ohne Mehraufwand).
- `pages/document.vue`: Session-Flag `firstWriteDone`; in `flushSave` vor dem `writeTextFile` die Snapshot-Regeln 1 und 2 anwenden (await, aber Fehler abfangen); `restoreSnapshot(name)`, `saveSnapshotNow()`; Dropdown-Markup.
- `src-tauri/capabilities/main.json`: ergänzen `fs:allow-appdata-read-recursive`, `fs:allow-appdata-write-recursive`, `fs:allow-appdata-meta-recursive`, `fs:allow-mkdir`, `fs:allow-read-dir`, `fs:allow-remove`, bei Bedarf `fs:allow-stat`. Keine Scope-Einträge mit absoluten Pfaden nötig.

## 5. i18n-Keys (en + de), unter `pages.document`

- `history`: "History" / "Verlauf"
- `historySaveNow`: "Save current version" / "Aktuelle Version sichern"
- `historyHint`: "Restoring replaces the editor text. The current text is saved as a version first." / "Wiederherstellen ersetzt den Editortext. Der aktuelle Text wird vorher als Version gesichert."
- `historyEmpty`: "No saved versions yet" / "Noch keine gesicherten Versionen"

## 6. Nicht-Ziele

- Diff-Ansicht oder Vorschau eines Snapshots vor dem Wiederherstellen.
- Einstellungen für Anzahl und Intervall (Konstanten im Code).
- Aufräumen verwaister Historien; Export der Historie.
- Snapshots für die Kartenbeschreibung (tiptap) oder andere Daten.

## 7. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen auf `main` (2a4f820); keine neuen. `corepack pnpm generate` und `cargo build` (PowerShell) erfolgreich. Pure Helfer in `utils/documentHistory.ts` mit einem Node-Smoke-Test prüfen (Key stabil für `C:\A\b.md` und `c:/a/B.md`? Nein: Groß-/Kleinschreibung wird vom Laufwerksbuchstaben normalisiert, vom Rest nicht; dokumentieren, was `normalizeDocumentPath` tut) und Round-Trip `snapshotFileName`/`parseSnapshotFileName`.

Manueller UI-Test (`corepack pnpm tauri dev`):

1. Dokument öffnen, tippen, warten bis „Gespeichert": im App-Datenordner (`%APPDATA%\<app-identifier>\document-history\<key>\`) liegt genau ein Snapshot mit dem Stand vor dem Tippen.
2. Weiter tippen innerhalb von 10 Minuten: kein weiterer Snapshot. „Verlauf" zeigt einen Eintrag mit Datum/Uhrzeit und Größe.
3. „Aktuelle Version sichern": zweiter Eintrag erscheint; erneut klicken ohne Änderung: kein dritter.
4. Eintrag anklicken: Editortext wird ersetzt, davor wurde der aktuelle Text gesichert (Eintrag erscheint), `Strg+Z` macht die Wiederherstellung rückgängig, Autosave schreibt den Stand.
5. Seite verlassen, wieder öffnen, tippen: neuer Snapshot des Plattenstands (Regel 1), außer identisch mit dem neuesten.
6. 21 Snapshots erzeugen (manuell, jeweils mit kleiner Änderung): nur die neuesten 20 bleiben.
7. Fehlerfall: Ordner `document-history` schreibgeschützt machen, tippen: Dokument wird trotzdem gespeichert, Konsole zeigt die Warnung.
