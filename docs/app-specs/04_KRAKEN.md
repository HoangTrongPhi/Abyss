# Kraken — Build size & frame-time analyzer

> **Ưu tiên**: 4 · **Dùng cho**: mọi engine (Unity, Unreal, Godot, engine riêng) · **MVP**: hết P4 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Tạo app**:
> `npm run new-app -- "Kraken" --tagline "Build size & frame-time analyzer" --category "Build & Performance" --spec docs/app-specs/04_KRAKEN.md`

## 1. Mục tiêu

Kraken trả lời hai câu hỏi lặp lại mỗi lần ra bản build:
1. **"Vì sao build này nặng thêm 200 MB, và cái gì không nên có trong đó?"**
2. **"Bản này có giật hơn bản trước không, và giật ở đâu?"**

Kết quả xem được trên UI (treemap, diff, biểu đồ frame time), xuất được báo cáo HTML, và có lệnh CLI
trả mã thoát cho CI khi vượt ngân sách.

### Ngoài phạm vi v1
- Giải nén nội dung bên trong UnityFS bundle / `data.unity3d`. Chỉ hiện dạng khối mờ (opaque), kèm gợi ý
  dùng Editor.log.
- Đọc `.utrace` (Unreal Insights) và file `.data` của Unity Profiler.
- Phân tích GPU capture (RenderDoc, PIX).

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Kéo thư mục build Windows vào | Treemap theo thư mục/loại, top 50 file, rule: `.pdb` bị ship (180 MB), 3 cặp file trùng nội dung |
| U2 | Kéo `game.apk` vào | Kích thước nén/không nén, theo ABI (`arm64-v8a`, `armeabi-v7a`, `x86_64`), `assets/`, `res/`, dex |
| U3 | Kéo `Editor.log` của Unity sau khi build | Bảng category (Textures, Meshes, Sounds…) + danh sách asset theo dung lượng |
| U4 | Chọn snapshot `v1.3.0` và `v1.4.0` → Diff | +212 MB: Textures +180 MB (5 file lớn nhất), Audio +30 MB; file mới, file mất |
| U5 | Kéo `presentmon_v1.4.csv` và `presentmon_v1.3.csv` | Biểu đồ chồng, p50/p95/p99, 1% low, 14 hitch > 33 ms kèm thời điểm |
| U6 | Kéo CSV của Unreal CSV Profiler | Frame/Game/Render/GPU thread, event marker trên biểu đồ |
| U7 | CI: `kraken check Build/ --budget kraken.budget.json --baseline last.kraken-snap.json` | Mã thoát 1 khi vượt ngân sách |
| U8 | Watch thư mục `Builds/` | Build mới ổn định → tự snapshot, diff với bản trước, thông báo |

## 3. Mô hình dữ liệu

### 3.1 Snapshot `*.kraken-snap.json` (`format: "kraken.snapshot"`, `version: 1`)

```jsonc
{ "format": "kraken.snapshot", "version": 1,
  "label": "v1.4.0", "createdAt": "2026-10-29T10:00:00Z",
  "source": { "kind": "folder" | "zip" | "unityEditorLog" | "unrealPak", "path": "D:/Builds/1.4.0" },
  "totals": { "bytes": 2147483648, "compressedBytes": null, "files": 1234 },
  "entries": [ { "path": "Game_Data/sharedassets0.assets", "bytes": 123, "compressedBytes": null,
                 "category": "unityData", "hash": "xxh3:9f…" } ],
  "categories": { "unityData": 123 },
  "unityReport": null }            // filled for unityEditorLog: categories + assets list from the log
```

