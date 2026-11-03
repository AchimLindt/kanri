<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Achim Lindt

SPDX-License-Identifier: CC0-1.0
-->

# Spec: Web-Links an Karten

Status: implementiert (Branch `feat/card-links`, 2026-11-03), manueller UI-Test gemäß §9 noch offen. Architekturkontext: `docs/ARCHITECTURE.md`, Vorbild: `docs/specs/card-documents.md`.

## 1. Ziel

Zu einer Karte lassen sich beliebig viele Web-Links ablegen (Jira, Confluence, Teams, SharePoint …). Ein Klick öffnet den Link im Standardbrowser des Systems. Die Links sind reine Verweise in den Board-Daten; UI und Technik folgen den Kartendokumenten (Abschnitt im Karten-Dialog, Zähler auf der Kachel).

## 2. Verhalten

- **Hinzufügen:** Im Karten-Dialog gibt es unter „Dokumente" den Abschnitt „Links" mit Liste, Eingabefeld für die URL, optionalem Feld für den Titel und Button „Hinzufügen". `Enter` im URL- oder Titelfeld fügt ebenfalls hinzu. Nach dem Hinzufügen werden beide Felder geleert.
- **URL-Normalisierung** (`normalizeLinkUrl` in `utils/cardLinks.ts`):
  - Eingabe wird getrimmt; leer = nichts passiert (kein Hinweis).
  - Ohne Schema wird `https://` vorangestellt (`jira.example.com/browse/X-1` → `https://jira.example.com/browse/X-1`). `host:port/...` (z. B. `localhost:8080`) gilt als „ohne Schema", nicht als Schema `localhost:`.
  - Erlaubte Schemata: `http`, `https`, `mailto` (Groß-/Kleinschreibung egal). Andere Schemata (`file:`, `javascript:`, `ftp:`, `tel:` …) werden abgelehnt; unter den Feldern erscheint der Hinweis `linksInvalidScheme`, die Eingabe bleibt stehen.
  - Die URL muss sich mit `new URL()` parsen lassen; `http(s)` braucht einen Hostnamen, `mailto` einen nicht leeren Empfängerteil. Sonst Hinweis `linksInvalidUrl`.
  - Gespeichert wird die von `URL` normalisierte Form (`href`), z. B. mit kodierten Leerzeichen.
- **Titel:** optional, getrimmt; leer = kein Titel (Feld entfällt in den Daten).
- **Anzeigename** (`linkDisplayName`): Titel, sonst bei `http(s)` Hostname ohne führendes `www.` plus Pfad ohne abschließendes `/`, bei `mailto` die Adresse. Länger als 60 Zeichen wird mit `…` gekürzt. Nicht parsebare Altwerte werden roh angezeigt.
- **Doppelte URLs** sind erlaubt (anders als bei Dokumenten): Derselbe Link mit unterschiedlichem Titel ist ein legitimer Fall, und ein Verweis hat keine Seiteneffekte.
- **Reihenfolge:** Einfügereihenfolge, neueste unten, kein Sortieren.
- **Öffnen:** Klick auf einen Eintrag öffnet die URL per `openUrl` (`@tauri-apps/plugin-opener`). Der Karten-Dialog bleibt offen. Vor dem Öffnen wird das Schema erneut geprüft (importierte Daten könnten beliebige Werte enthalten). Fehler (unerlaubtes Schema, Opener-Fehler) → `message(…, { kind: "error" })` aus `@tauri-apps/plugin-dialog` mit `linksOpenFailed` und dem Fehlertext.
- **Kontextmenü je Eintrag** (radix `ContextMenu`, Klassen wie bei den Dokumenten inkl. `z-[10000001]`):
  - „Öffnen" – wie Klick.
  - „URL kopieren" – `navigator.clipboard.writeText(url)`; Fallback per verstecktem `textarea` und `document.execCommand("copy")`, falls die Clipboard-API fehlt oder ablehnt. Kein zusätzliches Tauri-Plugin (Begründung §6).
  - „Bearbeiten" – füllt URL- und Titelfeld mit den Werten des Links, der Button heißt dann „Speichern", daneben „Abbrechen". Speichern validiert wie beim Hinzufügen. Wechsel der Karte, Schließen des Dialogs oder Entfernen des bearbeiteten Links beenden den Bearbeiten-Modus.
  - „Entfernen" – entfernt den Link sofort, ohne Rückfrage (reiner Verweis).
- **Karte duplizieren:** Links werden mitkopiert (Objekt-Kopie je Eintrag, gleiche `id`s zulässig). **Karte löschen:** Links verschwinden mit der Karte.
- **Export/Import:** Links sind Teil des Board-JSON; das zod-Schema übernimmt sie. Fehlt einem importierten Link die `id`, ergänzt der Karten-Dialog sie beim Öffnen (wie bei Dokumenten).

