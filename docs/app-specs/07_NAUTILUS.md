# Nautilus — Game data editor & balancing lab

> **Ưu tiên**: 7 (lớn nhất) · **Dùng cho**: RPG, roguelike, game có item/enemy/level/kinh tế · **MVP**: hết P5 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Tạo app**:
> `npm run new-app -- "Nautilus" --tagline "Game data editor & balancing lab" --category "Game Design" --spec docs/app-specs/07_NAUTILUS.md`

## 1. Mục tiêu

Thay bảng Excel rời rạc bằng **dữ liệu game có schema**:
- sửa trên grid có kiểu dữ liệu;
- bắt lỗi tham chiếu, khoảng giá trị, ID trùng;
- lưu dạng JSON để git diff dễ đọc;
- xuất thẳng cho Unreal DataTable, Unity và Godot, kèm code sinh sẵn.

Phần **Balancing lab** gồm:
- curve theo công thức;
- mô phỏng drop (xác suất, pity);
- ma trận combat DPS/TTK;
- (tùy chọn) mô phỏng kinh tế.

CLI `validate` dùng làm cổng CI cho các PR sửa dữ liệu.

### Ngoài phạm vi v1
- Nhiều người sửa cùng lúc (realtime).
- Kết nối API Google Sheets: nhận file XLSX/CSV xuất ra.
- Hot-reload trực tiếp vào engine đang chạy (chỉ ghi file, engine tự reload nếu có cơ chế).

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Tạo project, định nghĩa schema `items` (id, name, rarity enum, price int ≥ 0, damage float, icon asset), `enemies`, `loot_tables` (ref → items) | Grid cho từng bảng, editor đúng kiểu |
| U2 | Import `items.xlsx` cũ → map cột vào field | 240 dòng, 6 lỗi (giá âm, rarity lạ, icon không tồn tại) |
| U3 | Sửa grid: chọn 30 dòng → set `rarity = rare`, hoặc fill công thức `price = round(damage * 12)` | Có undo/redo; dirty → Save ghi `data/items.json` |
| U4 | Export UE: CSV DataTable + `FItemsRow.h`; Unity: JSON + C# classes + importer; Godot: JSON + GDScript | File vào đúng thư mục game project |
| U5 | Curve: XP = `100 * L^1.8`, L = 1..50, so sánh với `120 * L^1.65`; nhập XP/phút | Biểu đồ, bảng, "giờ chơi để đạt level" |
| U6 | Drop sim: legendary 1%, pity sau 80 lần | Kỳ vọng, số lần để 50%/90%/99% người chơi có item, histogram |
| U7 | Combat matrix: weapons × enemies | DPS, TTK, số hit; ô ngoài khoảng 2–6 giây tô đỏ |
| U8 | CI: `nautilus validate . --fail-on error` | Mã thoát 1 khi PR làm gãy tham chiếu |
| U9 | Watch: designer sửa `data/*.json` trong git → auto export sang game | File export cập nhật |

## 3. Cấu trúc project (một thư mục, nên nằm trong repo game)

```
GameData/
├── nautilus.project.json     tên, danh sách bảng, export targets, gốc game project
├── schemas/<table>.schema.json
├── data/<table>.json
├── curves/<name>.curve.json
├── sims/<name>.sim.json      drop / combat / economy
└── .nautilus/                cache, undo log (gitignore)
```

### 3.1 Schema `<table>.schema.json` (`format: "nautilus.schema"`)

```jsonc
{ "format": "nautilus.schema", "version": 1, "table": "items", "idField": "id", "displayField": "name",
  "fields": [
    { "name": "id", "type": "string", "pattern": "^[a-z][a-z0-9_]*$", "unique": true, "required": true },
    { "name": "name", "type": "string", "required": true, "localizedKey": false },
    { "name": "rarity", "type": "enum", "values": ["common", "rare", "epic", "legendary"], "default": "common" },
    { "name": "price", "type": "int", "min": 0 },
    { "name": "damage", "type": "float", "min": 0, "max": 9999, "decimals": 2 },
    { "name": "tags", "type": "list", "of": { "type": "string" }, "maxItems": 8 },
    { "name": "icon", "type": "asset", "glob": "Assets/Icons/**/*.png" },
    { "name": "upgrade_to", "type": "ref", "table": "items", "nullable": true },
    { "name": "color", "type": "color" },
    { "name": "offset", "type": "vec3" },
    { "name": "dps", "type": "float", "computed": "damage * attack_rate" }
  ],
  "rules": [ { "id": "sell-le-buy", "expr": "sell_price <= price", "severity": "error", "message": "Sell price above buy price" } ] }
```