- `hash` chỉ tính khi bật (mặc định bật cho file < 2 GB). Dùng xxh3 streaming.
- Phân loại theo bảng đuôi file và đường dẫn trong `core/categorize.rs`, có thể ghi đè bằng
  `kraken.categories.json`:
  - `textures` (png tga psd dds ktx ktx2 exr hdr), `audio` (wav ogg mp3 bank wem), `video`, `meshes`
    (fbx obj gltf glb), `nativeLibs` (dll so dylib), `managed` (`Managed/*.dll`, dex), `debugSymbols`
    (pdb, `*.sym`, `*.debug`), `unityData`, `unrealPak` (pak utoc ucas), `godotPck`, `config`, `logs`, `other`.

### 3.2 Ngân sách `kraken.budget.json` (`format: "kraken.budget"`)

```jsonc
{ "format": "kraken.budget", "version": 1,
  "maxTotal": "1.5 GB",
  "maxGrowthPercent": 5,                     // so với --baseline
  "maxGrowth": "100 MB",
  "categories": { "textures": "600 MB", "audio": "200 MB" },
  "forbid": ["**/*.pdb", "**/*.psd", "**/*.fbx", "**/*.log", "**/*_BurstDebugInformation_DoNotShip/**"],
  "maxFile": "500 MB",
  "apk": { "allowedAbis": ["arm64-v8a"] } }
```
Đọc kích thước kiểu `"1.5 GB"`, `"600 MB"` (cơ số 1024, ghi rõ trong FORMATS.md).

### 3.3 Capture frame time (trong bộ nhớ)
`Capture { label, source, frames: { tMs: Vec<f64>, frameMs: Vec<f32>, series: Map<name, Vec<f32>> }, events: [{ tMs, name }], meta: Map }`

## 4. Đọc đầu vào

| Nguồn | Cách đọc | Ghi chú |
|---|---|---|
| Thư mục | `walkdir` + `rayon`, hash song song | Bỏ qua symlink vòng |
| ZIP / APK / AAB / IPA / XAPK | crate `zip`: central directory → `size`, `compressed_size` mỗi entry | AAB: module `base/…`; APK: `lib/<abi>/` cho ABI |
| Unity `Editor.log` | tìm khối **cuối cùng** bắt đầu bằng dòng `Build Report`; đọc các dòng category (`Textures  12.3 mb  15.2%`), `Complete build size`, rồi khối `Used Assets and files from the Resources folder, sorted by uncompressed size:` (mỗi dòng ` 4.0 mb\t 2.3% Assets/…`) | Regex chịu được khác biệt khoảng trắng và đơn vị `kb`/`mb`/`gb`. Fixture: Editor.log thật của người dùng (Q1) |
| Unreal pak | chạy `UnrealPak.exe <file.pak> -List` (đường dẫn UnrealPak trong settings), parse dòng chứa đường dẫn trong ngoặc kép và `size: N` | **Nghiên cứu R1** cho IoStore (`.utoc/.ucas`, mặc định ở UE5): xem §11 |
| Godot `.pck` | v1: chỉ coi là một khối, cộng tổng | v2 có thể parse header pck |

**Capture frame time**:

| Nguồn | Nhận diện | Cột |
|---|---|---|
| PresentMon 1.x CSV | header có `MsBetweenPresents` | `TimeInSeconds` → t; `MsBetweenPresents` → frame; thêm `MsUntilRenderComplete`, `MsUntilDisplayed` nếu có; lọc theo `Application` (UI chọn process) |
| PresentMon 2.x CSV | header có `FrameTime` (và thường có `CPUStartTime`, `CPUBusy`, `GPUBusy`) | `FrameTime` → frame; `CPUStartTime` → t (ms hoặc s, đoán theo độ lớn); `CPUBusy`, `GPUBusy`, `GPUTime`, `DisplayLatency` vào series |
| Unreal CSV Profiler | file trong `Saved/Profiling/CSV/`, có dòng metadata ở cuối bắt đầu `[HasHeaderRowAtEnd]` | `FrameTime`, `GameThreadTime`, `RenderThreadTime`, `GPUTime`; cột `EVENTS` → markers; metadata (`[platform]`, `[config]`…) vào `meta` |
| CSV chung | người dùng chọn cột frame time (ms hoặc s) và cột thời gian (tùy chọn) | Lưu mapping trong project |

