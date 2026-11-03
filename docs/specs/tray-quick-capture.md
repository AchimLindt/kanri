<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Tray-Anwendung und Schnellerfassung

Status: implementiert (Branch `feat/tray-quick-capture`, abgezweigt von `feat/reminders`, 2026-11-03), manueller UI-Test gemäß §10 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`, verwandte Specs: `docs/specs/reminders.md` (Minuten-Schleife im Layout, Muster für das Einbinden eines Tauri-Plugins), `docs/specs/document-history.md` (Speichern im Markdown-Editor beim Schließen). Die Entscheidungen stammen aus einer Grill-Session mit dem Nutzer am 2026-11-03; sie sind nicht neu zu verhandeln.

## 1. Ziel

Kanri läuft im Hintergrund weiter, damit Erinnerungen auch bei geschlossenem Fenster kommen, und Aufgaben lassen sich von überall erfassen, ohne das Hauptfenster zu öffnen. Dafür gibt es ein Tray-Icon, „Schließen in den Tray", optional einen verborgenen Start beim Autostart und ein kleines Schnellerfassungs-Fenster, das ein globales Tastenkürzel öffnet.

## 2. Verhalten

### 2.1 Tray-Icon

- Icon = App-Icon (`app.default_window_icon()`), Tooltip „Kanri". Angelegt in `src-tauri/src/lib.rs` (`create_tray`, nur Desktop).
- **Linksklick** (Maustaste losgelassen): Hauptfenster `unminimize` + `show` + `set_focus`. Das Menü öffnet sich nicht bei Linksklick (`show_menu_on_left_click(false)`).
- **Rechtsklick-Menü:** „Open", „Quick capture", Trennlinie, „Quit".
  - „Open" wie Linksklick.
  - „Quick capture" sendet das Event `quick-capture:open` an das Hauptfenster, das dann dasselbe JS ausführt wie das Tastenkürzel (ein Code-Pfad, §2.5).
  - „Quit" beendet die App wirklich: Rust sendet `app:quit-requested` an das Hauptfenster, das die „vor dem Schließen"-Arbeiten ausführt (z. B. ungespeicherte Änderungen im Markdown-Editor schreiben) und sich dann zerstört; das Zerstören des Hauptfensters beendet die App (§2.2). Antwortet das Frontend nicht, beendet Rust die App nach 2 s trotzdem (`app.exit(0)`).
- **Bewusste Einschränkung:** Die Menütexte sind englisch. Rust kennt die UI-Sprache nicht (sie liegt im Tauri-Store des Frontends); ein Umbenennen der Menüeinträge aus dem Frontend wäre möglich, lohnt den Aufwand aber nicht.

### 2.2 Schließen in den Tray

- Einstellung `minimizeToTray` (Default `true`).
- Das Hauptfenster hat **genau einen** Close-Handler, registriert in `layouts/default.vue` über `setupMainWindowLifecycle` (`composables/useWindowLifecycle.ts`):
  1. Ist die Einstellung aktiv, wird das Schließen sofort verhindert (`event.preventDefault()`).
  2. Alle registrierten „vor dem Schließen"-Handler laufen (`onBeforeWindowClose`, Fehler werden protokolliert).
  3. Bei aktiver Einstellung wird das Fenster versteckt (`hide()`), sonst zerstört es `@tauri-apps/api` wie bisher.
- **Warum ein zentraler Handler:** `getCurrentWindow().onCloseRequested` in `@tauri-apps/api` 2.11 zerstört das Fenster nach *jedem* Listener, dessen eigenes Event nicht verhindert wurde. Der bisherige Listener der Dokumentseite (`flushSave`) hätte das Fenster also zerstört, obwohl das Layout es verstecken will; ein `preventDefault` an einer Stelle reicht nicht. Die Dokumentseite registriert deshalb jetzt `onBeforeWindowClose(() => flushSave())` statt eines eigenen Close-Listeners (in `onBeforeUnmount` wieder abgemeldet). Künftige Seiten mit „vor dem Schließen speichern" folgen diesem Muster.
- **Zerstören des Hauptfensters beendet die App** (`on_window_event`, `WindowEvent::Destroyed` für das Label `main` → `app.exit(0)`, gegen doppelte Aufrufe abgesichert). Ohne das liefe der Prozess unsichtbar weiter, solange das (versteckte) Capture-Fenster existiert.
- Im Tray läuft das WebView des Hauptfensters weiter: Reminder-Prüfung und Archiv-Lauf (Minuten-Schleife), Tastenkürzel und Schnellerfassung bleiben aktiv.
- Ein zweiter App-Start (Single-Instance) holt das Fenster wie bisher nach vorn, auch aus dem Tray.

### 2.3 Minimiert starten

- Einstellung `startMinimized` (Default `false`), Zeile auf der Settings-Seite direkt unter „Autostart" (nur dort sinnvoll).
- Das Hauptfenster startet unsichtbar (`tauri.conf.json`: `"visible": false`), damit es beim minimierten Start nicht kurz aufblitzt. `layouts/default.vue` zeigt es nach `settings.loadSettings()` und `theme.loadThemeSettings()` per `showMainWindowOnStartup(settings.startMinimized)` (in einem `finally`, also auch bei Ladefehlern; einmal je Seitenleben).
- **Autostart-Erkennung:** Der Autostart-Eintrag übergibt das Argument `--autostart` (`tauri_plugin_autostart::init(…, Some(vec!["--autostart"]))`). Die Rust-Command `launched_by_autostart` prüft `std::env::args()`. Verborgen bleibt das Fenster nur, wenn `startMinimized` aktiv ist **und** die App per Autostart gestartet wurde; ein manueller Start zeigt das Fenster immer.
- **Altbestand:** Autostart-Einträge von vor diesem Feature haben das Argument nicht. Das Einschalten von `startMinimized` bei aktivem Autostart schreibt den Eintrag deshalb neu (`enable()` des Autostart-Plugins); ebenso jedes erneute Einschalten des Autostarts.
- App-Commands brauchen in Tauri 2 keine Capability, solange `build.rs` kein App-Manifest definiert.
- Das Window-State-Plugin stellt die Sichtbarkeit weiterhin nicht wieder her (`StateFlags::all() & !StateFlags::VISIBLE`); das Capture-Fenster ist vom Window-State-Plugin ausgenommen (`with_denylist(&["capture"])`), weil es bei jedem Öffnen neu positioniert wird.

### 2.4 Globales Tastenkürzel

- Plugin `tauri-plugin-global-shortcut` (§7). Einstellung `quickCaptureShortcut`, Default `CommandOrControl+Alt+K`.
- **Format** (Parser des Crates `global-hotkey` 0.8): Teile mit `+` verbunden, zuerst Modifier, als letztes genau eine Taste, Groß-/Kleinschreibung egal. Modifier: `CommandOrControl` (`CmdOrCtrl`, …), `Control`/`Ctrl`, `Alt`/`Option`, `Shift`, `Super`/`Command`/`Cmd`. Tasten: Buchstaben, Ziffern, `KeyX`, `DigitN`, `F1`–`F24`, Numpad, benannte Tasten (`Space`, `Enter`, `Tab`, Pfeile, …) und einzelne Satzzeichen.
- **Validierung** (`validateShortcut` in `utils/quickCapture.ts`): Format wie oben, mindestens ein Modifier **außer Shift** (strenger als „mindestens ein Modifier": `Shift+K` würde das Tippen eines großen K in allen Programmen abfangen), genau eine gültige Taste. Ergebnis wird normalisiert (`ctrl+alt+n` → `Control+Alt+N`, doppelte Modifier entfernt). Leeres Feld = kein Tastenkürzel (zusätzliche Entscheidung bei der Umsetzung: Ausweg, wenn das Kürzel kollidiert und man keins braucht). Ein ungültiger gespeicherter Wert fällt beim Laden auf den Default zurück.
- **Registrierung:** `useQuickCaptureHost().start()` im Layout (nach `boards.init()`) registriert das Kürzel; ein `watch` auf `settings.quickCaptureShortcut` registriert bei jeder Änderung neu (altes Kürzel abmelden, neues anmelden, Aufrufe serialisiert). Ist das Kürzel bereits für diese App registriert (WebView-Reload behält die Rust-seitige Registrierung), wird es vorher abgemeldet (`isRegistered`/`unregister`). Der Handler reagiert nur auf `Pressed`.
- **Fehler:** Schlägt die Registrierung fehl (Kürzel von einem anderen Programm belegt), setzt der Host `settings.quickCaptureShortcutError = true` (nicht persistiert); die Settings-Seite zeigt „Tastenkürzel konnte nicht registriert werden, vermutlich belegt es ein anderes Programm." Erfolgreiche Registrierung setzt es zurück.

### 2.5 Capture-Fenster

- Label `capture`, Route `/capture` (`pages/capture.vue` mit eigenem Layout `layouts/capture.vue` ohne Sidebar, Store-Laden und Reminder-Schleife). In Produktion liefert Tauri für `/capture` die vorgerenderte `capture/index.html` (sonst Fallback `index.html`), der Nuxt-Router zeigt die Seite.
- **Öffnen** (`openQuickCapture` in `composables/useQuickCapture.ts`, aufgerufen vom Tastenkürzel und vom Tray-Event; parallele Aufrufe werden zusammengefasst):
  1. `WebviewWindow.getByLabel("capture")`; beim ersten Mal per `new WebviewWindow("capture", …)` aus dem Hauptfenster anlegen und auf `tauri://created` warten. Eigenschaften: 480×200 (logisch), `decorations: false`, `alwaysOnTop: true`, `resizable: false`, nicht maximier-/minimierbar, `skipTaskbar: true`, `transparent: false`, `visible: false`, `backgroundColor` = `elevation1` des aktuellen Themes (kein weißes Aufblitzen).
  2. Position: Monitor unter dem Mauszeiger (`cursorPosition()` + `availableMonitors()`), dort mittig im Arbeitsbereich (`workArea`, ohne Taskleiste) in physischen Pixeln (`centeredPosition`); ohne passenden Monitor oder bei Fehlern `center()`.
  3. `show()`, `setFocus()`, dann Event `quick-capture:shown` an das Capture-Fenster.
