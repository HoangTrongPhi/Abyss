# __APP_NAME__

__TAGLINE__ — part of the Phineas suite, installed and updated by [Abyss](https://github.com/HoangTrongPhi/Abyss).
Tauri 2 + Rust + React, Studio Dark UI from `@abyss/ui`. What it does and how it is built:
[docs/SPEC.md](docs/SPEC.md); where it stands: [docs/PROGRESS.md](docs/PROGRESS.md).

## Commands

```bash
npm install
npm run check          # typecheck + mock coverage + cargo test: green before every hand-off
npm run dev            # UI only; open http://localhost:__PORT__/?mock for the fake backend
npm run tauri dev      # desktop app with hot reload
npm run tauri build    # release build (unsigned updater artifacts fail; use npm run release)
npm run release -- -Version 0.1.0 -Notes "First release" [-Publish]
```

`@abyss/ui` is linked from `__UI_DEP__`; keep the Abyss folder next to this one (`npm install` in
Abyss first).

## Command line

The same exe runs headless when its first argument is a subcommand (anything else opens the window,
e.g. a file from Explorer's "Open with"):

```powershell
__APP_ID__.exe stats D:\Art --report stats.json        # one run, JSON report
__APP_ID__.exe stats D:\Art --fail-on warn --quiet     # CI gate: exit 1 on warnings too
__APP_ID__.exe stats D:\Art --watch                    # run again on every change, Ctrl+C stops
__APP_ID__.exe --help
```

| Exit code | Meaning |
|---|---|
| 0 | Done; no issue at the `--fail-on` level (default `error`) |
| 1 | Ran, but found issues at that level, or a step failed |
| 2 | Bad arguments, a broken project file or missing input |

In `cmd.exe` use `start /wait __APP_ID__.exe …` to wait for the exit code; PowerShell and CI call it
directly. In GitHub Actions:

```yaml
- name: __APP_NAME__ check
  run: '& "$env:LOCALAPPDATA\__APP_NAME__\__APP_ID__.exe" stats Assets --report stats.json --fail-on warn'
  shell: pwsh
```

## Mock mode

`npm run dev`, then `http://localhost:__PORT__/?mock`: `src/dev/mockBackend.ts` answers every command
in `src/lib/ipc.ts` with sample data (with deliberate errors), emits progress so Cancel works and fakes
the dialog / updater plugins. Only in dev builds with `?mock` in the URL, never inside Tauri.
`npm run check:mock` fails when a command has no mock case.

## Watch

Modules that can re-run on file changes have a **Watch** toggle in their header (and `--watch` on the
command line): debounced events, files must stop changing before the run, the action's own outputs
and engine folders (`Library/`, `Intermediate/`, `.godot/`, …) are ignored, changes during a run cause
one more run. Watches stop when the app closes. Code: `src-tauri/src/utils/watch.rs`.

## Project layout

```
src/                     React UI
  main.tsx               imports dev/mockBackend first
  App.tsx                rail + header + active tab + log drawer + dialogs
  components/layout/     NavigationRail, HeaderBar, SettingsDialog, AppAbout
  components/tabs/       one <Module>Tab.tsx per module (rail order: lib/modules.ts)
  lib/ipc.ts             every invoke() and event name
  stores/                zustand: appStore (tabs, log, drag) + one store per module
  types/__APP_ID__.ts    TypeScript mirrors of the Rust structs
src-tauri/src/
  main.rs / cli.rs       window or command line, same exe
  lib.rs                 configure(): state + commands, shared with ipc_tests.rs
  commands/              thin IPC wrappers (+ contract tests in mod.rs)
  core/                  engines, no tauri imports (RunCtx: progress + cancel)
  utils/                 logbus, jobs (one per kind, cancel), watch, paths (atomic write, relative paths)
docs/                    SPEC, PROGRESS, CHANGELOG, FORMATS
```

## Releasing

`npm run release` follows the suite's release standard (Abyss `docs/RELEASE_STANDARD.md`): signed NSIS
installer, `latest.json`, `SHA256SUMS.txt`, GitHub release `v<version>` on `__REPO__`. The signing key is
`%USERPROFILE%\.tauri\__APP_ID__.key` — back it up. In GitHub Actions, `.github/workflows/release.yml`
does the same with the key in the `TAURI_SIGNING_PRIVATE_KEY` secret.

After the first release, set `"status": "available"` for `__APP_ID__` in Abyss `catalog/catalog.json` and
bump its `revision`.