Fixture PresentMon 1.x, 2.x và UE CSV: **lấy capture thật** (Q2). Trước khi có thì dùng file viết tay đúng
header như mô tả, và ghi rõ trong `tests/fixtures/README.md` rằng đó là file giả lập.

## 5. Phân tích

### 5.1 Build
- **Treemap**: thuật toán squarified, tính trong TS từ cây thư mục (Rust trả cây đã gộp: mỗi nút
  `{ name, bytes, children[] }`, gộp các file < 0.1% vào nút "(N small files)").
- **Top N**: theo `bytes` hoặc `compressedBytes`.
- **Trùng nội dung**: nhóm theo hash, nhóm ≥ 2 file, sắp theo dung lượng lãng phí `(n−1)×bytes`.
- **Rule**:

  | Code | Mức | Điều kiện |
  |---|---|---|
  | `forbidden-file` | error | khớp `forbid` |
  | `debug-symbols-shipped` | warn | `.pdb` hoặc thư mục `*DoNotShip*` |
  | `source-asset-shipped` | warn | psd, fbx, blend, `wav` > 10 MB trong build |
  | `duplicate-content` | info | nhóm trùng > 1 MB |
  | `large-file` | warn | > `maxFile` |
  | `apk-extra-abi` | warn | ABI ngoài `allowedAbis` |
  | `budget-total` | error | tổng vượt |
  | `budget-category` | error | category vượt |
  | `budget-growth` | error | tăng vượt (so với baseline) |

### 5.2 Diff (`diff(a, b) -> DiffReport`)
- Ghép theo `path` (chuẩn hóa `/`, không phân biệt hoa thường trên Windows). Nếu bật hash: file đổi tên
  nhưng cùng hash thì tính là `moved`.
- Kết quả: `added[]`, `removed[]`, `grown[]`, `shrunk[]`, `moved[]`, delta theo category, delta tổng.
  Sắp theo |delta| giảm dần.
- **"Explain growth"**: 10 dòng đóng góp lớn nhất, kèm % trên tổng delta.

### 5.3 Frame time
Bỏ N giây đầu (mặc định 5 s, chỉnh được) vì giai đoạn loading. Thống kê:

| Chỉ số | Định nghĩa (ghi y nguyên vào FORMATS.md) |
|---|---|
| `avgFps` | `1000 / mean(frameMs)` |
| `p50/p95/p99` | percentile của frameMs (nội suy tuyến tính) |
| `low1Fps` | `1000 / mean(1% frame chậm nhất)` |
| `low01Fps` | tương tự với 0.1% |
| `hitches` | frame có `frameMs > max(hitchMs, hitchFactor × median 31 frame quanh nó)`, mặc định `hitchMs = 33.3`, `hitchFactor = 2.0`; frame liền nhau gộp thành một hitch |
| `hitchesPerMin` | số hitch / phút |
| `stdDev`, `histogram` | bucket 1 ms tới 100 ms, rồi `>100` |

- **So sánh**: bảng delta và biểu đồ chồng (căn theo t = 0 hoặc theo marker chung, nếu cả hai có cùng tên
  event).
- **Ngân sách frame**: `--p95-max`, `--hitches-per-min-max` cho CLI.

## 6. Kiến trúc

### 6.1 Rust core
`sources/{folder,zip,unity_log,unreal_pak}.rs`, `categorize.rs`, `snapshot.rs`, `diff.rs`, `rules.rs`,
`budget.rs`, `size.rs` (parse/format "1.5 GB"), `frames/{presentmon,unreal_csv,generic_csv}.rs`,
`frames/stats.rs`, `report_html.rs` (một file HTML tự chứa: CSS inline, dữ liệu JSON nhúng, biểu đồ SVG
dựng sẵn, không cần JS ngoài).

