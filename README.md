# Abyss — launcher for Phineas' apps

Abyss installs, updates and launches every app of the suite (Poseidon first, more to come) and
installs Blender add-ons into every Blender on the PC — one window and a tray icon, in the spirit of
the Creative Cloud desktop app. Tauri 2 + Rust + React, Studio Dark UI.

```
Abyss/
├── apps/launcher/          the launcher (Tauri app)
│   ├── src/                React UI: Apps · Updates · Blender add-ons · Settings
│   └── src-tauri/src/      catalog, release (latest.json), verify (SHA-256 + minisign), installer,
│                           system (registry, processes, launch), blender, tray, settings, commands
├── packages/abyss-ui/      @abyss/ui — theme + components shared by the launcher and every app
├── templates/tauri-app/    starting point for a new app (npm run new-app): CLI, ?mock, jobs, watch,
│                           log drawer, palette, sample module; see its README
├── catalog/                catalog.json (apps, add-ons, free slots) + icons, read by every launcher
├── scripts/                release.ps1, create-app.mjs, validate-catalog.mjs
├── docs/RELEASE_STANDARD.md
└── samples/blender-addons/ test add-on for the add-on installer
```

## Commands

```bash
npm install                  # once, at this folder (npm workspaces)
npm run tauri dev            # launcher with hot reload
npm run dev                  # UI only; open http://localhost:1430/?mock for sample data
npm run build                # typecheck + bundle the UI
npm run typecheck            # every workspace
npm run new-app -- "Name" --tagline "..." --category "..." --spec docs/app-specs/<NN>_<NAME>.md
npm run catalog:check        # add -- --online to also check the live releases
cargo test --manifest-path apps/launcher/src-tauri/Cargo.toml
```

Live tests (network, the installed Poseidon, real Blender in a throw-away user folder):

```bash
cargo test --manifest-path apps/launcher/src-tauri/Cargo.toml -- --ignored --nocapture --test-threads=1
```

## How it works

- **Catalog** — `catalog/catalog.json`, fetched from GitHub (`raw.githubusercontent.com/HoangTrongPhi/Abyss/main/…`).
  The launcher also carries the copy it was built with and caches the last download; the highest
  `revision` wins, so it works offline. Entries are `available`, `beta`, `coming_soon` or `slot`
  (a reserved, empty place in the grid). Free slots also take the user's own programs: click one,
  or drop an `.exe` / `.bat` / `.lnk` on the window.
- **Install / update** — Abyss reads each app's `latest.json` from its latest GitHub release, downloads
  the NSIS installer, checks it against `SHA256SUMS.txt` and the app's signing key, and runs it
  silently (per-user, no admin). Updates of a running app wait until it closes ("Update on close").
  Detection uses the installer's Uninstall registry entry, so copies installed by hand count too.
- **Install location** — a new app goes into `<folder>\<product>`: `%LOCALAPPDATA%` unless *Settings →
  App installs* picks another folder. The install dialog (before each new install, can be turned off)
  shows that folder, its free space and whether Abyss can write there, and asks about the desktop
  shortcut. The folder reaches the installer as NSIS `/D=`; updates run with `/UPDATE`, so they stay
  where the app is and leave its shortcuts alone.
- **Launch** — apps start detached with `ABYSS=1` in their environment; apps from the template then
  leave update prompts to Abyss.
- **Blender add-ons** — Blender installs are found like Poseidon finds them; add-ons (legacy zips and
  4.2+ extensions) are installed, enabled and saved by Blender itself, headless
  (`src-tauri/scripts/abyss_addon_tool.py`), into every Blender the user ticks.
- **Self-update** — Abyss updates itself from its own releases (key `~/.tauri/abyss.key`).
- **Notifications** — every new version a check finds (an app's, or Abyss's own) lands once in the
  bell of the top bar, with its Update button; while Abyss sits in the tray or behind other windows,
  a Windows notification goes with it (*Settings → Behaviour*). The tray tooltip counts waiting updates.
- **Language & look** — English / Tiếng Việt (*Settings → Language*; the first start follows Windows),
  dark / light / system theme (also the sun/moon button in the top bar), fonts, UI size and effects.
  UI texts live in `apps/launcher/src/i18n/` (`en.ts` defines the keys, `vi.ts` must match them); the
  tray menu and job messages come from `src-tauri/src/i18n.rs`.
- **Effects** — a deep-water backdrop, a lit hero, cards that catch the pointer, pages and cards that
  rise in, moving progress bars. Transform and opacity only, paused while the window is hidden;
  *Settings → Appearance → Effects*: Full / Calm (nothing loops) / Off. Windows' "Animation effects"
  off means Calm. The `.fx-*` classes are in `packages/abyss-ui/theme.css`, the launcher's own in
  `apps/launcher/src/styles.css`.
- **About & contact** — the person icon at the bottom of the rail, as in Poseidon (author card in
  `apps/launcher/src/lib/author.ts`).

Releasing: [docs/RELEASE_STANDARD.md](docs/RELEASE_STANDARD.md).
