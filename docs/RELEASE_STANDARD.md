# Release standard

Every app Abyss installs is released the same way. Abyss, the app's own *Check for updates* and the
catalog checks all rely on it.

## The release

A normal (not pre-release, not draft) GitHub release, tag `v<semver>`, with four files:

| File | Made by | Read by |
|---|---|---|
| `<Product>_<version>_x64-setup.exe` | `tauri build` (NSIS, `installMode: currentUser`) | Abyss runs it with `/S` (+ `/D=<folder>` for a new install, `/UPDATE` for an update) |
| `<Product>_<version>_x64-setup.exe.sig` | Tauri's signer (`TAURI_SIGNING_PRIVATE_KEY`) | the app's updater; Abyss via `latest.json` |
| `latest.json` | `scripts/release.ps1` | the app's updater, Abyss (version, notes, installer URL, signature) |
| `SHA256SUMS.txt` | `scripts/release.ps1` | Abyss, `validate-catalog.mjs --online` |

`SHA256SUMS.txt` is `sha256sum` output: one `<lower-case hex>  <file name>` line per file.

Abyss installs a download only when it passes every check that applies, and at least one applies:

- its SHA-256 matches `SHA256SUMS.txt` from the same release folder (required when the catalog entry has no `pubkey`, and always for Blender add-ons);
- its minisign signature matches the catalog entry's `pubkey` (the app's `plugins.updater.pubkey`).

Abyss finds the release at `https://github.com/<repo>/releases/latest/download/latest.json`, so the
catalog never needs a version bump: publishing the release is the update.

## Making one

```powershell
# from the Abyss folder, for any app
./scripts/release.ps1 -App ../MyApp -Version 1.2.0 -Notes "What changed" [-Publish]
./scripts/release.ps1 -App apps/launcher -Version 0.2.0            # Abyss itself
```

The repository comes from the updater endpoint in the app's `tauri.conf.json`. The signing key is
`%USERPROFILE%\.tauri\<Cargo package name>.key` (`abyss.key`, `poseidon.key`, …); back it up — without it no installed copy can be updated again.

In GitHub Actions, call `.github/workflows/release-tauri-app.yml` (see the comment at its top) with
the key in the `TAURI_SIGNING_PRIVATE_KEY` secret. Abyss itself: *Actions → Release Abyss*.

Poseidon keeps its own `scripts/release.ps1`, which writes the same four files.

## Into the launcher

1. `npm run new-app -- "Name"` already put the app in the catalog as `coming_soon`, in a free slot.
2. After the first release: set `"status": "available"`, bump `revision`, run `npm run catalog:check -- --online`, push.
3. Every launcher picks the catalog up within a few hours (or at *Settings → Catalog → Reload*).

To try a catalog before pushing it, point *Settings → Catalog* (or the `ABYSS_CATALOG` environment
variable) at a local `catalog.json`. `install.manifest` can point an app at a local `latest.json`,
whose installer URL may be a file path next to a local `SHA256SUMS.txt`.

## Blender add-ons

A catalog add-on is a zip (legacy add-on with `__init__.py`, or a 4.2+ extension with
`blender_manifest.toml`) attached to a GitHub release next to a `SHA256SUMS.txt`, found with `repo` +
`asset` (`my_addon-*.zip`), or a direct `url`. `module` is the Python module once installed
(`my_addon`, or `bl_ext.user_default.<id>` for an extension). Abyss installs it with Blender itself,
headless, into every Blender the user ticks, enables it and saves the preferences.
