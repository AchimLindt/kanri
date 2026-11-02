# Kanri (privater Fork)

Privater Fork von [kanriapp/kanri](https://github.com/kanriapp/kanri) für eigene kleine Anpassungen.
Remotes: `origin` = AchimLindt/kanri (SSH-Alias `github-private`), `upstream` = kanriapp/kanri.

**Vor jeder Arbeit lesen:** `docs/ARCHITECTURE.md` (Datenmodell, Store, Komponenten, Datenflüsse, Fallstricke).
Feature-Specs liegen unter `docs/specs/`.

## Konventionen (vom Upstream-Projekt übernommen)

- **Branches:** `feat/<topic>`, `fix/<topic>`, `chore/<topic>` (kein A12-Schema in diesem Repo).
- **Commits:** Conventional Commits, z. B. `feat: add column colors`, `fix(i18n): ...`, `chore: ...`, `refactor: ...`, `docs: ...`.
- **Lizenz-Header:** Jede neue `.ts`/`.vue`-Datei bekommt den GPL-3.0-Header (von einer bestehenden Datei kopieren, trobonox-Attribution behalten, eigenen Namen anhängen). Bei Änderungen ≥ 3 Zeilen eigenen Namen in die `SPDX-FileCopyrightText`-Zeile aufnehmen. Nicht-Code-Dateien (`.json`, `.md`, Configs) brauchen eine `<datei>.license`-Begleitdatei (REUSE) oder einen Kommentar-Header.
- **Vue:** `<script setup lang="ts">`, Composition API, Nuxt-Auto-Imports (kein Import von `ref`, `computed`, Stores, Komponenten nötig). Komponenten werden über Pfad-Präfix referenziert: `components/kanban/Card.vue` → `<KanbanCard>`, `components/modal/EditCard.vue` → `<ModalEditCard>`.
- **Events:** camelCase in Templates (`@closeModal`), eslint-Regel `vue/v-on-event-hyphenation` ist aus.
- **Styling:** Tailwind-Utility-Klassen + Theme-Klassen aus `assets/css/themes` (`bg-elevation-1/2/3`, `text-dim-1..4`, `bg-accent`, `text-buttons`). Farbwerte in Daten sind entweder Tailwind-Klasse (`bg-pink-600`) oder Hex (`#rrggbb`).
- **i18n:** Alle UI-Texte über `$t(...)`; neue Keys in `i18n/locales/en.json` UND `de.json` pflegen (Fallback-Locale ist `en`, übrige Sprachen können fehlen).
- **Store-Zugriff:** Tauri-Store (`useTauriStore`) nur innerhalb von `stores/*` (eslint-Regel `custom/no-store-outside-stores`).

## Werkzeuge

- Paketmanager: pnpm (via `corepack pnpm ...`, pnpm ist nicht global installiert).
- `corepack pnpm install --frozen-lockfile`, dann `corepack pnpm dev` (Nuxt auf :3000) oder `corepack pnpm tauri dev` (Desktop-App).
- Lint: `corepack pnpm lint` (benötigt `.nuxt/eslint.config.mjs` → vorher `npx nuxi prepare`).
- Build-Check: `corepack pnpm generate`.
- Tests: vitest-Config vorhanden, aber vitest ist NICHT in den devDependencies; Specs (`*.spec.ts`) laufen derzeit nicht.