Các kiểu: `string`, `int`, `float`, `bool`, `enum`, `ref`, `list`, `struct` (field lồng), `asset`, `color` (`#rrggbbaa`),
`vec2`, `vec3`, `curveRef`.

### 3.2 Data `data/<table>.json`
- Mảng object, **sắp theo id**, mỗi dòng một object (writer tự viết: `[\n  {…},\n  {…}\n]`), key theo thứ tự field
  trong schema. Mục đích: diff git một dòng cho một bản ghi.
- Field `computed` **không lưu**, chỉ tính khi validate, xem và export.

### 3.3 Biểu thức
- Crate `evalexpr`. Biến: field của dòng hiện tại; `L` trong curve; `attacker.*`/`defender.*` trong combat;
  `rows("table")` để tổng hợp (P8).
- Hàm thêm: `clamp`, `lerp`, `round(x, n)`, `ceil`, `floor`, `pow`, `ln`, `log10`, `min`, `max`.
- Lỗi biểu thức → issue có vị trí.

## 4. Validation (`validate(project) -> ValidationReport`)

| Code | Mức | Mô tả |
|---|---|---|
| `type-mismatch` | error | giá trị sai kiểu |
| `required-missing` | error | |
| `out-of-range` | error | min/max/decimals/maxItems |
| `pattern-mismatch` | error | |
| `duplicate-id` | error | |
| `unique-violation` | error | |
| `broken-ref` | error | ref tới id không tồn tại |
| `enum-unknown` | error | |
| `asset-missing` | warn | glob tìm trong `gameRoot`; không có `gameRoot` thì bỏ qua |
| `rule-failed` | theo rule | biểu thức `rules[]` trả false |
| `expr-error` | error | |
| `schema-invalid` | error | schema tự sai (field trùng, ref tới bảng không có) |
| `orphan-row` | info | (tùy chọn) dòng không bảng nào tham chiếu, cho bảng được đánh dấu `expectReferenced` |

Báo cáo gồm `table`, `id`, `field`, `message`. UI nhảy được tới đúng ô.

## 5. Export

| Target | File | Chi tiết |
|---|---|---|
| `json` | `<out>/<table>.json` | giá trị `computed` được tính sẵn (tùy chọn) |
| `ue` | `<out>/<Table>.csv` + `<out>/Source/<Table>Row.h` | CSV: cột đầu là `Name` (row name = id), các cột theo tên field PascalCase; list → `"(a,b,c)"`, struct → `"(X=1,Y=2)"`, vec3 → `"(X=…,Y=…,Z=…)"`, color → `"(R=…,G=…,B=…,A=…)"` (FLinearColor), ref → id (FName), asset → soft path tùy cấu hình. Header: `USTRUCT(BlueprintType) struct F<Table>Row : public FTableRowBase { GENERATED_BODY() UPROPERTY(EditAnywhere, BlueprintReadOnly) … }`, enum sinh `UENUM(BlueprintType)`. *Kiểm chứng*: người dùng import CSV vào DataTable với struct sinh ra (Q1) |
| `unity` | `<out>/<table>.json` + `<out>/Scripts/<Table>.cs` + `<out>/Editor/NautilusImporter.cs` | C# `[Serializable] public class <Table>Row` + `ScriptableObject <Table>Database` (List). Importer: menu `Tools/Nautilus/Import All` đọc JSON → tạo/cập nhật asset `.asset`. Dùng `JsonUtility` (bọc mảng trong object `{ "rows": [...] }`, vì JsonUtility không đọc mảng gốc) |
| `godot` | `<out>/<table>.json` + `<out>/<table>_row.gd` | GDScript `class_name <Table>Row extends Resource` với `@export` từng field + `static func from_dict(d: Dictionary)`; loader autoload `nautilus_db.gd` (tùy chọn) |

Codegen: tên PascalCase hoặc camelCase theo target; enum theo target; mỗi file sinh có header
`// Generated by Nautilus — do not edit` và hash schema, để phát hiện file bị sửa tay (khi đó: warn
`generated-file-modified`, không ghi đè nếu không có `--force`).

## 6. Balancing lab

### 6.1 Curve `curves/<name>.curve.json`
`{ "expr": "100 * L^1.8", "domain": [1, 50], "params": { }, "compare": ["120 * L^1.65"], "rate": { "perMinute": 450 }, "round": 0 }`
- Bảng giá trị và tăng trưởng `v(L+1)/v(L)`.
- Tổng tích lũy và **thời gian để đạt** = tích lũy / rate (giờ, phút).
- Xuất thành một cột của bảng (ví dụ `levels.xp_to_next`) hoặc ra JSON mảng.

