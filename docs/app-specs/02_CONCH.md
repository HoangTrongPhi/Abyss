# Conch — Localization & font checker for games

> **Ưu tiên**: 2 · **Dùng cho**: mọi game có chữ (2D/3D) · **MVP**: hết P5 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Tạo app**:
> `npm run new-app -- "Conch" --tagline "Localization & font checker for games" --category "Localization" --spec docs/app-specs/02_CONCH.md`

## 1. Mục tiêu

Bắt lỗi bản dịch **trước khi** chúng lên màn hình game:
- thiếu bản dịch;
- placeholder hoặc thẻ rich text lệch;
- chuỗi tiếng Việt ở dạng NFD;
- ký tự font không có (ô vuông);
- chữ tràn khung, đo bằng **pixel thật** của font.

Ngoài ra Conch sinh charset cho TextMeshPro, pseudo-localization để test UI, và đọc/ghi qua lại các định
dạng của Unity, Unreal, Godot và i18next.

### Ngoài phạm vi v1
- Kết nối API của Crowdin / Lokalise / Google Sheets: v1 chỉ nhận file xuất từ các nơi đó.
- XLIFF (để v2).
- Dịch máy: phase tùy chọn P9.
- Shaping cho chữ phải-sang-trái và chữ Ấn (đo vẫn dùng `rustybuzz`, nhưng không có rule riêng).

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Mở `strings.csv` (key, en, vi, ja) → tab Issues | Danh sách lỗi theo mức, mỗi lỗi có key, ngôn ngữ, gợi ý sửa |
| U2 | Chọn rule `unicode-nfd` → Fix all | Chuỗi chuyển sang NFC, có dry-run trước |
| U3 | Tab Fonts: thêm `NotoSans-Regular.ttf` cho `vi`, `NotoSansJP.otf` cho `ja` → Coverage | Danh sách ký tự thiếu theo ngôn ngữ, kèm key ví dụ |
| U4 | Export charset cho TMP | `charset_vi_ja.txt`, dùng ở TMP Font Asset Creator → Characters from File |
| U5 | Gán `maxWidth=220px @ 24px` cho key `ui.button.*` | Issue `overflow-px` cho chuỗi nào vượt, có xem trước bằng font thật |
| U6 | Pseudo-localize → export Unity CSV có thêm cột `qps-ploc` | Test được UI mở rộng 35% mà chưa cần bản dịch |
| U7 | CI: `conch check game.conch.json --fail-on error` | Mã thoát 1 nếu có lỗi |
| U8 | Bản tiếng Anh của 12 key vừa sửa | 12 bản dịch `vi`, `ja` được đánh dấu `stale` |

## 3. Mô hình dữ liệu

### 3.1 Project `*.conch.json` (`format: "conch.project"`, `version: 1`)

```jsonc
{
  "format": "conch.project", "version": 1,
  "sourceLanguage": "en",
  "languages": ["en", "vi", "ja"],
  "sources": [
    { "kind": "csv", "path": "loc/strings.csv", "keyColumn": "key", "columns": { "en": "en", "vi": "vi", "ja": "ja" },
      "metaColumns": { "context": "context", "maxWidth": "max_px" } },
    { "kind": "unityCsv", "path": "loc/UI Table.csv" },
    { "kind": "po", "path": "Content/Localization/Game/{lang}/Game.po" },       // Unreal; {lang} expands per language
    { "kind": "godotCsv", "path": "loc/translations.csv" },
    { "kind": "i18next", "path": "locales/{lang}/translation.json" },
    { "kind": "xlsx", "path": "loc/strings.xlsx", "sheet": "UI", "keyColumn": "A", "columns": { "en": "B", "vi": "C" } }
  ],
  "fontProfiles": [
    { "id": "ui", "fonts": ["fonts/Inter-Regular.ttf", "fonts/NotoSansJP-Regular.otf"], "sizePx": 24,
      "letterSpacingPx": 0, "languages": ["en", "vi", "ja"] }
  ],
  "layoutRules": [
    { "keyGlob": "ui.button.*", "fontProfile": "ui", "maxWidthPx": 220, "maxLines": 1 },
    { "keyGlob": "ui.tooltip.*", "fontProfile": "ui", "maxWidthPx": 480, "maxLines": 3 }
  ],
  "placeholders": ["braces", "doubleBraces", "printf", "unityRichText", "tmpTags", "ueRichText"],
  "glossary": "loc/glossary.csv",
  "rules": { "untranslated-identical": { "severity": "warn", "allow": ["OK", "HP", "XP"] } },
  "pseudo": { "locale": "qps-ploc", "expandPercent": 35, "brackets": true }
}
```