Crate: `walkdir`, `rayon`, `zip`, `xxhash-rust`, `csv`, `regex`, `globset`.

### 6.2 Commands

| Command | Mô tả |
|---|---|
| `snapshot(path, { hash, label })` → `Snapshot` | job `snapshot`, event `kraken://progress` |
| `save_snapshot(snap, path)` / `load_snapshot(path)` | |
| `tree(snapshotRef, { groupSmall })` → `TreeNode` | |
| `diff(aRef, bRef)` → `DiffReport` | |
| `check(snapshotRef, budget, baselineRef?)` → `CheckReport` | |
| `load_capture(path, mapping?)` → `CaptureSummary` + series dạng raw bytes (`Float32Array`) | |
| `capture_stats(captureId, { skipSec, hitchMs, hitchFactor })` → `FrameStats` | |
| `compare_captures(aId, bId)` → `CompareReport` | |
| `export_html(kind, refs, out)` | |
| `get_settings` / `set_settings` | đường dẫn UnrealPak |
| `watch_start({ action: { kind: "autoSnapshot", buildsDir, budget? } })` | |

`snapshotRef` = id snapshot đã nạp trong state (`Mutex<HashMap<id, Snapshot>>`) hoặc đường dẫn file
snapshot. Không gửi lại cả snapshot lớn qua IPC.

### 6.3 UI

| Hotkey | Module | Nội dung |
|---|---|---|
| 1 | **Build** | thả nguồn, treemap (canvas, click để đi sâu, breadcrumb), bảng top N, tab Categories, Duplicates, Rules; nút Save snapshot |
| 2 | **Diff** | chọn 2 snapshot (đã nạp hoặc file), tổng delta lớn, "Explain growth", bảng có lọc theo loại thay đổi |
| 3 | **Budget** | sửa `kraken.budget.json` bằng form, chạy check trên snapshot đang mở |
| 4 | **Frames** | thả nhiều capture, biểu đồ `uplot` (zoom, pan, marker hitch, event), bảng thống kê cạnh nhau, histogram |
| 5 | **History** | danh sách snapshot trong thư mục `Builds/.kraken/` (do watch tạo), biểu đồ kích thước theo phiên bản |

## 7. CLI

```
kraken snapshot <folder|apk|aab|ipa|zip|Editor.log|file.pak> [--label v1.4.0] [--no-hash] --out snap.kraken-snap.json
kraken diff <old> <new> [--report r.json] [--html diff.html]          # old/new: snapshot file or raw source
kraken check <source|snapshot> --budget kraken.budget.json [--baseline old] [--report r.json] [--html r.html]
kraken frames <capture.csv> [--baseline other.csv] [--skip 5] [--hitch-ms 33.3] [--p95-max 16.7] [--hitches-per-min-max 2] [--report r.json] [--html r.html]
```
Mã thoát 1 khi vi phạm ngân sách, hoặc vượt `--p95-max` / `--hitches-per-min-max`.

## 8. Watch

- Action `autoSnapshot`: theo dõi `buildsDir` (không đệ quy sâu: chỉ phát hiện thư mục con hoặc file
  zip/apk mới).
- "Build ổn định": tổng kích thước thư mục không đổi trong 10 giây.
- Ổn định → snapshot → lưu vào `buildsDir/.kraken/<label>.kraken-snap.json` (label = tên thư mục) → diff với
  snapshot liền trước → log và thông báo Windows (nếu người dùng bật trong Settings) → nếu có budget thì
  chạy check.

## 9. Các phase

### P0 — Scaffold
Tạo app; 5 module rỗng; crate. Sinh dữ liệu mẫu bằng test `#[ignore]`: hai thư mục build giả (v1, v2 có
thêm `.pdb`, texture lớn hơn, một file trùng), một zip giả lập APK (`lib/arm64-v8a/libgame.so`,
`lib/x86_64/…`, `assets/…`), một capture CSV kiểu PresentMon 1.x có 3 hitch.
**Xong khi**: `npm run check` xanh.