## 3. UI

### 3.1 Karten-Dialog (`components/modal/EditCard.vue`)

Abschnitt „Links" direkt nach „Dokumente", vor den Tags, gleiche Überschrift (`h2 text-lg font-semibold`).

- Liste: je Link ein `button` (`bg-elevation-2-hover flex w-full flex-row items-center gap-2 rounded-md px-2 py-1 text-left`) mit `PhLink` (`text-dim-2 size-5 shrink-0`), Anzeigename (`text-no-overflow-task`), Tooltip (`title`) mit der vollen URL. Umschlossen von `ContextMenuRoot/Trigger/Portal/Content` wie die Dokumente. Der gerade bearbeitete Link wird mit `bg-elevation-2` markiert.
- Darunter Formular: URL-Feld (`type="text"`, Platzhalter `linksUrlPlaceholder`), Titelfeld (Platzhalter `linksTitlePlaceholder`), beide `bg-elevation-2 … rounded-md` wie das Task-Eingabefeld, darunter Button „Hinzufügen"/„Speichern" (`bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1`) und im Bearbeiten-Modus „Abbrechen". Hinweistext bei Validierungsfehler in `text-sm text-red-500`; er verschwindet bei der nächsten Eingabe.

### 3.2 Karten-Kachel (`components/kanban/Card.vue`)

Im Footer direkt nach dem Dokument-Indikator: `PhLink` plus Anzahl, nur wenn `links.length > 0`, gleiche Klassen (`cardTextColorDim`, `iconSizeClass`, `taskTextClass`, zoomabhängig). Der lokale `card`-Watcher übernimmt `links`; `cardHasNoExtraProperties` berücksichtigt Links.

## 4. Datenmodell

`types/kanban-types.d.ts`:

```ts
export declare interface CardLink {
  id: string;     // generateUniqueID()
  url: string;    // normalisierte URL (http, https oder mailto)
  title?: string; // optionaler Anzeigename
}
// Card:
links?: Array<CardLink> | null;
```

`types/json-schemas.ts`, `kanriCardSchema`: `links: z.array(z.object({ id: z.string().optional(), url: z.string(), title: z.string().optional() })).optional().nullable()`.

Keine Migration, Altdaten haben `links === undefined`.

## 5. Store-Logik (`stores/boards.ts` + Fassade `composables/useBoard.ts`)

| Aktion | Verhalten |
| --- | --- |
| `addCardLink(boardId, columnId, cardId, url, title?)` | legt `card.links` bei Bedarf an; `push({ id, url, title? })`; `lastEdited`; gibt die neue `id` zurück (`null`, wenn Board/Spalte/Karte fehlt) |
| `updateCardLink(boardId, columnId, cardId, linkId, url, title?)` | ändert `url` und `title` des Eintrags in place (leerer Titel löscht das Feld); `lastEdited` |
| `removeCardLink(boardId, columnId, cardId, linkId)` | `splice` des Eintrags (in place, siehe ARCHITECTURE §9); `lastEdited` |
| `duplicateCard` (bestehend) | `structuredClone` kopiert `links` bereits; der manuelle Fallback kopiert `links` explizit je Eintrag |

Die Store-Actions validieren nicht; die Normalisierung passiert im Dialog vor dem Emit. `useBoard` spiegelt die drei Aktionen als `addCardLink(columnId, cardId, url, title?)`, `updateCardLink(columnId, cardId, linkId, url, title?)`, `removeCardLink(columnId, cardId, linkId)`.

## 6. Komponentenänderungen

- `utils/cardLinks.ts` (neu): `ALLOWED_LINK_SCHEMES`, `normalizeLinkUrl(input)` → `{ ok: true, url } | { ok: false, error: "empty" | "scheme" | "invalid" }`, `isAllowedLinkUrl(url)`, `linkDisplayName(link)`. Rein, ohne DOM/Tauri, per Node-Smoke-Test geprüft.
- `EditCard.vue`: Abschnitt Links (§3.1); neue Emits `addCardLink(columnId, cardId, url, title?)`, `updateCardLink(columnId, cardId, linkId, url, title?)`, `removeCardLink(columnId, cardId, linkId)`. Lokale Kopie `links` wie `documents` (gleiches Array-Objekt aus dem Store, IDs werden ergänzt).
- `pages/kanban/[id].vue`: Emits an `board.addCardLink/updateCardLink/removeCardLink` binden.
- `Card.vue`: Indikator (§3.2).
- **Capabilities:** keine Änderung. `opener:default` enthält `allow-default-urls` mit dem Scope `mailto:*`, `tel:*`, `http://*`, `https://*`; der Scope wird mit `glob::Pattern` geprüft, dessen `*` auch `/` matcht (geprüft in `tauri-plugin-opener` 2.5.4, `src/scope.rs`). `tel:` wäre technisch erlaubt, ist laut Vorgabe aber nicht vorgesehen und wird im Dialog abgelehnt.
- **Zwischenablage:** Der WebView läuft unter `http://tauri.localhost` (Windows) bzw. `tauri://localhost`; `*.localhost` gilt in Chromium/WebView2 als sicherer Kontext, `navigator.clipboard.writeText` ist dort verfügbar und braucht nur eine Nutzeraktion (der Kontextmenü-Klick). Deshalb kein `@tauri-apps/plugin-clipboard-manager` (spart Rust-Crate, Capability und Rebuild). Für den Fall, dass die API fehlt oder ablehnt, gibt es den `execCommand("copy")`-Fallback; schlägt auch der fehl, wird nur geloggt.