### 6.2 Drop sim `sims/<name>.sim.json` (kind `drop`)
- Bảng drop có trọng số (chọn 1) hoặc xác suất độc lập (mỗi entry tự roll); pity cứng `guaranteeAfter`; pity
  mềm `softPity: { start, increasePerRoll }`.
- Công thức chính xác khi không có pity: `P(≥1 sau n) = 1 − (1−p)^n`; số lần cho mức q:
  `n = ⌈ln(1−q)/ln(1−p)⌉` (ví dụ p = 1%, q = 90% → 230).
- Có pity: Monte Carlo N người chơi (mặc định 100.000, seed cố định), histogram số lần, percentile 50/90/99, kỳ vọng.
- Test: không pity → Monte Carlo khớp công thức trong ±1%.

### 6.3 Combat matrix (kind `combat`)
- Hàng từ bảng attacker (weapons/characters), cột từ bảng defender (enemies).
- Công thức cấu hình được:
  `dmgPerHit = attacker.damage * (1 - defender.armor / (defender.armor + 100))`,
  `dps = dmgPerHit * attacker.attack_rate * (1 + attacker.crit_chance * (attacker.crit_mult - 1))`,
  `ttk = defender.hp / dps`, `hits = ceil(defender.hp / dmgPerHit)`.
- Dải mục tiêu (ví dụ TTK 2–6 giây) → tô màu. Độ nhạy: chỉnh ±10% một thông số, xem ô nào đổi màu.

### 6.4 Economy sim (kind `economy`, tùy chọn P9)
- Nguồn và chỗ tiêu là biểu thức theo ngày và archetype người chơi.
- D ngày × N người chơi giả (có ngẫu nhiên) → phân bố số dư theo thời gian, chỉ số lạm phát.

## 7. Kiến trúc

### 7.1 Rust core
`project.rs`, `schema.rs` (parse, kiểm tra schema), `value.rs` (enum Value + chuyển kiểu), `data_io.rs`
(đọc/ghi JSON ổn định), `validate.rs`, `expr.rs` (bọc evalexpr, hàm thêm), `import/{xlsx,csv}.rs` (mapping cột,
ép kiểu, báo lỗi theo ô), `export/{json,ue,unity,godot}.rs`, `codegen/{cpp,csharp,gdscript}.rs`, `edit.rs` (áp danh
sách `Edit { table, id, field, old, new }`, kiểm `old` khớp để tránh ghi đè thay đổi bên ngoài),
`sim/{curve,drop,combat,economy}.rs`.

Crate: `serde_json` (`preserve_order`), `evalexpr`, `calamine`, `csv`, `globset`, `rayon`, `rand`.

### 7.2 Commands

| Command | Mô tả |
|---|---|
| `open_project(dir)` / `create_project(dir, name)` | |
| `get_schema(table)` / `save_schema(schema)` | lưu schema → validate lại |
| `get_rows(table, { offset, limit, filter?, sort? })` → `{ rows, total }` | phân trang cho grid |
| `apply_edits(edits[])` → `EditResult { applied, conflicts[], issues[] }` | ghi file ngay, hoặc giữ trong bộ nhớ đến Save (Q2) |
| `validate()` → `ValidationReport` | |
| `import_preview(file, sheet?)` → `{ columns, sample }`; `import_apply(table, mapping, { mode: replace\|merge, dryRun })` | |
| `export(targets?, { dryRun, force })` → `ExportReport` | |
| `curve_eval(curveDef)` → `CurveResult` | |
| `sim_drop(def)` / `sim_combat(def)` / `sim_economy(def)` | job khi Monte Carlo |
| `watch_start({ action: { kind: "validateAndExport", project } })` | |

### 7.3 UI

| Hotkey | Module | Nội dung |
|---|---|---|
| 1 | **Tables** | danh sách bảng (số dòng, số lỗi) + grid virtualized: editor theo kiểu (enum dropdown, ref picker có tìm kiếm, list chip, color picker, asset path và thumbnail nếu là ảnh), chọn nhiều ô, set hàng loạt, fill công thức, undo/redo (`Ctrl+Z`/`Ctrl+Y`), thêm/xóa/nhân bản dòng, lọc theo lỗi |
| 2 | **Schema** | editor field (form), xem trước ảnh hưởng (số dòng sẽ lỗi), rules |
| 3 | **Issues** | danh sách lỗi validate, nhảy tới ô |
| 4 | **Curves** | biểu đồ (uPlot), bảng, so sánh, thời gian đạt level |
| 5 | **Drops** | định nghĩa bảng drop và pity, kết quả, histogram |
| 6 | **Combat** | ma trận màu, cấu hình công thức, độ nhạy |
| 7 | **Import / Export** | import XLSX/CSV (mapping cột kéo thả), export targets, dry-run |

