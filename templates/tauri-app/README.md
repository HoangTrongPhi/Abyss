# __APP_NAME__

__TAGLINE__ — part of the Phineas suite, installed and updated by [Abyss](https://github.com/HoangTrongPhi/Abyss).
Tauri 2 + Rust + React, Studio Dark UI from `@abyss/ui`.

## Commands

```bash
npm install
npm run tauri dev      # desktop app with hot reload
npm run dev            # UI only, in a browser
npm run tauri build    # release installer (unsigned updater artifacts fail; use npm run release)
npm run release -- -Version 0.1.0 -Notes "First release" [-Publish]
```

`@abyss/ui` is linked from `__UI_DEP__`; keep the Abyss folder next to this one (`npm install` in
Abyss first).

## Releasing

`npm run release` follows the suite's release standard (Abyss `docs/RELEASE_STANDARD.md`): signed NSIS
installer, `latest.json`, `SHA256SUMS.txt`, GitHub release `v<version>` on `__REPO__`. The signing key is
`%USERPROFILE%\.tauri\__APP_ID__.key` — back it up. In GitHub Actions, `.github/workflows/release.yml`
does the same with the key in the `TAURI_SIGNING_PRIVATE_KEY` secret.

After the first release, set `"status": "available"` for `__APP_ID__` in Abyss `catalog/catalog.json` and
bump its `revision`.