- Danach wird das Fenster nur noch versteckt und wieder gezeigt (nicht geschlossen). Schließt es doch (z. B. Alt+F4), wird es beim nächsten Öffnen neu angelegt.
- **Bedienung:**
  - Textarea mit Platzhalter „Titel, weitere Zeilen werden zur Beschreibung". Bei jedem `shown` (und beim ersten Laden der Seite) wird der Inhalt geleert, der Fokus gesetzt und die Zielliste neu angefordert; bei `tauri://focus` wird erneut fokussiert.
  - `Enter` speichert, `Umschalt+Enter` fügt eine Zeile ein, `Esc` versteckt das Fenster (auch aus dem Select heraus).
  - Darunter ein natives Select „Board › Spalte" über alle Boards mit mindestens einer Spalte. Vorbelegt mit der gespeicherten Inbox; ohne Inbox oder bei ungültiger Inbox (Board oder Spalte gelöscht) ist es leer („Board › Spalte wählen…") und muss gewählt werden.
  - Statuszeile: Hinweis „Enter speichert · Umschalt+Enter neue Zeile · Esc schließt", Fehlermeldungen rot, nach Erfolg „Gespeichert" (Akzentfarbe) für 600 ms, danach wird das Fenster versteckt und geleert.
  - Verlust des Fokus (`tauri://blur`) schließt das Fenster **nicht** (der Nutzer schaut evtl. in ein anderes Programm); `Esc` reicht.