## 7. i18n-Keys (en + de, unter `modals.editCard`)

- `linksTitle`: "Links" / "Links"
- `linksUrlPlaceholder`: "https://…" / "https://…"
- `linksTitlePlaceholder`: "Title (optional)" / "Titel (optional)"
- `linksAdd`: "Add" / "Hinzufügen"
- `linksSave`: "Save" / "Speichern"
- `linksCancel`: "Cancel" / "Abbrechen"
- `linksInvalidScheme`: "Only http, https and mailto links are allowed." / "Nur http-, https- und mailto-Links sind erlaubt."
- `linksInvalidUrl`: "This is not a valid URL." / "Das ist keine gültige URL."
- `linksOpen`: "Open" / "Öffnen"
- `linksCopy`: "Copy URL" / "URL kopieren"
- `linksEdit`: "Edit" / "Bearbeiten"
- `linksRemove`: "Remove" / "Entfernen"
- `linksOpenFailed`: "The link could not be opened." / "Der Link konnte nicht geöffnet werden."

## 8. Nicht-Ziele

- Seitentitel automatisch aus dem Web laden, Favicons, Vorschaukarten.
- Sortieren oder Umordnen der Links per Drag & Drop.
- Links in der Kartenbeschreibung erkennen oder übernehmen.
- Weitere Schemata (`file:`, `tel:`, App-Protokolle wie `msteams:`); Teams-Links funktionieren als `https://teams.microsoft.com/...`.
- Rückfrage beim Entfernen, Undo.

## 9. Verifikation

Lint-Baseline (`corepack pnpm exec eslint .`, ohne `--fix`): 4 Fehler / 75 Warnungen auf `main` @ a725055; keine neuen Fehler oder Warnungen. `corepack pnpm generate` erfolgreich, neue Tailwind-Klassen im generierten CSS vorhanden. Node-Smoke-Test für `utils/cardLinks.ts`.

Manueller UI-Test (`corepack pnpm tauri dev`, PowerShell):

1. Karte öffnen, URL `jira.example.com/browse/ABC-1` eingeben, Enter: Eintrag „jira.example.com/browse/ABC-1" erscheint, Tooltip zeigt `https://jira.example.com/browse/ABC-1`, Felder sind leer.
2. URL plus Titel „Ticket" über den Button hinzufügen: Anzeige „Ticket".
3. `mailto:someone` + Enter wird akzeptiert; `file:///C:/x`, `javascript:alert(1)` und `ftp://x` zeigen den Schema-Hinweis, die Eingabe bleibt stehen; `https://` allein zeigt „keine gültige URL".
4. Klick auf einen Link öffnet den Standardbrowser, der Dialog bleibt offen; `mailto:` öffnet das Mailprogramm.
5. Kontextmenü „URL kopieren", in einen Editor einfügen: volle URL.
6. Kontextmenü „Bearbeiten": Felder gefüllt, Button „Speichern"; Titel ändern und speichern → Liste aktualisiert. „Abbrechen" leert die Felder. Escape schließt den Dialog, beim nächsten Öffnen ist der Bearbeiten-Modus weg.
7. Kontextmenü „Entfernen": Eintrag sofort weg, Kachel-Zähler sinkt sofort (ohne Dialog neu zu öffnen).
8. Kachel zeigt Link-Icon mit Anzahl neben dem Dokument-Indikator; Zoomstufen −1 bis 2 skalieren Icon und Zahl.
9. Karte duplizieren: Kopie hat dieselben Links. App neu starten: Links erhalten.
10. Board exportieren und wieder importieren: `links` im JSON, nach dem Import vorhanden.
11. Sprache Deutsch: alle Texte übersetzt.