### P1 — Snapshot thư mục + zip + categorize + rules
Test: tổng byte đúng; APK tách đúng ABI; rule bắt `.pdb`; trùng nội dung đúng nhóm.
**Xong khi**: luồng U1, U2 từ CLI `snapshot` + `check`.

### P2 — Diff + budget
Test: added/removed/grown/moved đúng trên hai build mẫu; parse kích thước "1.5 GB".
**Xong khi**: luồng U4, U7 từ CLI.

### P3 — Unity Editor.log (+ Unreal pak cơ bản)
1. **Hỏi Q1** lấy Editor.log thật (cắt lấy phần Build Report, xóa thông tin nhạy cảm) làm fixture.
2. Parser + test.
3. Unreal: `UnrealPak -List` với `.pak` (**R1** cho IoStore).
**Xong khi**: luồng U3 có fixture thật.

### P4 — UI Build + Diff + mock (MVP, v0.1.0)
1. Treemap canvas (squarified, màu theo category, nhãn khi ô đủ lớn), bảng, rule, Save snapshot.
2. Diff UI, Budget form.
3. Mock: hai snapshot giả, khoảng 3000 entry, sinh bằng code.
4. Phát hành 0.1.0.
**Xong khi**: U1, U2, U4, U7 trên app thật; treemap 50.000 file vẫn mượt (gộp file nhỏ).

### P5 — Frame time
1. Parser PresentMon 1.x/2.x, UE CSV, CSV chung (**hỏi Q2** lấy capture thật).
2. `stats.rs`, kèm test trên dữ liệu tổng hợp: 1000 frame 16.6 ms cộng 5 frame 50 ms → 5 hitch; p99 đúng.
3. Module Frames với `uplot` (lazy), so sánh, histogram.
4. CLI `frames`.
**Xong khi**: U5, U6.

### P6 — Báo cáo HTML + watch + History
1. `report_html.rs` cho diff, check và frames. Mở được offline và gửi qua chat.
2. Watch `autoSnapshot` + module History.
**Xong khi**: U8; HTML mở được trong trình duyệt mà không có request mạng nào.

### P7 — Hoàn thiện, v0.2.0
User guide; ví dụ GitHub Actions dùng `kraken check` trong README.

## 10. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Gửi Editor.log có Build Report (Unity bản nào)? | P3 |
| Q2 | Gửi capture PresentMon (bản 1.x hay 2.x) và/hoặc CSV của UE CSV Profiler? | P5 |
| Q3 | Dùng Unreal không? Đường dẫn engine để lấy UnrealPak? | P3 |
| Q4 | Nền tảng đích chính (PC, Android, iOS, console)? Để đặt ngân sách mặc định | P2 |

## 11. Nghiên cứu cần làm (agent làm và ghi kết quả vào PROGRESS.md)

- **R1 — Liệt kê IoStore của UE5**: thử trên máy người dùng `UnrealPak.exe <global.utoc> -List` và các biến
  thể; tìm trong tài liệu Epic lệnh liệt kê container (`.utoc`). Nếu không có cách ổn định, phương án dự
  phòng: đọc kích thước file `.ucas`/`.utoc` theo chunk (chỉ tổng), và gợi ý dùng **Asset Audit / Size Map**
  trong editor. Ghi rõ kết luận; không đoán.
- **R2 — Cột PresentMon 2.x**: xác nhận tên cột và đơn vị của `CPUStartTime` bằng capture thật (Q2).

## 12. Rủi ro
- **Định dạng log thay đổi giữa các bản engine** → parser khoan dung, lỗi parse thành issue `parse-partial`,
  kèm số dòng.
- **Build rất lớn (100.000+ file, 50 GB)** → hash streaming, song song, có thể tắt hash; cây gộp file nhỏ
  trước khi gửi qua IPC.