### 3.2 Mô hình trong bộ nhớ
- `Entry { key, context, meta: { maxWidthPx?, maxLines?, fontProfile?, tags[] }, values: Map<lang, Value> }`.
- `Value { text, status: new|translated|machine|reviewed|stale, sourceHash }`.
- `sourceHash` là xxh3 của chuỗi nguồn **tại lúc dịch**. Lưu trong sidecar `<project>.conch-state.json`, vì
  format gốc như CSV không có chỗ chứa. Nguồn đổi thì bản dịch thành `stale` (luồng U8).
- `SourceRef { file, row/line, column }` cho mỗi value, để ghi ngược đúng chỗ.

## 4. Đặc tả định dạng

| Kind | Đọc | Ghi | Chi tiết |
|---|---|---|---|
| `csv` | cột theo mapping; UTF-8 (có/không BOM), phát hiện `,` `;` `\t` | giữ thứ tự dòng và cột lạ; ghi UTF-8 **có BOM** nếu file gốc có | crate `csv` |
| `xlsx` | `calamine`, sheet + cột theo chữ cái | **file mới** `<name>.conch.xlsx` (không ghi đè xlsx gốc, vì mất định dạng) | `rust_xlsxwriter` |
| `unityCsv` | header `Key`, `Id`, rồi mỗi locale `Name(code)` (ví dụ `English(en)`), cột `Comments` tùy chọn | cùng header | Fixture thật từ Unity Localization (Q1) |
| `po` | `msgctxt` (UE: `Namespace,Key`), `msgid` = nguồn, `msgstr` = bản dịch, comment `#.` `#:`, chuỗi nhiều dòng, escape `\n \" \\`; plural `msgid_plural`/`msgstr[n]` | giữ comment, thứ tự; chỉ thay `msgstr` | Tự viết parser (khoảng 250 dòng) và test round-trip byte-identical khi không sửa gì |
| `godotCsv` | dòng đầu `keys,<lang>...` | cùng format | |
| `i18next` | JSON lồng → key dạng `a.b.c`; plural `_one`/`_other`; placeholder `{{x}}` | ghi lại lồng, giữ thứ tự key | |

**Quy tắc chung**: ghi ngược chỉ thay đổi các ô được sửa. Test round-trip: đọc rồi ghi mà không sửa phải
cho ra **file giống hệt từng byte** (trừ xlsx).

## 5. Rule kiểm tra

| Code | Mức mặc định | Phát hiện | Fix tự động |
|---|---|---|---|
| `missing-translation` | error | value rỗng hoặc thiếu | — |
| `untranslated-identical` | warn | target == source và nguồn có chữ cái; bỏ qua `allow` và glossary `doNotTranslate` | — |
| `placeholder-mismatch` | error | multiset placeholder khác nhau (xem bên dưới) | — |
| `tag-unbalanced` | error | thẻ mở/đóng không khớp (`<b>…`, `<color=…>…</color>`, UE `<Style>…</>`) | — |
| `whitespace-edge` | warn | khoảng trắng đầu/cuối khác nguồn | có (theo nguồn) |
| `double-space` | info | `"  "` trong target khi nguồn không có | có |
| `unicode-nfd` | error | `text != nfc(text)` | có (NFC) |
| `invisible-char` | warn | U+200B, U+FEFF, U+00AD, U+2060; U+00A0 ở mức info | có (xóa, trừ NBSP) |
| `glyph-missing` | error | ký tự không có trong mọi font của profile | — |
| `overflow-px` | error | độ rộng đo > `maxWidthPx`, hoặc số dòng sau khi wrap > `maxLines` | — |
| `length-ratio` | info | `len(target) > 1.6 × len(source)` khi chưa có layout rule | — |
| `glossary-violation` | warn | thuật ngữ glossary có trong nguồn nhưng target không chứa bản dịch bắt buộc | — |
| `duplicate-key` | error | key trùng trong cùng nguồn | — |
| `key-format` | warn | key không khớp regex project (nếu có) | — |
| `stale` | warn | bản dịch có `sourceHash` khác hash nguồn hiện tại | đánh dấu đã xem |
| `vi-tone-style` | info | lẫn kiểu bỏ dấu cũ/mới (`hoà`/`hòa`, `thuỷ`/`thủy`) trong cùng project | có (theo kiểu chọn) |

