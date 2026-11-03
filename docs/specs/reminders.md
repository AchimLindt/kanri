<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Reminder und Tagesansicht

Status: implementiert (Branch `feat/reminders`, abgezweigt von `feat/card-archive`, 2026-11-03), manueller UI-Test gemäß §10 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`, verwandte Specs: `docs/specs/card-archive.md` (Erledigt-Spalte, `completedAt`, täglicher Archiv-Lauf), `docs/specs/full-text-search.md` (Karte öffnen per `/kanban/<id>?card=<cardId>`), `docs/specs/document-history.md` (Muster für Läufe nach `boards.init()`). Die Entscheidungen stammen aus einer Grill-Session mit dem Nutzer am 2026-11-03; sie sind nicht neu zu verhandeln.

## 1. Ziel

Fällige Karten sollen nicht übersehen werden. Kanri erinnert per System-Benachrichtigung vor der Fälligkeit (Vorlauf einstellbar), am Fälligkeitstag und täglich, solange eine Karte überfällig ist. Ein Badge in der Sidebar zeigt die Anzahl überfälliger und heute fälliger Karten. Eine Tagesansicht listet alle offenen Karten mit Fälligkeit über alle Boards, gruppiert nach Dringlichkeit, und erlaubt Erledigen und Verschieben direkt aus der Liste.

## 2. Verhalten

### 2.1 Fälligkeit und „erledigt"

- **Tagesgenau, lokale Zeit:** Maßgeblich ist der Kalendertag von `Card.dueDate` in der lokalen Zeitzone (der Dialog speichert Datum und Uhrzeit; die Uhrzeit spielt für Reminder und Tagesansicht keine Rolle). `dueDate` ist im Speicher ein `Date`, nach dem Laden aus dem Tauri-Store ein ISO-String; die Helfer akzeptieren beides. Tagesdifferenzen werden über die lokalen Tagesanfänge gerechnet und gerundet, Sommerzeitwechsel verschieben also nichts.
- **Erledigt** ist eine Karte, wenn `isDueDateCompleted === true` oder `completedAt` gesetzt ist (Karte liegt in der Erledigt-Spalte, siehe `docs/specs/card-archive.md`). Erledigte Karten bekommen keine Erinnerung und erscheinen nicht in der Tagesansicht.
- **Nicht berücksichtigt** werden außerdem archivierte Karten (`board.archivedCards`, liegen außerhalb von `columns`), Trennkarten (`---`), Karten ohne `id` (Altdaten; `Column.vue` vergibt IDs beim Rendern) und Karten mit ungültigem Datum.

### 2.2 Stufen

Je Karte gibt es zum Zeitpunkt `now` höchstens eine aktuelle Stufe (`dueStage`):

| Stufe | Bedingung (Tage bis Fälligkeit `d`) |
| --- | --- |
| `overdue` | `d < 0` |
| `due` | `d = 0` (heute fällig) |
| `lead` | `1 ≤ d ≤ Vorlauf` (Vorlauf `none` = nie) |

- **Vorlauf:** globale Einstellung `reminderLeadTime` (`"none" | "1d" | "3d" | "7d"`, Default `"1d"`), je Karte überschreibbar über `Card.reminderLeadTime` (fehlt = global).
- **Einmaligkeit:** `lead` und `due` werden je Karte genau einmal benachrichtigt, `overdue` einmal je lokalem Kalendertag (beim ersten Check des Tages). Buchführung in `Card.remindersSent = { lead?, due?, overdue? }` mit dem ISO-Zeitstempel des Sendens; für `overdue` wird der lokale Tag dieses Zeitstempels mit heute verglichen. Ein ungültiger Zeitstempel gilt als „nicht gesendet".
- Es wird nur die aktuelle Stufe gesendet, verpasste frühere Stufen nicht nachgeholt (eine Karte, die erst heute ein Datum für gestern bekommt, meldet nur `overdue`).
- **Zurücksetzen:** Jede Änderung des Fälligkeitsdatums (Setzen, Ändern, Entfernen; auch nur der Uhrzeit) über die Store-Action `setCardDueDate` löscht `remindersSent`. Umschalten von „erledigt" oder des Countdown-Modus bei gleichem Datum ändert nichts. Eine Änderung des Vorlaufs setzt nichts zurück.

### 2.3 Prüfung

- `layouts/default.vue` ruft nach `boards.init()` (und nach den bestehenden Läufen für Dokument-Historie und Archiv) sofort `runReminderCheck()` auf und danach per `setInterval` alle 60 s (`REMINDER_CHECK_INTERVAL_MS`). Der Timer läuft auch, wenn das Fenster verborgen oder minimiert ist (späterer Tray-Betrieb); WebView2 kann Timer im Hintergrund drosseln, die Prüfung kommt dann verspätet, aber sicher.
- **Täglicher Archiv-Lauf:** Dieselbe Minuten-Schleife ruft auch `runScheduledCardArchive()` auf. Dessen vorhandene Intervall-Logik (`CARD_ARCHIVE_INTERVAL_MS`, `cardArchiveLastRun`) lässt ihn höchstens einmal je 24 h laufen; bei durchlaufender App wird also auch ohne Neustart archiviert. Keine eigene Intervall-Logik im Reminder-Code.
- `runReminderCheck()` (aus `useReminders()`, das im Setup des Layouts aufgerufen wird, weil es `useI18n` braucht):
  1. setzt die reaktive Uhr (`useReminderClock`) auf `now` (Badge und Tagesansicht springen so um Mitternacht weiter),
  2. bricht ab, solange Boards oder Einstellungen nicht geladen sind,
  3. prüft beim ersten Check der Sitzung die Benachrichtigungs-Berechtigung (`isPermissionGranted`, sonst einmalig `requestPermission`; danach je Check nur `isPermissionGranted`, damit eine später erteilte Berechtigung greift),
  4. ermittelt die fälligen Erinnerungen (`remindersDue`), sendet je Karte eine Benachrichtigung und schreibt danach `remindersSent[stage]` per `markReminderSent`.
- **Ohne Berechtigung** wird nichts gesendet und nichts in `remindersSent` vermerkt (sonst gingen die Erinnerungen verloren, wenn die Berechtigung später erteilt wird); es bleibt das Badge. Das wird einmal je Sitzung protokolliert.
- **Fehler** (Plugin, Berechtigung, einzelne Benachrichtigung) werden mit `console.warn` protokolliert, nie geworfen; scheitert eine einzelne Benachrichtigung, bleibt die Stufe offen und wird beim nächsten Check erneut versucht. Ein laufender Check blockiert einen überlappenden zweiten (Modul-Flag).

### 2.4 Benachrichtigung

- Titel = Kartentitel. Text = „{Stufe} · {Board} › {Spalte}", Stufe lokalisiert: `lead` „Morgen fällig" / „Fällig in {n} Tagen", `due` „Heute fällig", `overdue` „Seit gestern überfällig" / „Seit {n} Tagen überfällig".
- Unter Windows gibt es keinen Klick-Callback (Klick bringt höchstens die App nach vorn); das ist akzeptiert. Die Karte öffnet man über die Tagesansicht.
- Beim ersten Start nach dem Update meldet jede bereits überfällige offene Karte einmal (und danach täglich); das ist gewollt.

### 2.5 Badge

Am Sidebar-Eintrag der Tagesansicht: kleiner roter Kreis mit der Anzahl offener Karten, die überfällig oder heute fällig sind (unabhängig von Vorlauf und `remindersSent`), ab 100 „99+", bei 0 ausgeblendet. Reaktiv über ein `computed` aus dem Boards-Store und der Reminder-Uhr (`useReminderBadgeCount`). Tooltip „Heute" bzw. „Heute: n Karten überfällig oder heute fällig".

### 2.6 Tagesansicht

- Route `/today`, Sidebar-Eintrag unter der Suche (Heroicons `CalendarDaysIcon`, outline).
- Abschnitte in dieser Reihenfolge: **Überfällig** (`d < 0`), **Heute** (`d = 0`), **Nächste 7 Tage** (`1 ≤ d ≤ 7`), **Später** (`d > 7`). Leere Abschnitte werden nicht angezeigt; gibt es keine offene Karte mit Fälligkeit, steht dort „Nichts fällig.".
- Jeder Abschnitt ist per Klick auf die Überschrift (Chevron, Titel, Anzahl) zusammenklappbar; der Zustand wird je Abschnitt in den Settings gespeichert (`todaySectionsCollapsed`, Keys `overdue`, `today`, `next7`, `later`).
- Sortierung innerhalb der Abschnitte: nach Fälligkeitszeitpunkt (inkl. Uhrzeit), dann Titel.
- **Zeile:**
  - Checkbox „Fälligkeit erledigt" → `setCardDueDateCompleted(…, true)`; die Zeile verschwindet damit.
  - Kartentitel als Link nach `/kanban/<boardId>?card=<cardId>` (öffnet den Karten-Dialog, Mechanismus aus der Volltextsuche).
  - „Board › Spalte".
  - Fälligkeit relativ („heute", „morgen", „in 3 Tagen", „gestern", „vor 2 Tagen", Pluralisierung über i18n) und absolut (`Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })`, `locale` aus `useI18n`), bei überfälligen Karten rot.
  - Tags wie auf der Kachel (`KanbanTagDisplay`).
  - Menü (`Dropdown`, ⋯): „+1 Tag", „+1 Woche", „Datum wählen…".
- **Verschieben:** „+1 Tag" / „+1 Woche" addieren Kalendertage und behalten die Uhrzeit. Bei überfälligen Karten wird ab heute gerechnet (Entscheidung bei der Umsetzung: „+1 Tag" auf einer seit einer Woche überfälligen Karte soll „morgen" bedeuten, nicht „weiterhin überfällig"). „Datum wählen…" blendet unter der Zeile ein natives `<input type="date">` (vorbelegt mit dem bisherigen Tag) mit „Übernehmen" und „Abbrechen" ein; `Enter` übernimmt, `Escape` bricht ab. Übernommen wird nur explizit, weil das Feld beim Eintippen schon für Zwischenwerte (z. B. Jahr 0002) `change` feuert. Die Uhrzeit bleibt erhalten. Alle Änderungen laufen über `setCardDueDate` und setzen damit `remindersSent` zurück.
- Die Ansicht rechnet mit der Reminder-Uhr (beim Öffnen der Seite auf „jetzt" gesetzt, danach jede Minute vom Check).

### 2.7 Startseite

Einstellung `startPage` (`"boards" | "today"`, Default `"boards"`). `pages/index.vue` leitet beim ersten Besuch der Startseite in der Sitzung per `router.replace("/today")` um, sobald die Einstellungen geladen sind (`settings.loaded`). Ein Modul-Flag (`consumeFirstStartPageVisit` in `composables/useReminders.ts`) sorgt dafür, dass spätere Navigation zur Board-Übersicht (Logo, „Startseite") nicht erneut umleitet. `boards.initialized` taugt nicht als Signal, weil `index.vue` `boards.init()` selbst aufruft, bevor das Layout die Einstellungen geladen hat.

### 2.8 Herkunft (`Card.source`)

`Card.source = { path, row }` wird vom Summarize-Meeting-Skill des Nutzers außerhalb der App gesetzt (Abgleich von Action Points mit Kanri, schreibt direkt in `.kanri.dat`). Kanri zeigt das Feld nicht an, erhält es aber: Typ und zod-Schema kennen es (Export/Import), „Karte duplizieren" kopiert es nicht (eine Herkunft je Karte, sonst würde der Abgleich zwei Karten für denselben Action Point finden).

## 3. UI

### 3.1 Karten-Dialog (`components/modal/EditCard.vue`)

Neben dem Fälligkeits-Button, nur sichtbar, wenn ein Datum gesetzt ist: `PhBell` plus natives `<select>` (`bg-elevation-2 bg-elevation-3-hover rounded-md px-2 py-1`) mit „Erinnerung: Standard / keine / 1 Tag vorher / 3 Tage vorher / 1 Woche vorher". „Standard" entfernt `Card.reminderLeadTime`. Neues Emit `setCardReminderLeadTime(columnId, cardId, leadTime | null)`, in `pages/kanban/[id].vue` an `board.setCardReminderLeadTime` gebunden.

### 3.2 Sidebar (`components/Sidebar.vue`)

Eintrag nach der Suche: `nuxt-link` nach `/today`, `CalendarDaysIcon size-7`, gleiche Klassen wie die übrigen Einträge plus `relative`; Badge `absolute -right-1 -top-1 h-5 min-w-5 rounded-full bg-red-600 px-1 text-xs font-semibold text-white`.

### 3.3 Tagesansicht (`pages/today.vue`)

Layout wie die Archiv-Seite (`main` mit `pb-8 pl-8 pr-12 pt-6`, Überschrift `text-4xl font-bold`, Untertitel `text-dim-3`). Abschnittsüberschrift als Button (`text-2xl font-bold`, Überfällig in `text-red-500`). Zeilen `bg-elevation-1 rounded-md px-4 py-2`, Checkbox wie auf der Suchseite (radix `CheckboxRoot`), Menüeinträge mit den Klassen aus `Column.vue`.

### 3.4 Settings (`pages/settings.vue`)

Zwei neue Zeilen im Abschnitt „Preferences" nach der Archivierungsfrist, jeweils mit nativem `<select>` (`bg-elevation-2 border-elevation-3 rounded-md border px-2 py-1`): „Erinnerung vor der Fälligkeit" (keine / 1 Tag / 3 Tage / 1 Woche vorher) und „Startseite" (Board-Übersicht / Tagesansicht).

## 4. Datenmodell

`types/kanban-types.d.ts`:

```ts
export declare type ReminderLeadTime = "none" | "1d" | "3d" | "7d";
export declare type ReminderStage = "lead" | "due" | "overdue";
export declare interface RemindersSent { lead?: string; due?: string; overdue?: string } // ISO
export declare interface CardSource { path: string; row: number }
// Card:
reminderLeadTime?: ReminderLeadTime; // fehlt = globale Einstellung
remindersSent?: RemindersSent;
source?: CardSource;
```

`types/json-schemas.ts`, Karten-Schema: `reminderLeadTime: z.enum(["none", "1d", "3d", "7d"]).optional()`, `remindersSent: z.object({ lead, due, overdue: z.string().optional() }).optional()`, `source: z.object({ path: z.string(), row: z.number() }).optional()`.

Settings (`stores/settings.ts`, Tauri-Store-Keys gleichnamig): `reminderLeadTime` (Default `"1d"`, `normalizeReminderLeadTime`), `startPage` (Default `"boards"`, `normalizeStartPage`), `todaySectionsCollapsed: Record<string, boolean>` (Default `{}`, `normalizeTodaySectionsCollapsed` behält nur boolesche Werte bekannter Abschnitte); Setter `setReminderLeadTime`, `setStartPage`, `setTodaySectionCollapsed(section, collapsed)`. Nicht persistiert: `loaded` (wird am Ende von `loadSettings` `true`).

## 5. Store-Actions (`stores/boards.ts` + Fassade `composables/useBoard.ts`)

| Aktion | Verhalten |
| --- | --- |
| `setCardDueDate(boardId, columnId, cardId, dueDate, isCounterRelative?, isCompleted?)` | setzt `dueDate`; weggelassene Flags bleiben; löscht `remindersSent`, wenn sich der Zeitpunkt geändert hat (Vergleich der Millisekunden, `null` = kein Datum); `lastEdited`. `useBoard.setCardDueDate` (Karten-Dialog) delegiert hierher statt an `mutateCard` |
| `setCardDueDateCompleted(boardId, columnId, cardId, completed)` | setzt `isDueDateCompleted`; `lastEdited` |
| `setCardReminderLeadTime(boardId, columnId, cardId, leadTime \| null)` | setzt bzw. entfernt (`null`) `reminderLeadTime`; `lastEdited`; in `useBoard` gespiegelt |
| `markReminderSent(boardId, columnId, cardId, stage, isoDate)` | legt `remindersSent` bei Bedarf an und setzt die Stufe (in place); kein `lastEdited`, weil keine Nutzeränderung (sonst sortierte jeder Reminder das Board in „zuletzt bearbeitet" nach oben) |
| `duplicateCard` (bestehend) | entfernt an der Kopie `source` und `remindersSent` (neue Karte, eigene Erinnerungen); `reminderLeadTime` wird kopiert |

Auto-Save persistiert alle Änderungen wie gewohnt.

## 6. Module

- `utils/reminders.ts` (rein, ohne Store/DOM/Tauri, Node-Smoke-Test): Konstanten `REMINDER_LEAD_TIMES`, `DEFAULT_REMINDER_LEAD_TIME`, `REMINDER_CHECK_INTERVAL_MS`, `START_PAGES`, `DEFAULT_START_PAGE`, `TODAY_SECTIONS`; Normalisierer; `startOfLocalDay`, `addDays`, `parseDueDate`, `dayDifference`, `leadTimeDays`, `effectiveLeadTime`, `isCardCompleted`, `isReminderCandidate`, `dueInDays`, `dueStage(card, now, defaultLeadTime)`, `isReminderPending(card, stage, now)`, `remindersDue(boards, now, settings)`, `todaySectionFor`, `collectDueCards(boards, now)`, `groupDueCards`, `countAttentionCards`, `postponeDueDate(dueDate, now, days)`, `toDateInputValue`, `withDateInputValue`.
- `composables/useReminders.ts`: `useReminders()` → `{ runReminderCheck(now?) }` (im Setup aufrufen), `useReminderClock()`, `useReminderBadgeCount()`, `consumeFirstStartPageVisit()`.
- `layouts/default.vue`: Sofort-Check, Intervall mit Reminder-Check und Archiv-Lauf, `clearInterval` in `onBeforeUnmount`.

## 7. Capabilities und Plugins

- Rust: `tauri-plugin-notification = "=2.4.0"` in `src-tauri/Cargo.toml`, Registrierung `.plugin(tauri_plugin_notification::init())` in `src-tauri/src/lib.rs`.
- npm: `@tauri-apps/plugin-notification` `2.4.0` (exakt, MIT OR Apache-2.0).
- Versionswahl: 2.4.0 ist die neueste Version, die zu Tauri 2.11 (`tauri ^2.10`) und `@tauri-apps/api` 2.11 (`^2.11.0`) passt; ab 2.5.0 verlangt das Plugin `tauri ^2.12` und `@tauri-apps/api ^2.12.0`, was ein Tauri-Update nach sich zöge. Veröffentlicht 2026-08-31, also deutlich älter als die zwei Wochen Mindestalter des Firmen-Mirrors.
- Capability `notification:default` in `src-tauri/capabilities/main.json` (Berechtigung prüfen/anfragen, senden).

## 8. i18n-Keys (en + de)

- `components.sidebar.today`: "Today" / "Heute"
- `components.sidebar.todayWithCount` (Plural): "Today: {count} card overdue or due today | Today: {count} cards …" / "Heute: {count} Karte überfällig oder heute fällig | Heute: {count} Karten …"
- `modals.editCard.reminderLabel`: "Reminder" / "Erinnerung"
- `modals.editCard.reminderDefault` / `reminderNone` / `reminder1d` / `reminder3d` / `reminder7d`: "Reminder: default / none / 1 day before / 3 days before / 1 week before" / "Erinnerung: Standard / keine / 1 Tag vorher / 3 Tage vorher / 1 Woche vorher"
- `pages.settings.preferencesReminderLeadTimeHeading`: "Reminder before the due date" / "Erinnerung vor der Fälligkeit"
- `pages.settings.preferencesReminderLeadTimeSubtext`: "Default for all cards, can be changed per card next to the due date. You are also reminded on the due date and once a day while a card is overdue." / "Standard für alle Karten, je Karte neben der Fälligkeit änderbar. Zusätzlich wird am Fälligkeitstag und einmal täglich bei überfälligen Karten erinnert."
- `pages.settings.preferencesReminderLeadTimeNone` / `…1d` / `…3d` / `…7d`: "No early reminder / 1 day before / 3 days before / 1 week before" / "Keine Vorab-Erinnerung / 1 Tag vorher / 3 Tage vorher / 1 Woche vorher"
- `pages.settings.preferencesStartPageHeading`: "Start page" / "Startseite"
- `pages.settings.preferencesStartPageSubtext`: "Page shown when the app starts." / "Seite, die beim Start der App angezeigt wird."
- `pages.settings.preferencesStartPageBoards` / `…Today`: "Board overview / Today view" / "Board-Übersicht / Tagesansicht"
- `pages.today.title`: "Today" / "Heute"; `subtitle`: "Open cards with a due date across all boards." / "Offene Karten mit Fälligkeit aus allen Boards."; `emptyState`: "Nothing due." / "Nichts fällig."
- `pages.today.sectionOverdue` / `sectionToday` / `sectionNext7` / `sectionLater`: "Overdue / Today / Next 7 days / Later" / "Überfällig / Heute / Nächste 7 Tage / Später"
- `pages.today.location`: "{boardName} › {columnName}"
- `pages.today.relativeToday`: "today" / "heute"; `relativeFuture` (Plural): "tomorrow | in {count} days" / "morgen | in {count} Tagen"; `relativePast` (Plural): "yesterday | {count} days ago" / "gestern | vor {count} Tagen"
- `pages.today.markCompleted`: "Mark due date as completed" / "Fälligkeit erledigt"
- `pages.today.moreActions`: "Reschedule" / "Fälligkeit verschieben"
- `pages.today.postponeDay` / `postponeWeek` / `pickDate` / `applyDate`: "+1 day / +1 week / Pick date… / Apply" / "+1 Tag / +1 Woche / Datum wählen… / Übernehmen"
- `reminders.body`: "{stage} · {boardName} › {columnName}"
- `reminders.stageLead` (Plural): "Due tomorrow | Due in {count} days" / "Morgen fällig | Fällig in {count} Tagen"
- `reminders.stageDue`: "Due today" / "Heute fällig"
- `reminders.stageOverdue` (Plural): "Overdue since yesterday | Overdue for {count} days" / "Seit gestern überfällig | Seit {count} Tagen überfällig"

## 9. Nicht-Ziele

- Klick auf eine Benachrichtigung öffnet die Karte (unter Windows ohne Callback nicht möglich); Aktionen in der Benachrichtigung (Erledigt, Schlummern).
- Uhrzeitgenaue Erinnerungen, mehrere Vorläufe je Karte, frei wählbarer Vorlauf in Tagen.
- Abschnitt „Erledigt heute" in der Tagesansicht; Filter nach Board oder Tag; Mehrfachauswahl.
- Zusammenfassen vieler Benachrichtigungen zu einer (jede Karte meldet einzeln).
- Erinnerungen für archivierte Karten; Anzeige von `Card.source` in der App.
- Tray-Icon und Hintergrundbetrieb bei geschlossenem Fenster (eigener Branch `feat/tray-quick-capture`).

## 10. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen, Befunde identisch mit `feat/card-archive`. `corepack pnpm generate` erfolgreich, Route `/today` im Router, neue Klassen (`min-w-5`, `-right-1`, `-top-1`, `bg-red-600`, `text-white`, `w-fit`, `sr-only`, `hover:underline`) im generierten CSS. `cargo build` (PowerShell) erfolgreich. `tsc` gegen die `.ts`-Dateien: keine neuen Fehler. Node-Smoke-Tests (Zeitzone Europe/Berlin): `utils/reminders.ts` (Stufen an den Tagesgrenzen, Vorlauf global/je Karte, erledigt, Einmaligkeit inkl. `overdue` je Tag, Auswahl über Boards mit Trennkarte, Karte ohne id, Erledigt-Spalte und Archiv, Sortierung und Abschnitte, Badge-Zahl, Verschieben, Datumsfeld, Sommerzeitwechsel, Normalisierer) und die Store-Actions unter Pinia (`setCardDueDate` mit gleichem/anderem/ohne Datum, `markReminderSent` ohne `lastEdited`, `setCardReminderLeadTime`, `duplicateCard` ohne `source`/`remindersSent`).

Manueller UI-Test (`corepack pnpm tauri dev`, PowerShell):

1. Erster Start: Windows fragt ggf. nach der Berechtigung bzw. Benachrichtigungen sind erlaubt. Karte mit Fälligkeit heute anlegen: innerhalb einer Minute Benachrichtigung „Kartentitel" / „Heute fällig · Board › Spalte"; keine zweite in den folgenden Minuten. Export: `remindersSent.due` gesetzt.
2. Karte mit Fälligkeit morgen: Benachrichtigung „Morgen fällig · …" (Vorlauf 1 Tag). Im Dialog „Erinnerung: keine" bei einer zweiten Karte mit Fälligkeit morgen: keine Benachrichtigung. „Erinnerung: 1 Woche vorher" bei einer Karte in 5 Tagen: Benachrichtigung „Fällig in 5 Tagen". Der Select erscheint nur mit gesetztem Datum.
3. Karte mit Fälligkeit gestern: „Seit gestern überfällig"; App neu starten: keine weitere am selben Tag. In der Store-Datei (App beendet) `remindersSent.overdue` auf gestern setzen, starten: erneute Benachrichtigung.
4. Fälligkeitsdatum einer benachrichtigten Karte ändern (Dialog oder Tagesansicht): `remindersSent` ist weg, die neue Stufe meldet sich. „Erledigt" umschalten bei gleichem Datum: nichts wird zurückgesetzt.
5. Karte als erledigt markieren oder in die Erledigt-Spalte ziehen: keine Benachrichtigung, verschwindet aus Tagesansicht und Badge.
6. Badge: zeigt überfällige + heute fällige offene Karten, aktualisiert sich sofort beim Erledigen, bei 0 unsichtbar; Tooltip mit Anzahl.
7. Tagesansicht: Abschnitte Überfällig/Heute/Nächste 7 Tage/Später mit richtigen Karten, leere Abschnitte fehlen; ohne fällige Karten „Nichts fällig.". Abschnitt einklappen, App neu starten: bleibt eingeklappt.
8. Zeile: Titel-Klick öffnet Board und Karten-Dialog; relative und absolute Fälligkeit stimmen (Deutsch und Englisch); Tags wie auf der Kachel; Checkbox entfernt die Zeile und setzt in der Karte „erledigt".
9. Menü: „+1 Tag" auf einer überfälligen Karte → morgen, auf einer zukünftigen → einen Tag später, Uhrzeit unverändert; „+1 Woche" analog. „Datum wählen…": Feld erscheint vorbelegt, Kalender-Popup oder Tippen, „Übernehmen"/`Enter` setzt das Datum, `Escape`/„Abbrechen" verwirft. Danach meldet sich die neue Stufe erneut.
10. Settings: Vorlauf auf „3 Tage vorher" und Startseite auf „Tagesansicht", App neu starten: Werte erhalten, App startet in der Tagesansicht; Klick auf „Startseite" in der Sidebar zeigt die Board-Übersicht ohne erneute Umleitung.
11. Benachrichtigungen in Windows für Kanri abschalten, Karte heute fällig: keine Benachrichtigung, Badge zählt, Konsole meldet einmal „notification permission not granted"; wieder einschalten: Benachrichtigung beim nächsten Check.
12. Archiv-Lauf ohne Neustart: `cardArchiveLastRun` in der Store-Datei auf einen Wert vor mehr als 24 h setzen (App beendet), App starten und laufen lassen; nach dem Start-Lauf erneut prüfen, dass innerhalb von 24 h kein zweiter Lauf stattfindet (Konsole), und dass nach Ablauf der 24 h der nächste Minuten-Tick archiviert.
13. Board exportieren und importieren: `reminderLeadTime`, `remindersSent` und ein von Hand eingetragenes `source` bleiben erhalten. Karte duplizieren: Kopie ohne `source` und `remindersSent`.
14. Sprache Deutsch: alle neuen Texte übersetzt.