## 8. CLI

```
nautilus validate <projectDir> [--fail-on warn|error] [--report r.json] [--watch]
nautilus export <projectDir> [--target ue|unity|godot|json] [--out <dir>] [--dry-run] [--force]
nautilus import <projectDir> --table items --file items.xlsx [--sheet Items] --mapping map.json [--mode merge] [--dry-run]
nautilus sim <projectDir> <sims/name.sim.json> [--report r.json]
nautilus curve <projectDir> <curves/xp.curve.json> [--csv out.csv]
```

## 9. Watch
Action `validateAndExport`: theo dõi `schemas/`, `data/`, `curves/`. Thay đổi → validate → nếu không có lỗi
`error` thì export các target bật `autoExport` → `watch://status`.

## 10. Các phase

### P0 — Scaffold
Tạo app; 7 module rỗng; crate. `sample-assets/GameData/` có 4 bảng mẫu (items 50 dòng, enemies 20, weapons 10,
loot_tables 10) với lỗi cố ý (một ref gãy, một giá âm, một ID trùng).
**Xong khi**: `npm run check` xanh.

### P1 — Schema + data I/O + validate
Mọi kiểu ở §3.1, writer JSON ổn định (test: đọc rồi ghi không sửa → giống byte), mọi code ở §4, evalexpr cho
`computed` và `rules`.
**Xong khi**: validate `sample-assets` ra đúng các lỗi cố ý; CLI `validate` cho mã đúng (luồng U8).

### P2 — Edit + export JSON + CLI
`apply_edits` có kiểm xung đột, `export json`, CLI `export`. **Xong khi**: test edit → file đúng, diff một dòng.

### P3 — UI Tables + Issues + mock
Grid virtualized với editor theo kiểu, multi-select, set hàng loạt, fill công thức, undo/redo, nhảy từ Issues.
Mock: dữ liệu `sample-assets` (nhúng JSON).
**Xong khi**: U1, U3 trên app thật; grid 50.000 dòng cuộn mượt.

### P4 — Import XLSX/CSV
Preview, mapping, ép kiểu, báo lỗi theo ô, merge/replace, dry-run. **Xong khi**: U2.

### P5 — Export engine + codegen (MVP, v0.1.0)
1. UE CSV + header; Unity JSON + C# + importer; Godot JSON + GDScript. **Hỏi Q1** (engine chính).
2. Test so sánh output với mẫu viết tay; phát hiện file sinh bị sửa tay.
3. Phát hành 0.1.0.
**Xong khi**: U4; người dùng xác nhận import thành công ở engine chính.

### P6 — Curves
**Xong khi**: U5; test tích lũy và thời gian đạt level.

### P7 — Drop sim
**Xong khi**: U6; test Monte Carlo khớp công thức ±1%.

### P8 — Combat matrix
**Xong khi**: U7; test một ô tính tay.

### P9 — (Tùy chọn) Economy sim
Hỏi người dùng có cần không.

### P10 — Watch + hoàn thiện, v0.2.0
Watch `validateAndExport` (U9), user guide, ví dụ GitHub Actions `nautilus validate`.

## 11. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Engine chính để ưu tiên export (UE / Unity / Godot)? Unity: dùng ScriptableObject hay đọc JSON lúc chạy? | P5 |
| Q2 | Sửa grid ghi file ngay (như Notion), hay giữ đến khi bấm Save (như Excel)? | P2 |
| Q3 | Dữ liệu hiện đang ở đâu (Excel, Google Sheets, JSON tay)? Gửi một file mẫu | P4 |
| Q4 | Các loại mô phỏng nào thực sự cần (drop, combat, economy)? | P6 |

## 12. Rủi ro
- **Phạm vi lớn nhất của bộ** → MVP dừng ở P5 (dữ liệu + export). Balancing là các phase độc lập, làm theo nhu cầu.
- **Hai người sửa cùng file qua git** → JSON một dòng mỗi bản ghi, sắp theo id: conflict hiếm và dễ giải
  quyết; `apply_edits` kiểm `old` để không ghi đè thay đổi từ ngoài.
- **CSV DataTable của UE kén định dạng** → test với struct sinh ra và một fixture thật do người dùng import.
