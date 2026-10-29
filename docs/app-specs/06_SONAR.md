# Sonar — Playtest heatmaps & level analytics

> **Ưu tiên**: 6 · **Dùng cho**: level design 3D/2D, playtest · **MVP**: hết P5 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Tạo app**:
> `npm run new-app -- "Sonar" --tagline "Playtest heatmaps & level analytics" --category "Playtest" --spec docs/app-specs/06_SONAR.md`

## 1. Mục tiêu

Gồm hai phần:
- **SDK logger** nhỏ cho Unity, Godot và Unreal, ghi sự kiện playtest ra file NDJSON;
- **app Sonar**, đọc các file đó và vẽ lên ảnh top-down của màn chơi: heatmap (chết, trúng đòn, nhặt đồ),
  đường đi của người chơi, điểm bị kẹt, funnel checkpoint, so sánh hai build.

Không cần server: playtester gửi file, hoặc dùng thư mục đồng bộ.

### Ngoài phạm vi v1
- Server thu thập online, dashboard web.
- Replay 3D trong engine.
- Phân tích thống kê nâng cao (A/B test có ý nghĩa thống kê).

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Dev thêm `SonarLogger` vào game Unity (1 prefab), gọi `Sonar.Event("death", pos)` | Mỗi lần chơi tạo `sonar/<session>.ndjson` |
| U2 | Mở Sonar, trỏ vào thư mục chứa 40 session | Danh sách session (build, level, thời lượng), lỗi format nếu có |
| U3 | Level `Forest_01`: nạp ảnh top-down có sidecar `.sonar-map.json` (SDK chụp) | Tự căn chỉnh, không cần thao tác |
| U4 | Bật lớp heatmap `death`, lọc build `0.9.2` | Heatmap trên ảnh, 3 điểm nóng rõ ràng |
| U5 | Bật lớp Paths + Stuck | Đường đi của 40 người, 5 vị trí kẹt (> 8 giây không di chuyển) |
| U6 | Funnel `cp_1 → cp_2 → cp_3 → boss` | 100% → 85% → 40% → 32%, kèm thời gian trung vị mỗi chặng |
| U7 | So sánh build 0.9.1 và 0.9.2 | Heatmap chênh lệch (xanh: giảm, đỏ: tăng) |
| U8 | Export PNG và báo cáo HTML | Đem vào buổi review level |
| U9 | Watch thư mục Drive chung | Session mới tự xuất hiện |

## 3. Format log v1 (hợp đồng giữa SDK và app, ghi y nguyên vào `docs/FORMATS.md`)

- File: `<sessionId>.ndjson`, UTF-8, mỗi dòng một JSON, ghi kiểu append và flush định kỳ (chịu được crash: dòng
  cuối hỏng thì bỏ qua).
- Dòng 1 là header:
  ```json
  {"type":"session","v":1,"session":"9b2f…","build":"0.9.2","engine":"unity","engineVersion":"6000.0.23f1",
   "startedAt":"2026-10-29T08:00:00Z","units":"m","up":"y","player":"anon-3f2a","platform":"Windows"}
  ```
  - `units`: `m` (Unity, Godot) hoặc `cm` (Unreal).
  - `up`: `y` (Unity, Godot) hoặc `z` (Unreal).
- Các dòng sau:
  ```json
  {"t":12.345,"e":"level","d":{"name":"Forest_01"}}
  {"t":12.900,"e":"pos","p":[10.2,1.0,-3.4]}
  {"t":30.120,"e":"death","p":[44.0,0.0,12.5],"d":{"cause":"fall"}}
  {"t":31.000,"e":"checkpoint","p":[45,0,13],"d":{"id":"cp_2"}}
  {"t":95.000,"e":"pause","d":{"on":true}}
  {"t":610.000,"e":"end","d":{"reason":"quit"}}
  ```
  - `t`: giây kể từ đầu session (thời gian chơi thật, tính cả lúc pause).
  - `e`: tên sự kiện (chữ thường, `snake_case`).
  - `p`: vị trí world `[x,y,z]` theo `units`/`up` của header (tùy chọn).
  - `d`: payload tự do (object).
- Sự kiện có nghĩa đặc biệt:

  | Sự kiện | Ý nghĩa |
  |---|---|
  | `level` | đổi màn; các sự kiện sau thuộc màn đó |
  | `pos` | mẫu vị trí định kỳ (SDK tự gửi, mặc định 0.5 giây) |
  | `pause` | `{on:bool}`, loại khỏi phát hiện kẹt |
  | `checkpoint` | `{id}` |
  | `end` | kết thúc session |