- **Titel/Beschreibung** (`splitCaptureText`): erste nicht-leere Zeile (getrimmt) = Titel, alles danach = Beschreibung; führende und abschließende Leerzeilen der Beschreibung entfallen, innere bleiben. Ohne Titel wird nicht gespeichert („Bitte einen Titel eingeben."). Die Beschreibung wird im Hauptfenster zu tiptap-HTML: je Zeile `<p>…</p>` mit escaptem Text, Leerzeilen als `<p></p>` (`descriptionToHtml`).
- **Inbox merken:** Weicht die gewählte Spalte von der (gültigen) gespeicherten Inbox ab oder gibt es keine, sendet das Capture-Fenster `rememberTarget: true`, und das Hauptfenster speichert die Wahl (`quickCaptureBoardId`/`quickCaptureColumnId`).
- **Optik:** `bg-elevation-1` mit dem Theme der App. Das Capture-Fenster liest den Store nicht; die Theme-Farben kommen mit `quick-capture:targets` und landen im Nuxt-State `quickCaptureColors`, aus dem `layouts/capture.vue` per `themeCssVars` (`utils/themeCssVars.ts`, gemeinsam mit `layouts/default.vue`) die CSS-Variablen setzt. Die Theme-Klassen aus `layouts/default.vue` werden in diesem Fenster nicht geladen; `layouts/capture.vue` definiert die wenigen benötigten Klassen selbst (unter `.capture-layout`). Ebenso kommt die Sprache aus dem Payload (`setLocale`).
- Antwortet das Hauptfenster nicht innerhalb von 5 s auf `quick-capture:add`, zeigt das Fenster „Kanri hat nicht geantwortet, bitte erneut versuchen." und gibt die Eingabe wieder frei.

### 2.6 Kommunikation (Tauri-Events)

Das Capture-Fenster ist eine zweite Nuxt-Instanz mit eigenem Pinia. Es greift **nie** auf den Store zu (`.kanri.dat` wird nur vom Hauptfenster geschrieben; die ESLint-Regel `custom/no-store-outside-stores` gilt ohnehin). Alle Events laufen über `emitTo(<label>, …)` und `getCurrentWebviewWindow().listen(…)`; die Namen stehen in `QUICK_CAPTURE_EVENTS` (`utils/quickCapture.ts`) bzw. als Konstanten in `lib.rs`.

| Event | Richtung | Payload |
| --- | --- | --- |
| `quick-capture:open` | Rust (Tray) → main | – |
| `app:quit-requested` | Rust (Tray) → main | – |
| `quick-capture:shown` | main → capture | – |
| `quick-capture:request-targets` | capture → main | – |
| `quick-capture:targets` | main → capture | `{ targets: [{ boardId, boardTitle, columns: [{ id, title }] }], inbox: { boardId, columnId } \| null, locale, colors }` |
| `quick-capture:add` | capture → main | `{ title, description, boardId, columnId, rememberTarget }` (Beschreibung als Klartext) |
| `quick-capture:added` | main → capture | `{ boardTitle, columnTitle }` |
| `quick-capture:error` | main → capture | `{ message }` (lokalisiert) |

- `inbox` ist der gespeicherte Rohwert; die Gültigkeit prüft das Capture-Fenster gegen `targets` (`resolveInbox`).
- Das Hauptfenster (`useQuickCaptureHost`, im Setup von `layouts/default.vue` aufgerufen, weil es `useI18n` braucht) registriert die Listener einmal in `start()` nach `boards.init()` und meldet sie in `stop()` (`onBeforeUnmount`) ab, ebenso das Tastenkürzel.
- **Anlegen der Karte** (`quick-capture:add`): Fehler „Kanri lädt noch…" solange `boards.initialized` falsch ist, „Bitte einen Titel eingeben." bei leerem Titel, „Board oder Spalte gibt es nicht mehr…" bei unbekanntem Ziel. Sonst `boards.createCard(boardId, columnId, card, true)` (oben in der Spalte; Spaltenfarbe und Erledigt-Spalten-Hook greifen wie bei jeder neuen Karte) mit derselben Grundform wie „Add card" in `Column.vue` (`id`, `name`, `description`, leere Farbe/Tasks/Tags, kein Datum), Auto-Save persistiert. Danach ggf. Inbox speichern und `quick-capture:added` senden.

## 3. UI

### 3.1 Settings (`pages/settings.vue`)

- Neuer Abschnitt „Tray & Schnellerfassung" zwischen „Preferences" und „Miscellaneous":
  - „In den Tray schließen" (Switch, `minimizeToTray`).
  - „Tastenkürzel für die Schnellerfassung": Textfeld (`w-72`, Übernahme bei `change` oder `Enter`), Button „Standard wiederherstellen", wenn vom Default abweichend. Darunter rot entweder der Validierungsfehler (Format, Modifier, Taste; ungültige Eingaben werden nicht gespeichert) oder der Registrierungsfehler.
  - „Eingang der Schnellerfassung": Anzeige „Board › Spalte", „Noch nicht gewählt" oder „Board oder Spalte gibt es nicht mehr, wird erneut abgefragt"; Button „Zurücksetzen" (leert die Inbox, das Capture-Fenster fragt dann wieder).
- Im Abschnitt „Miscellaneous" direkt unter „Autostart": „Minimiert starten" (Switch, `startMinimized`). Abweichung von der Abschnittsliste aus der Grill-Session: die Zeile steht beim Autostart, weil sie nur dort wirkt.

### 3.2 Capture-Fenster (`pages/capture.vue`)

`main` mit `flex h-full flex-col gap-2 p-3`; Textarea `bg-elevation-2 border-elevation-3 border-accent-focus … flex-1 resize-none rounded-md border`, Select gleich gestaltet, Statuszeile `h-5 text-sm`. Seite ohne Seitenübergang (`pageTransition: false`).

## 4. Datenmodell und Einstellungen

Keine Änderung an Board-/Kartentypen. Settings (`stores/settings.ts`, Tauri-Store-Keys gleichnamig):

| Key | Typ, Default | Bedeutung |
| --- | --- | --- |
| `minimizeToTray` | `boolean`, `true` | Schließen versteckt das Fenster |
| `startMinimized` | `boolean`, `false` | beim Autostart verborgen starten |
| `quickCaptureShortcut` | `string`, `"CommandOrControl+Alt+K"` | globales Kürzel, `""` = keins (`normalizeQuickCaptureShortcut`) |
| `quickCaptureBoardId` / `quickCaptureColumnId` | `string`, `""` | Inbox der Schnellerfassung |

Nicht persistiert: `quickCaptureShortcutError`. Setter: `setMinimizeToTray`, `setStartMinimized` (schreibt bei aktivem Autostart den Autostart-Eintrag neu), `setQuickCaptureShortcut`, `setQuickCaptureShortcutError`, `setQuickCaptureInbox(boardId, columnId)`.

## 5. Module

- `utils/quickCapture.ts` (rein, Node-Smoke-Test): Konstanten (Fensterlabel, Route, Größe, `QUICK_CAPTURE_EVENTS`, `APP_QUIT_REQUESTED_EVENT`, `DEFAULT_QUICK_CAPTURE_SHORTCUT`), Payload-Typen, `validateShortcut`, `normalizeQuickCaptureShortcut`, `splitCaptureText`, `escapeHtml`, `descriptionToHtml`, `buildCaptureTargets`, `resolveInbox`, `targetKey`/`parseTargetKey`, `monitorContainingPoint`, `centeredPosition`.
- `utils/themeCssVars.ts`: `themeCssVars(colors)` (aus `layouts/default.vue` herausgelöst, inkl. `--logo-accent`).
- `composables/useWindowLifecycle.ts`: `onBeforeWindowClose`, `runBeforeWindowCloseHandlers`, `setupMainWindowLifecycle(shouldHideOnClose)`, `showMainWindowOnStartup(startMinimized)`.
- `composables/useQuickCapture.ts`: `openQuickCapture`, `applyQuickCaptureShortcut`, `useQuickCaptureHost()` → `{ start, stop }`.
- `layouts/default.vue`: Fenster zeigen nach dem Laden der Einstellungen, `setupMainWindowLifecycle`, `useQuickCaptureHost().start()` nach der Minuten-Schleife; Aufräumen in `onBeforeUnmount`.
- `layouts/capture.vue`, `pages/capture.vue` (§2.5).
- `pages/document.vue`: `onBeforeWindowClose(() => flushSave())` statt eigenem `onCloseRequested`.
- `src-tauri/src/lib.rs`: Tray, Command `launched_by_autostart`, Autostart-Argument, Exit beim Zerstören des Hauptfensters, Global-Shortcut-Plugin, Window-State-Denylist.

## 6. Startreihenfolge (Hauptfenster)

`loadSettings` → `loadThemeSettings` → Fenster zeigen (oder verborgen lassen) → `loadLayoutSettings` → Close-/Quit-Handler → `boards.init()` → Locale → Dokument-Historie, Archiv, Reminder-Schleife → Schnellerfassungs-Host (Listener, Tastenkürzel).

## 7. Capabilities und Plugins

- Rust: Tauri-Feature `tray-icon` (`tauri = { …, features = ["protocol-asset", "tray-icon"] }`); `tauri-plugin-global-shortcut = "=2.3.2"` (Desktop-Target), Registrierung im `setup` über `app.handle().plugin(tauri_plugin_global_shortcut::Builder::new().build())`.
- npm: `@tauri-apps/plugin-global-shortcut` `2.3.2` (exakt, MIT OR Apache-2.0).
- Versionswahl: 2.3.2 (npm 2026-05-28) ist die neueste Version, die zu Tauri 2.11 und `@tauri-apps/api` 2.11 passt (Crate: `tauri ^2.10`, `global-hotkey ^0.8`; npm: `@tauri-apps/api ^2.11.0`). Ab 2.4.0 verlangt das Plugin `tauri ^2.12` und `@tauri-apps/api ^2.12.0`. Deutlich älter als die zwei Wochen Mindestalter des Firmen-Mirrors.
- `src-tauri/capabilities/main.json` (Fenster `main`) zusätzlich: `core:window:allow-unminimize`, `allow-set-focus`, `allow-set-position`, `allow-center`, `allow-destroy` (Quit über das Tray), `core:webview:allow-create-webview-window`, `global-shortcut:allow-register`, `allow-unregister`, `allow-is-registered`, `allow-unregister-all`. `allow-show`/`allow-hide` waren schon vorhanden; `cursor-position` und `available-monitors` sind in `core:window:default` enthalten. Fenster-Befehle werden gegen die Capability des **aufrufenden** Fensters geprüft; das Hauptfenster braucht die Rechte also auch, um das Capture-Fenster zu positionieren und zu zeigen.
- Neue Capability `src-tauri/capabilities/capture.json` (`capture-capability`, Fenster `capture`): `core:default`, `core:event:default`, `core:webview:default`, `core:window:allow-hide`, `allow-close`, `allow-set-focus`, `allow-center`, `allow-set-position`, `allow-set-size`, dazu `log:default`, weil `app.vue` und das Fehler-Plugin die Konsole an das Log-Plugin hängen. Kein Store, kein Dateisystem, keine Benachrichtigungen.
- Die Command `launched_by_autostart` braucht keine Permission (App-Command ohne App-Manifest).

## 8. i18n-Keys (en + de)

- `pages.capture.placeholder`: "Title, further lines become the description" / "Titel, weitere Zeilen werden zur Beschreibung"
- `pages.capture.targetLabel` / `targetPlaceholder` / `targetOption`: "Board and column of the new card" / "Choose board › column…" / "{boardName} › {columnName}" (de: "Board und Spalte der neuen Karte" / "Board › Spalte wählen…")
- `pages.capture.saved`: "Saved" / "Gespeichert"; `hint`: "Enter saves · Shift+Enter new line · Esc closes" / "Enter speichert · Umschalt+Enter neue Zeile · Esc schließt"
- `pages.capture.errorEmptyTitle` / `errorNoTarget` / `errorUnknown` / `errorNoAnswer`
- `quickCapture.errorNotReady` / `errorEmptyTitle` / `errorTargetMissing` / `errorUnknown` (Meldungen des Hauptfensters an das Capture-Fenster)
- `pages.settings.trayHeading`: "Tray & quick capture" / "Tray & Schnellerfassung"
- `pages.settings.trayMinimizeToTrayHeading` / `…Subtext`: "Close to tray" / "In den Tray schließen"
- `pages.settings.trayShortcutHeading` / `…Subtext` / `…Reset` / `…RegisterError` ("…, another program probably uses it." / "Tastenkürzel konnte nicht registriert werden, vermutlich belegt es ein anderes Programm.") / `…InvalidFormat` / `…InvalidModifier` / `…InvalidKey`
- `pages.settings.trayInboxHeading` / `…Subtext` / `…NotSet` / `…Invalid` / `…Value` / `…Reset`
- `pages.settings.miscellaneousStartMinimizedHeading` / `…Subtext`: "Start minimized" / "Minimiert starten"

## 9. Nicht-Ziele

- Lokalisierte Tray-Menütexte (§2.1).
- Weitere Felder im Capture-Fenster (Fälligkeit, Tags, Farbe); Markdown in der Beschreibung.
- Verschieben oder Größenänderung des Capture-Fensters durch den Nutzer (kein Titelbalken, keine Drag-Region).
- Automatisches Verstecken bei Fokusverlust.
- Tastenkürzel-Rekorder (Eingabe per Tastendruck statt Text).
- Badge oder Zähler am Tray-Icon.

## 10. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen, Befunde identisch mit `feat/reminders`. `corepack pnpm generate` erfolgreich, Route `/capture` vorgerendert (`.output/public/capture/index.html`), neue Klassen (`resize-none`, `outline-none`, `w-72`, `h-5`, `truncate`, `min-h-0`, `p-3`, `capture-layout`) im generierten CSS. `cargo build` (PowerShell) erfolgreich, Capability-Dateien dabei validiert. `tsc` gegen die `.ts`-Dateien: keine Fehler in neuen oder geänderten Dateien. Node-Smoke-Test `utils/quickCapture.ts` (46 Prüfungen: Tastenkürzel gültig/ungültig/normalisiert, Titel-/Beschreibungs-Split inkl. CRLF und Leerzeilen, HTML-Escaping, Zielliste ohne leere Boards/Spalten ohne id, Inbox-Gültigkeit, Monitorwahl und Zentrierung bei Skalierung 2).

Manueller UI-Test (`corepack pnpm tauri dev`, PowerShell):

1. Start: Fenster erscheint ohne Aufblitzen eines leeren weißen Fensters an der gespeicherten Position. Tray-Icon mit Kanri-Icon und Tooltip „Kanri" sichtbar. Fenster maximiert beenden, neu starten: maximiert und sichtbar (Window-State bei anfangs verstecktem Fenster).
2. Fenster schließen (X): Fenster verschwindet, Prozess läuft, Tray-Icon bleibt. Linksklick auf das Icon: Fenster kommt nach vorn. Minimieren und Linksklick: wiederhergestellt.
3. Rechtsklick: Menü „Open", „Quick capture", „Quit". „Open" zeigt das Fenster. „Quit" beendet die App vollständig (kein Prozess mehr im Task-Manager), auch wenn das Capture-Fenster vorher einmal offen war.
4. Markdown-Dokument öffnen, tippen und innerhalb 1 s das Fenster schließen: Fenster versteckt, Datei enthält den letzten Stand. Dasselbe mit „Quit" aus dem Tray.
5. „In den Tray schließen" ausschalten, Fenster schließen: App beendet sich (auch nach vorherigem Öffnen der Schnellerfassung). Dokument-Flush wie in 4.
6. Erinnerung im Tray: Karte heute fällig anlegen, Fenster in den Tray schließen, `remindersSent` ist leer: Benachrichtigung kommt innerhalb einer Minute.
7. `Strg+Alt+K` in einem anderen Programm: Capture-Fenster erscheint mittig auf dem Monitor mit dem Mauszeiger (zwei Monitore, unterschiedliche Skalierung prüfen), ohne Rahmen, über allen Fenstern, nicht in der Taskleiste, Textfeld fokussiert, Theme und Sprache wie die App.
8. Erste Nutzung: Select leer, Enter mit Titel → „Bitte Board und Spalte wählen.". Spalte wählen, „Einkaufen\nMilch\n\nBrot" + Enter: „Gespeichert", Fenster verschwindet; Karte „Einkaufen" steht oben in der Spalte, Beschreibung zwei Absätze mit Leerabsatz dazwischen. Settings zeigen die Inbox.
9. Erneut öffnen: Textfeld leer, Select auf der Inbox. `Umschalt+Enter` erzeugt Zeilenumbruch, `Esc` versteckt ohne Speichern. Text mit `<b>` wird als Text gespeichert, nicht als HTML.
10. Andere Spalte wählen und speichern: wird neue Inbox. Inbox-Spalte löschen: nächstes Öffnen zeigt leeres Select; Settings zeigen „Board oder Spalte gibt es nicht mehr…". „Zurücksetzen" in den Settings: Select wieder leer.
11. Fokus in ein anderes Fenster wechseln: Capture-Fenster bleibt offen. Zurückklicken fokussiert das Textfeld.
12. Tray „Quick capture" öffnet dasselbe Fenster (auch wenn das Hauptfenster im Tray ist), Karte landet im Board; das Hauptfenster bleibt versteckt.
13. Settings: Kürzel `Shift+K` → Fehler „Mindestens Control, Alt, Super oder CommandOrControl…", `Strg+Alt+` → Formatfehler, `ctrl+alt+n` → wird als `Control+Alt+N` gespeichert und wirkt sofort, das alte Kürzel nicht mehr. Ein von einem anderen Programm belegtes Kürzel (z. B. eines, das ein anderes Tool global nutzt): roter Hinweis „Tastenkürzel konnte nicht registriert werden…". „Standard wiederherstellen". Leeres Feld: kein Kürzel aktiv, kein Fehler.
14. Minimiert starten: Autostart an, „Minimiert starten" an, abmelden/anmelden (oder Kanri mit Argument `--autostart` starten): kein Fenster, nur Tray-Icon; Erinnerungen laufen. Manueller Start (Startmenü) mit derselben Einstellung: Fenster erscheint. Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` enthält `--autostart`.
15. Zweiter Start bei verstecktem Fenster: Fenster kommt nach vorn (Single-Instance).
16. Sprache Deutsch: alle neuen Texte übersetzt; Tray-Menü bleibt englisch (bekannt).
