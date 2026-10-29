# __APP_NAME__ — File formats

Every JSON file __APP_NAME__ reads or writes (projects, presets, reports), with a full example each.
Conventions (Abyss `docs/app-specs/00_SHARED_FRAMEWORK.md` §6): a `"format": "__APP_ID__.<kind>"` and a
`"version"` field, paths relative to the file, 2-space indent, stable key order, unknown fields ignored.

## Reports (`--report`)

The command line writes the same structure the app shows. Every report has `elapsedMs`, `ok`,
`cancelled` and `issues[]` of `{ severity: "info" | "warn" | "error", code, message, path? }`.

### Folder Stats (sample module — remove with it)

```json
{
  "root": "D:/Art",
  "files": 2,
  "bytes": 65,
  "byExt": [{ "ext": "png", "files": 1, "bytes": 64 }, { "ext": "txt", "files": 1, "bytes": 1 }],
  "largest": [{ "path": "D:/Art/a.png", "bytes": 64 }],
  "issues": [],
  "elapsedMs": 3,
  "ok": true,
  "cancelled": false
}
```