- Chuẩn hóa trong app: `cm` → `m` (÷100); `up = z` → mặt phẳng ngang là (x, y) và độ cao là z; `up = y` → mặt
  phẳng ngang là (x, z) và độ cao là y.

### 3.1 Sidecar map `<level>.sonar-map.json` (SDK chụp, hoặc người dùng căn tay)

```json
{ "format": "sonar.map", "version": 1, "level": "Forest_01", "image": "Forest_01.png",
  "imageSize": [4096, 4096],
  "world": { "min": [-200.0, -200.0], "max": [200.0, 200.0] },
  "plane": "xz", "flipY": true, "heightRange": [-50, 120] }
```
`world.min`/`max` là biên ngang của vùng ảnh chụp (theo mặt phẳng `plane`). Khi căn tay bằng 2 điểm, app
tính `min`/`max` và có tùy chọn xoay (`rotationDeg`).

## 4. SDK (thư mục `sdk/` trong repo Sonar)

| Engine | File | API |
|---|---|---|
| Unity (C#, 2021.3+) | `sdk/unity/Sonar/SonarLogger.cs`, `SonarMapCapture.cs`, `Sonar.asmdef`, `package.json` (cài bằng Git URL của UPM) | `Sonar.Event(string name, Vector3? pos = null, object data = null)`, `Sonar.Level(string name)`, `SonarLogger` (MonoBehaviour, `DontDestroyOnLoad`, có `trackTarget` để tự gửi `pos`), file ở `Application.persistentDataPath/sonar/` |
| Godot 4 (GDScript) | `sdk/godot/addons/sonar/sonar.gd` (autoload), `plugin.cfg`, `map_capture.gd` | `Sonar.event("death", global_position, {"cause": "fall"})`, file ở `user://sonar/` |
| Unreal 5 (C++) | `sdk/unreal/Sonar/` (plugin: `Sonar.uplugin`, `USonarSubsystem : UGameInstanceSubsystem`, `USonarMapCaptureComponent`) | `UFUNCTION(BlueprintCallable) LogEvent(FName Name, FVector Location, const TMap<FString,FString>& Data)`, file ở `Saved/Sonar/` |

Yêu cầu chung cho SDK:
- Ghi bằng luồng nền hoặc buffer, flush mỗi 2 giây và khi thoát.
- Không làm rơi frame: không I/O trên main thread mỗi sự kiện.
- `sessionId` là UUID v4; `player` lấy từ cấu hình hoặc hash ẩn danh, **không thu thông tin cá nhân**.
- Tắt được bằng một cờ (`enabled`) và bằng tham số dòng lệnh `-nosonar`.
- **Map capture**:
  - đặt camera orthographic nhìn thẳng xuống, khung bao lấy bounds của level (do người dùng chọn hoặc
    tính từ renderer/collider);
  - render ra PNG 4096²;
  - ghi sidecar §3.1 với `world.min/max` đúng bằng biên camera.
  - Unity: menu Editor `Tools/Sonar/Capture Map`. Godot: nút trong dock. Unreal: Editor Utility hoặc
    `SceneCapture2D` có `OrthoWidth`.
- Mỗi SDK có README ngắn và một scene/level mẫu.

**Giới hạn của agent**: agent không chạy được Unity, Godot hay Unreal. Viết SDK cho cẩn thận, compile được
(với Unreal: kiểm tra cú pháp bằng đọc lại kỹ), kèm **checklist kiểm thử tay** cho người dùng. Format thì
kiểm bằng **validator** của app (§6).

## 5. Phân tích (Rust core)

| Phân tích | Định nghĩa |
|---|---|
| Heatmap | Lưới theo pixel ảnh, chia tỉ lệ (mặc định 512² cho ảnh 4096²). Mỗi sự kiện cộng một kernel Gaussian bán kính `r` (mét, quy ra ô). Tùy chọn **chuẩn hóa theo session**: mỗi session đóng góp tối đa 1 tại một ô, để một người chơi không áp đảo. Trả `Float32Array` cùng `max` |
| Paths | Mỗi session: polyline từ `pos` theo thời gian, bỏ bước nhảy > `teleportM` (mặc định 20 m) |
| Stuck | Cửa sổ trượt: dịch chuyển < `radiusM` (2 m) trong ≥ `minSec` (8 s), không trong `pause`. Gộp các điểm kẹt gần nhau (DBSCAN đơn giản, eps 3 m) |
| Funnel | Danh sách checkpoint có thứ tự: % session đạt mỗi bước (đã đạt bước trước), thời gian trung vị giữa các bước |
| Diff | `normalize(A) − normalize(B)` theo cùng lưới, thang màu phân kỳ |
| Height filter | chỉ lấy sự kiện có độ cao trong `[hMin, hMax]` (map nhiều tầng) |

Hiệu năng mục tiêu: 1 triệu dòng sự kiện, parse dưới 2 giây (song song theo file), tính heatmap dưới 200 ms.

## 6. Kiến trúc

### 6.1 Rust core
`format/{parse,validate}.rs` (parse streaming, lỗi theo dòng), `dataset.rs` (bảng sự kiện dạng cột: `session_idx`,
`t`, `e_idx`, `x`, `y`, `h`; index theo level/build), `map.rs` (sidecar, căn chỉnh 2 điểm, world ↔ pixel), `heat.rs`,
`paths.rs`, `stuck.rs`, `funnel.rs`, `report_html.rs`, `project.rs`.

Crate: `serde_json`, `rayon`, `uuid` (validator), `image` (xuất PNG composite).

### 6.2 Project `*.sonar.json`
```jsonc
{ "format": "sonar.project", "version": 1,
  "sessions": ["playtests/"], "maps": ["maps/"],
  "layers": [ { "kind": "heat", "event": "death", "radiusM": 3, "perSession": true, "color": "inferno" },
              { "kind": "paths", "maxSessions": 50 }, { "kind": "stuck", "radiusM": 2, "minSec": 8 } ],
  "funnels": [ { "name": "Forest main path", "level": "Forest_01", "steps": ["cp_1","cp_2","cp_3","boss_start"] } ],
  "filters": { "builds": ["0.9.2"], "dateFrom": null, "dateTo": null } }
```

### 6.3 Commands

| Command | Mô tả |
|---|---|
| `load_dataset(project)` → `DatasetSummary` (session, level, build, event type kèm số lượng, lỗi parse) | job, `sonar://progress` |
| `validate_sessions(paths[])` → `ValidationReport` | |
| `list_maps(project)` / `save_map(map)` / `calibrate(points[2] {pixel, world})` → `MapCalibration` | |
| `heat(level, layer, filters, gridSize)` → raw `Float32Array` + `{ w, h, max }` | |
| `paths(level, filters, maxSessions)` → `Polyline[]` (tọa độ pixel ảnh, đã giản lược Douglas–Peucker) | |
| `stuck(level, filters, opts)` → `StuckSpot[]` | |
| `funnel(funnelDef, filters)` → `FunnelReport` | |
| `session_timeline(sessionId)` → sự kiện của một session | |
| `export_png(level, layers, out)` / `export_html(project, out)` | |
| `watch_start({ action: { kind: "ingest", project } })` | |

### 6.4 UI

| Hotkey | Module | Nội dung |
|---|---|---|
| 1 | **Sessions** | bảng session (build, level, thời lượng, số sự kiện, lỗi), lọc, chọn |
| 2 | **Map** | canvas: ảnh map + lớp (heat bằng WebGL texture + LUT màu; paths/stuck bằng canvas 2D), danh sách lớp bật/tắt và opacity, lọc build/thời gian/độ cao, hover hiện giá trị ô và tọa độ world |
| 3 | **Replay** | chọn một session, thanh thời gian, chấm người chơi chạy trên map, sự kiện hiện thành biểu tượng |
| 4 | **Funnels** | định nghĩa (chọn checkpoint id từ dữ liệu), biểu đồ cột, bảng thời gian |
| 5 | **Compare** | chọn hai bộ lọc (build A, build B), xem diff heatmap hoặc hai ảnh cạnh nhau |
| 6 | **Calibrate** | khi không có sidecar: chọn ảnh, click 2 điểm trên ảnh, nhập tọa độ world (hoặc chọn từ một sự kiện đã biết) |

## 7. CLI

```
sonar validate <folder|file.ndjson> [--report r.json]            # mã 1 khi có dòng lỗi
sonar render <project> --level Forest_01 --layer death [--build 0.9.2] --out deaths.png
sonar report <project> --out report.html [--level ...]
sonar funnel <project> --name "Forest main path" [--report r.json]
```

## 8. Watch
Action `ingest`: theo dõi các thư mục `sessions` (đệ quy). File `.ndjson` mới hoặc đổi (đã settle) → parse
**chỉ file đó** → gộp vào dataset → phát `watch://status` → UI làm mới các lớp.

## 9. Các phase

### P0 — Scaffold + format
1. Tạo app; 6 module rỗng.
2. Viết `docs/FORMATS.md` (§3, §3.1) **trước khi viết code**.
3. `scripts/gen-sessions.mjs`: mô phỏng 50 người chơi trên map 400×400 m: đi theo 3 tuyến cố định có nhiễu,
   chết ở 3 điểm nóng, 5 người kẹt ở 1 chỗ, checkpoint `cp_1..cp_3`, `boss_start`, 2 build. Sinh ảnh map giả
   4096² (lưới và các "đường") cùng sidecar.
**Xong khi**: dữ liệu mẫu sinh được, `npm run check` xanh.

### P1 — Parse + validate + dataset
Parse streaming, lỗi theo dòng (dòng cuối hỏng → warn), chuẩn hóa đơn vị và trục; validator + CLI `validate`.
Test: file Unreal (cm, z-up) và Unity (m, y-up) cùng vị trí → cùng tọa độ chuẩn hóa.
**Xong khi**: luồng U2 từ CLI; 1 triệu dòng parse dưới 2 giây (release).

### P2 — Map + heatmap + render PNG
`map.rs` (sidecar, căn 2 điểm, xoay), `heat.rs` (kernel Gaussian, per-session), `export_png`, CLI `render`.
Test: một sự kiện ở world (0,0) với map [-200,200] → đỉnh heat ở giữa ảnh; `flipY` đúng.
**Xong khi**: luồng U3, U4 từ CLI.

### P3 — UI Sessions + Map + mock
Canvas map với WebGL heat layer, lọc, hover. Mock dùng dữ liệu `gen-sessions` (nhúng phiên bản nhỏ).
**Xong khi**: U2–U4 trên app thật.

### P4 — SDK Unity + Godot
1. Viết SDK theo §4, kèm map capture.
2. Checklist kiểm thử tay cho người dùng: thêm vào project trống, chơi 1 phút, mở Sonar.
3. **Hỏi Q1** (engine chính) để ưu tiên.
**Xong khi**: người dùng xác nhận ít nhất một engine tạo file hợp lệ (validator xanh) và map tự căn đúng.

### P5 — Paths + stuck + funnel (MVP, v0.1.0)
`paths.rs` (Douglas–Peucker), `stuck.rs`, `funnel.rs`, các module UI tương ứng, CLI `funnel`. Phát hành 0.1.0.
**Xong khi**: U5, U6 trên dữ liệu mẫu cho đúng 5 điểm kẹt và đúng tỉ lệ funnel đã mô phỏng.

### P6 — SDK Unreal
Plugin C++ theo §4, kèm checklist kiểm tra tay. **Xong khi**: người dùng xác nhận (nếu dùng Unreal).

### P7 — Replay + Compare + báo cáo + watch
**Xong khi**: U7, U8, U9; HTML mở offline.

### P8 — Hoàn thiện, v0.2.0
User guide (gồm hướng dẫn tích hợp SDK từng engine), phát hành.

## 10. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Engine chính để làm SDK trước (Unity / Godot / Unreal)? | P4 |
| Q2 | Playtester gửi file bằng cách nào (thư mục Drive chung, Discord, tay)? | P7 |
| Q3 | Game 2D hay 3D, map nhiều tầng không? | P2 |
| Q4 | Có sự kiện đặc thù nào cần lớp riêng (ví dụ "dùng skill", "mua đồ")? | P5 |

## 11. Rủi ro
- **Ảnh map và tọa độ lệch nhau** → map capture trong SDK ghi bounds chính xác; nếu căn tay thì có công cụ
  kiểm tra (đặt một sự kiện test tại điểm đã biết).
- **Log quá dày làm chậm game** → mặc định `pos` 2 Hz, buffer, I/O nền; ghi mức ảnh hưởng đo được vào README SDK.
- **Quyền riêng tư** → không thu IP, tên máy hay tên người dùng hệ điều hành; README nhắc dev phải thông báo
  cho playtester.