**Placeholder** (bật theo `placeholders`):
- `braces`: `{0}`, `{name}`
- `doubleBraces`: `{{name}}`
- `printf`: `%s %d %f %1$s %%`
- `unityRichText`: `<b> <i> <color=…> <size=…>`
- `tmpTags`: `<sprite=…> <link=…> <font=…> <mark=…>`
- `ueRichText`: `<Style>…</>` và `{Arg}`

So sánh **tên** placeholder (bỏ qua thứ tự). Vị trí đổi là hợp lệ, vì ngữ pháp các ngôn ngữ khác nhau.

**Đo pixel** (`overflow-px`):
- `rustybuzz` shape theo font của profile; font fallback theo thứ tự cho ký tự thiếu.
- Độ rộng = tổng advance × (sizePx / unitsPerEm) + letterSpacing × (số glyph − 1).
- Wrap theo từ (UAX #14, crate `unicode-linebreak`). Tiếng Nhật/Trung wrap theo ký tự.

## 6. Kiến trúc

### 6.1 Rust core

| File | Nội dung |
|---|---|
| `formats/{csv,xlsx,unity_csv,po,godot_csv,i18next}.rs` | `read(path, cfg) -> SourceTable`, `write(table, edits) -> bytes` |
| `model.rs` | Entry, Value, merge nhiều nguồn (key trùng giữa các nguồn → issue `duplicate-key-across-sources`) |
| `state.rs` | sidecar `.conch-state.json`, `sourceHash`, status |
| `placeholders.rs` | tokenizer theo cú pháp đã bật |
| `rules/*.rs` | mỗi rule một file, trait `Rule { code(), check(&Entry, &Ctx) -> Vec<Issue>, fix(&mut Value) -> bool }` |
| `fonts.rs` | nạp font (`ttf-parser`), cmap coverage, `rustybuzz` measure, cache theo (font, size, text) |
| `charset.rs` | tập ký tự theo ngôn ngữ, luôn kèm ASCII 0x20–0x7E; xuất `.txt` và dải hex |
| `pseudo.rs` | biến chuỗi giữ nguyên placeholder và tag |
| `glossary.rs` | CSV `term,lang,translation,doNotTranslate,caseSensitive` |
| `project.rs` | serde, resolve `{lang}`, migrate |

Crate: `csv`, `calamine`, `rust_xlsxwriter`, `ttf-parser`, `rustybuzz`, `unicode-normalization`,
`unicode-segmentation`, `unicode-linebreak`, `regex`, `globset`, `xxhash-rust`.

### 6.2 Commands

| Command | Mô tả |
|---|---|
| `load_project(path)` / `save_project(path, project)` | |
| `open_quick(paths[])` | tạo project tạm từ file kéo vào (đoán kind theo đuôi và header) |
| `load_strings(project)` → `StringTable` | đọc mọi nguồn (event `conch://progress`) |
| `check(project, { languages?, rules? })` → `CheckReport { issues[], counts }` | |
| `apply_fixes(project, { codes[], keys?, dryRun })` → `EditReport` | ghi ngược vào nguồn |
| `edit_values(project, edits[], dryRun)` → `EditReport` | sửa tay từ grid |
| `font_coverage(project, profileId)` → `CoverageReport { perLanguage: { missing: [{ char, codepoint, exampleKeys[] }] } }` | |
| `export_charset(project, { profileId?, languages[], out, format: "txt"\|"hexRanges" })` | |
| `measure(project, { key, lang })` → `{ widthPx, lines, glyphs }` | cho preview |
| `pseudo_localize(project, { out?, dryRun })` | thêm locale pseudo vào nguồn hoặc ra file riêng |
| `export(project, { kind, out, languages })` | chuyển giữa các format |
| `mark_reviewed(project, keys[], lang)` | |
| `watch_start({ action: { kind: "checkProject", project } })` | |

### 6.3 UI

| Hotkey | Module | Nội dung |
|---|---|---|
| 1 | **Strings** | grid virtualized: key, context, mỗi ngôn ngữ một cột (badge status), lọc theo issue/status/ngôn ngữ, sửa inline (Enter để lưu, qua `edit_values`), panel phải hiện chi tiết và lịch sử nguồn |
| 2 | **Issues** | nhóm theo code, rồi theo key; nút Fix (với rule fixable), Fix all (dry-run → xác nhận), nhảy tới ô trong Strings |
| 3 | **Fonts** | profile (thêm font, size, ngôn ngữ), bảng coverage, nút Export charset, ma trận font × ngôn ngữ |
| 4 | **Preview** | chọn key và ngôn ngữ, vẽ bằng **font thật** (nạp TTF qua `FontFace` + `convertFileSrc`), khung maxWidth và đường đỏ chỗ tràn, so sánh tất cả ngôn ngữ cùng lúc |
| 5 | **Glossary** | bảng thuật ngữ, thêm/sửa, thấy vi phạm |
| 6 | **Export** | chọn format đích, ngôn ngữ, pseudo; dry-run danh sách file |

Preview trên UI chỉ để nhìn. Kết quả **chuẩn** của `overflow-px` là phép đo trong Rust. Nếu chênh nhau
quá 2 px thì ghi warn vào log để điều tra.

## 7. CLI

```
conch check <project> [--lang vi,ja] [--rules a,b] [--fail-on warn|error] [--report r.json] [--watch]
conch fix <project> --rules unicode-nfd,whitespace-edge [--lang vi] [--dry-run] [--report r.json]
conch charset <project> [--profile ui] --lang vi,ja --out chars.txt [--format txt|hex]
conch pseudo <project> [--expand 35] [--out <file>] [--dry-run]
conch export <project> --to unityCsv|po|godotCsv|i18next|csv|xlsx --out <dir> [--lang ...]
conch coverage <project> --profile ui [--report r.json]
```

## 8. Watch

- Action `checkProject`: theo dõi mọi file nguồn, font và glossary. Chạy lại `check` cho **nguồn đã đổi**
  (font đổi thì chạy lại rule font cho mọi key).
- Dùng khi người dịch sửa file trong thư mục đồng bộ (Drive/Dropbox): tab Issues tự cập nhật.

## 9. Các phase

### P0 — Scaffold
1. Tạo app; module rỗng theo §6.3; thêm crate.
2. `sample-assets/`: `strings.csv` en/vi/ja khoảng 40 key, có lỗi cố ý cho **mọi** rule ở §5 (đánh dấu trong
   `sample-assets/README.md`). Chuỗi NFD tạo bằng script (`"Tiếng Việt".normalize("NFD")`). Font: chỉ dùng
   font OFL tải về **khi người dùng cho phép**; không thì test dùng font hệ thống `C:\Windows\Fonts\arial.ttf`
   (không đưa vào repo).
**Xong khi**: `npm run check` xanh.

### P1 — Format đọc/ghi
1. CSV, Godot CSV, i18next, PO: reader, writer, test round-trip byte-identical.
2. Unity CSV: **hỏi Q1**, lấy fixture.
3. XLSX: đọc; ghi file mới.
4. `model.rs`: gộp nguồn, `SourceRef`.
**Xong khi**: test round-trip xanh cho 5 format text.

### P2 — Rule engine (không font)
1. Tokenizer placeholder kèm test cho từng cú pháp, gồm cả trường hợp lồng `<color=#f00>{0}</color>`.
2. Mọi rule ở §5 trừ `glyph-missing` và `overflow-px`; fix cho các rule fixable.
3. `state.rs` + `stale`.
4. Commands `load_strings`, `check`, `apply_fixes`, `edit_values` + contract test + mock.
**Xong khi**: mỗi rule có ít nhất 1 test dương và 1 test âm; fix NFD có dry-run.

### P3 — Font
1. `fonts.rs`: cmap coverage, shaping và đo bằng `rustybuzz`, fallback chain.
2. Rule `glyph-missing`, `overflow-px` (+ wrap).
3. `charset.rs`: xuất txt (UTF-8, không BOM, ký tự sắp theo codepoint, không trùng) và hex ranges (`20-7E,A0-FF,1EA0-1EF9`).
4. Test: font có ASCII nhưng không có `ạ` (U+1EA1) → missing đúng; đo "WWW" > "iii" cùng font.
**Xong khi**: luồng U3, U4 chạy được từ CLI.

### P4 — CLI + watch
1. Mọi lệnh ở §7, kèm test.
2. Watch `checkProject`.
**Xong khi**: luồng U7 cho mã thoát đúng với `sample-assets`.

### P5 — UI chính (MVP, v0.1.0)
1. Strings grid (virtualized, sửa inline, lọc), Issues (fix, fix all), Fonts (coverage, export charset).
2. Mock: dữ liệu từ `sample-assets` (nhúng JSON), coverage có ký tự thiếu.
3. Phát hành 0.1.0.
**Xong khi**: luồng U1–U5 chạy trên app thật.

### P6 — Preview + layout rule UI
1. Module Preview: FontFace từ file, khung maxWidth, so sánh đa ngôn ngữ.
2. Sửa `layoutRules` trong UI (keyGlob, profile, width, lines), hiện số key khớp.
**Xong khi**: luồng U5 có preview khớp số đo Rust (chênh ≤ 2 px).

### P7 — Pseudo-localization + Export
1. `pseudo.rs`:
   - chữ Latin → chữ có dấu tương ứng (`a→á`, `e→é`, …, bảng cố định);
   - nối thêm `~` theo `expandPercent`;
   - bọc `[…]`;
   - **không đụng** placeholder và tag.
2. Export chéo format; ngôn ngữ chọn được.
**Xong khi**: luồng U6; test pseudo giữ nguyên `{0}` và `<b>`.

### P8 — Glossary + `vi-tone-style`
1. Glossary CSV, rule `glossary-violation`, module Glossary.
2. `vi-tone-style`: bảng các cặp `oà/òa, oá/óa, oả/ỏa, oã/õa, oạ/ọa, oè/òe, oé/óe, oẻ/ỏe, oẽ/õe, oẹ/ọe, uỳ/ùy, uý/úy, uỷ/ủy, uỹ/ũy, uỵ/ụy`.
   Chỉ áp ở **cuối âm tiết** (`hoà` vs `hòa`; không áp cho `hoàn`). Kiểu chọn trong project:
   `"viToneStyle": "new" | "old"`.
**Xong khi**: test với 10 từ mẫu cho cả hai kiểu.

### P9 — (Tùy chọn) Dịch máy có glossary
- Chỉ làm khi người dùng yêu cầu. Trước khi viết code, đọc skill `claude-api` để lấy model id và cách gọi
  hiện hành.
- Gửi theo lô: key, nguồn, context, maxWidth, glossary liên quan. Kết quả mang status `machine`, luôn cần review.
- API key lưu trong Windows Credential Manager (crate `keyring`), không bao giờ ghi vào settings.json.

### P10 — Hoàn thiện, v0.2.0
- User guide, hiệu năng (50.000 key × 10 ngôn ngữ: check < 3 giây), phát hành.

## 10. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Dùng Unity Localization (package `com.unity.localization`) không? Gửi một CSV xuất thật | P1 |
| Q2 | Game của bạn dùng engine nào và format nào là chính? | P1 |
| Q3 | Cho phép tải font Noto (OFL) vào `sample-assets` không? | P0 |
| Q4 | Kiểu bỏ dấu tiếng Việt mặc định: mới (`hòa`) hay cũ (`hoà`)? | P8 |
| Q5 | Có muốn dịch máy (P9) không, và với ngôn ngữ nào? | P9 |

## 11. Rủi ro
- **Unity CSV đổi header giữa các phiên bản package** → đọc header linh hoạt (regex `^(.*)\((.+)\)$`),
  test bằng fixture thật.
- **Đo pixel khác engine vài pixel** (hinting, kerning do engine tự xử lý) → cho phép dung sai
  `toleranceRelPercent` (mặc định 2%) và ghi rõ trong docs: "đo theo HarfBuzz".
- **CSV từ Excel bị mã hóa ANSI** → phát hiện chuỗi không phải UTF-8 hợp lệ, báo lỗi
  `encoding-not-utf8`, gợi ý lưu lại thành "CSV UTF-8".
