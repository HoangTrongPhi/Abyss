# Khung chung cho mọi app của bộ Abyss

> **Áp dụng cho**: Coral, Conch, Siren, Kraken, Lighthouse, Sonar, Nautilus và mọi app Tauri tương lai
> của bộ. **Phần B** (cuối file) áp dụng cho add-on Blender (Trident, Compass).
> **Chuẩn tham chiếu**: Poseidon — `P:\Phineas_LIB\Gogo_Gadgets\Project_P`. Spec nói rõ thì theo spec;
> chi tiết nhỏ spec không nói thì làm giống Poseidon.
> **Cập nhật**: 2026-10-29

---

## 0. Quy trình bắt buộc cho agent trong mỗi session

1. Đọc **file spec của app** được giao, rồi đọc **file này**. Spec app không lặp lại những gì ở đây.
2. Nếu app đã được tạo: đọc `<App>/docs/PROGRESS.md` để biết phase đang làm, quyết định đã chốt và
   việc còn dở. Nếu chưa có app: bắt đầu từ Phase 0 của spec.
3. Kiểm tra tiền điều kiện: **template đã được nâng cấp** (file
   `P:\Phineas_LIB\Gogo_Gadgets\Abyss\templates\tauri-app\src-tauri\src\cli.rs` và
   `...\templates\tauri-app\src\dev\mockBackend.ts` tồn tại). Nếu chưa: dừng lại, báo người dùng
   rằng phải làm `00_TEMPLATE_UPGRADE.md` trước.
4. Làm **đúng phase được giao** (hoặc phase kế tiếp trong PROGRESS.md). Không bắt đầu phase sau khi
   checklist "Xong khi" của phase trước chưa đạt hết.
5. Chạy đủ các kiểm tra ở §13 trước khi báo xong.
6. Cập nhật `docs/PROGRESS.md` (mẫu ở §15) và `docs/CHANGELOG.md` nếu có thay đổi người dùng thấy được.
7. **Không** commit, push, tạo repo GitHub hay phát hành khi người dùng chưa cho phép trong session đó.
8. Gặp mục **"Câu hỏi mở"** trong spec mà phase hiện tại cần đến: hỏi người dùng, không tự quyết.
   Ghi câu trả lời vào mục *Decisions* của PROGRESS.md để session sau không hỏi lại.
9. Những thứ người dùng đã từ chối, **không đưa lại**: TechForge trong launcher, "shared Rust engine"
   giữa các app, workspace chung / deep link `gogo://` giữa các app. Mỗi app độc lập.
10. Trả lời người dùng bằng **tiếng Việt**; code, tên file, commit message và UI text bằng **tiếng Anh**.

---

## 1. Stack cố định

| Lớp | Lựa chọn | Ghi chú |
|---|---|---|
| Vỏ app | Tauri 2 | NSIS, `installMode: currentUser`, chỉ Windows x64 |
| Backend | Rust stable (MSVC), edition 2021, `rust-version = "1.82"` | `rayon` cho song song, `serde` cho mọi hợp đồng dữ liệu |
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 | `zustand` cho state, `lucide-react` cho icon |
| UI dùng chung | `@abyss/ui` (link `file:` vào `Abyss/packages/abyss-ui`) | Theme Studio Dark, component chung |
| CLI | `clap` 4 (derive), cùng file exe với app | §8 |
| Theo dõi thư mục | `notify` + `notify-debouncer-full` | §10 |
| Cập nhật | `tauri-plugin-updater` + `latest.json` trên GitHub Releases | Abyss quản lý khi app được Abyss mở (`ABYSS=1`) |
| Biểu đồ (khi cần) | `uplot` cho chuỗi thời gian dài; SVG/canvas tự vẽ cho biểu đồ nhỏ | Tải lazy |

Thêm dependency mới: dùng `cargo add` / `npm install` để lấy bản ổn định mới nhất. Không ghim phiên
bản trong spec. Dependency nặng (> 1 MB vào binary) phải ghi lý do trong PROGRESS.md.

---

## 2. Tạo app, vị trí và tên

```powershell
# trong P:\Phineas_LIB\Gogo_Gadgets\Abyss
npm run new-app -- "Coral" --tagline "Sprite atlas & 2D animation toolkit" --category "2D Pipeline" --spec docs/app-specs/01_CORAL.md
```

`--spec` do `00_TEMPLATE_UPGRADE.md` thêm vào: nó chép file spec vào `<App>/docs/SPEC.md`.

| Thứ | Giá trị (ví dụ Coral) |
|---|---|
| Thư mục | `P:\Phineas_LIB\Gogo_Gadgets\Coral` (cạnh thư mục Abyss) |
| id / Cargo package | `coral` |
| crate lib | `coral_lib` |
| exe | `coral.exe` |
| identifier | `com.phineas.coral` |
| Khóa ký updater | `%USERPROFILE%\.tauri\coral.key` (**phải sao lưu**) |
| Repo | `HoangTrongPhi/Coral` |
| Catalog | `create-app` đặt app vào một slot trống với status `coming_soon` |
| Dev port | `create-app` tự chọn (1440–1538), ghi trong `vite.config.ts` |

---

## 3. Cấu trúc thư mục chuẩn

```
<App>/
├── docs/
│   ├── SPEC.md               bản chép của spec (nguồn sự thật cho app này)
│   ├── PROGRESS.md           tiến độ, quyết định, việc dở (§15) — mọi session cập nhật
│   ├── CHANGELOG.md
│   └── FORMATS.md            mô tả mọi file JSON app đọc/ghi (project, preset, report)
├── sample-assets/            dữ liệu để thử tay; đặt file nhỏ, hoặc sinh bằng script
├── scripts/                  script phụ (sinh dữ liệu mẫu, check-mock.mjs)
├── src/
│   ├── main.tsx              import "./dev/mockBackend" ĐẦU TIÊN
│   ├── App.tsx               rail + header + tab hiện tại + LogDrawer + dialog
│   ├── components/
│   │   ├── layout/           NavigationRail, HeaderBar, AboutDialog wiring, SettingsDialog
│   │   └── tabs/<Module>Tab.tsx
│   ├── dev/mockBackend.ts    backend giả cho ?mock (§9)
│   ├── hooks/                useBackendBridge, useGlobalHotkeys, useWindowDragDrop
│   ├── lib/
│   │   ├── ipc.ts            MỌI invoke() và tên event nằm ở đây
│   │   ├── modules.ts        danh sách module của rail (id, label, icon, hotkey)
│   │   ├── author.ts         chép từ Poseidon (About & contact)
│   │   └── dropRouter.ts
│   ├── stores/               appStore (log, tab, drag), appearance, updateStore, <module>Store
│   └── types/<id>.ts         interface TS phản chiếu struct Rust
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── src/
    │   ├── main.rs           chuyển sang CLI nếu có tham số (§8)
    │   ├── lib.rs            configure() dùng chung cho app thật và ipc_tests
    │   ├── cli.rs
    │   ├── ipc_tests.rs
    │   ├── commands/         mỗi file bọc một engine core; mod.rs chứa contract tests
    │   ├── core/             logic thuần, KHÔNG import tauri
    │   └── utils/            logbus.rs, jobs.rs, watch.rs, paths.rs
    └── tests/fixtures/       file nhỏ cho test; ưu tiên sinh bằng code trong test
```

---

## 4. Các tầng và luồng dữ liệu

```
React tab ──► store (zustand) ──► lib/ipc.ts ──invoke──► commands/*_cmd.rs ──► core/*.rs
    ▲                                   ▲                       │  spawn_blocking   │
    └──────── listen(EVENTS.*) ─────────┴──── emit progress / log / watch ──────────┘
CLI (cli.rs) ─────────────────────────────────────────────────────────────────► core/*.rs
tests ────────────────────────────────────────────────────────────────────────► core/*.rs
```

- **core**: hàm thuần, nhận input và một `RunCtx` (progress + cancel), trả `Result<Report, CoreError>`.
  Không import `tauri`, nhờ vậy CLI và test gọi trực tiếp được.
- **commands**: mỏng. Chạy core trong `tauri::async_runtime::spawn_blocking`, đăng ký job (§5), phát
  event progress, ghi log qua logbus, đổi lỗi thành `String`.
- **UI**: component chỉ gọi store; store chỉ gọi `lib/ipc.ts`. Tên command và event chỉ xuất hiện trong
  `ipc.ts` (và `mockBackend.ts`).
- **Hợp đồng dữ liệu**: struct Rust `#[serde(rename_all = "camelCase")]`, enum gắn tag
  `#[serde(tag = "kind", rename_all = "camelCase")]` (giống `RecipeStep` của Poseidon). Interface TS ở
  `src/types/<id>.ts` phải khớp từng trường. Mỗi struct input có **contract test** trong
  `commands/mod.rs`: deserialize đúng JSON mà store gửi (xem `Project_P/src-tauri/src/commands/mod.rs`).
- **Giá trị mặc định an toàn**: trường bỏ trống phải về giá trị không phá hủy (`dry_run` mặc định
  `false` chỉ khi UI luôn gửi rõ; mọi tùy chọn ghi đè mặc định `false`).

---

## 5. Job: tiến độ, hủy, một job mỗi loại

Template nâng cấp có sẵn `utils/jobs.rs`. Quy ước:

```rust
// core: chữ ký chuẩn của một thao tác dài
pub struct RunCtx<'a> {
    pub progress: &'a (dyn Fn(u64, u64, &str) + Sync), // done, total, message
    pub cancel: &'a std::sync::atomic::AtomicBool,
}
pub fn pack_project(p: &Project, opts: &PackOptions, ctx: &RunCtx) -> Result<PackReport, CoreError>;
```

- Core kiểm tra `ctx.cancel` giữa các đơn vị việc (mỗi file, mỗi frame…). Khi bị hủy, trả về
  **báo cáo một phần** với `cancelled: true`, không trả lỗi.
- Command đăng ký job qua `JobRegistry` (state của Tauri): mỗi `kind` chỉ một job chạy cùng lúc. Job thứ
  hai cùng loại trả lỗi `"<Kind> is already running"`.
- Event progress: `"<module>://progress"` với payload `{ jobId, done, total, message }`. Phát tối đa
  khoảng 20 lần/giây: gộp lại nếu core báo dày hơn.
- Hủy: command chung `cancel_job(jobId) -> bool`.
- Báo cáo nào cũng có `elapsedMs`, `ok`, `cancelled` và danh sách `issues[]` gồm
  `{ severity: "info"|"warn"|"error", code, message, path? }`.
- Mọi lỗi từng file (một file hỏng, một texture không đọc được) được ghi thành `issue`, còn job vẫn
  chạy tiếp. Chỉ lỗi đầu vào toàn cục (thư mục không tồn tại, project hỏng) mới dừng job.

---

## 6. File project / preset

Mỗi thao tác hàng loạt trong UI phải **lưu được thành file JSON**, và CLI chạy **đúng file đó**. Ở
Poseidon, khái niệm này là Recipes.

- Có trường `"format": "<id>.<kind>"` (ví dụ `"coral.project"`) và `"version": 1`. Đọc phiên bản cũ thì
  migrate trong code, không bao giờ từ chối im lặng.
- Đuôi file: `*.<id>.json` (ví dụ `hero.coral.json`), để Explorer và watcher nhận ra.
- **Đường dẫn bên trong là tương đối so với file project**. Như vậy project chuyển máy hoặc nằm trong
  repo game vẫn chạy được. Khi đọc thì resolve, khi ghi thì relativize.
- Ghi JSON thụt 2 dấu cách, thứ tự key ổn định, mảng sắp xếp theo khóa tự nhiên, để `git diff` dễ đọc.
- Trường không biết thì bỏ qua (serde mặc định), trường thiếu thì lấy `#[serde(default)]`.
- Mô tả format trong `docs/FORMATS.md`, kèm một ví dụ đầy đủ.
- UI: `Ctrl+O` mở, `Ctrl+S` lưu, `Ctrl+Shift+S` lưu thành. Danh sách 10 project gần đây lưu trong
  localStorage `<id>.recent`.

---

## 7. An toàn khi ghi file

1. Thao tác nào có ghi file cũng phải có **dry-run**, trả về đúng kế hoạch sẽ ghi (`planned`) mà không
   chạm đĩa.
2. Mặc định ghi vào **thư mục output riêng**. Ghi đè tại chỗ (`--in-place`) phải bật rõ ràng, và trước khi
   ghi phải tạo `.bak` (giống FBX Doctor) hoặc ghi history để undo (giống Renamer của Poseidon,
   `Project_P/src-tauri/src/utils/history.rs`).
3. Ghi nguyên tử: viết ra `<file>.tmp` cùng thư mục rồi `rename`.
4. Không bao giờ xóa file người dùng. Nếu tính năng cần "xóa", chuyển vào Recycle Bin (crate `trash`)
   sau khi người dùng xác nhận.
5. Không ghi vào thư mục cài đặt app. Dữ liệu riêng của app (cache, DB) để ở `app_data_dir()` =
   `%LOCALAPPDATA%\com.phineas.<id>\`, dữ liệu này còn nguyên qua các lần cập nhật.
6. Báo cáo (UI và `--report`) liệt kê từng file đã ghi, hoặc sẽ ghi nếu là dry-run.

---

## 8. CLI: chạy không mở cửa sổ, cho CI

### 8.1 Hợp đồng

- Cùng file exe: `coral.exe pack hero.coral.json --report out.json`.
- `main.rs`:
  ```rust
  #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
  fn main() {
      let args: Vec<String> = std::env::args().collect();
      if coral_lib::cli::wants_cli(&args) {
          std::process::exit(coral_lib::cli::run(&args));
      }
      coral_lib::run()
  }
  ```
- `wants_cli`: tham số đầu tiên là một subcommand đã biết, hoặc `--help` / `-h` / `--version`. Mọi tham
  số khác (ví dụ một đường dẫn file do Explorer truyền vào khi người dùng "Open with") thì **mở UI**.
- `cli::run` gọi `attach_console()` trước tiên (chép từ `Project_P/src-tauri/src/cli.rs`), vì bản release
  là GUI subsystem.
- Parser dùng `clap` derive: mỗi tính năng là một subcommand, `--help` có ví dụ.
- Cờ chung (subcommand nào hợp thì có):

  | Cờ | Ý nghĩa |
  |---|---|
  | `--report <file.json>` | ghi toàn bộ kết quả (cùng struct với UI) ra JSON |
  | `--dry-run` | không ghi gì, chỉ báo kế hoạch |
  | `--watch` | chạy một lần, rồi chạy lại mỗi khi đầu vào đổi; `Ctrl+C` để dừng (exit 0) |
  | `--fail-on <warn\|error>` | cho lệnh kiểm tra: mức issue làm exit 1 (mặc định `error`) |
  | `--quiet` | chỉ in dòng tổng kết và lỗi |

- **Mã thoát**: `0` chạy xong và không có issue ở mức `--fail-on`; `1` đã chạy nhưng có issue ở mức đó,
  hoặc vượt ngân sách, hoặc một bước thất bại; `2` tham số sai, file project hỏng hoặc thiếu đầu vào.
- **Định dạng in ra** (giống Poseidon): dòng tiêu đề `"<App> <version> — <lệnh> on <path>"`, mỗi bước
  một dòng `OK  ` / `WARN` / `FAIL` / `SKIP` + tóm tắt. In tối đa 20 dòng chi tiết mỗi bước, dòng lỗi (bắt
  đầu bằng `!`) in trước; phần còn lại ghi `… N more line(s) in the report`. Dòng cuối là
  `Finished in N ms` hoặc `Stopped after a failed step`.
- Trong `cmd`, phải dùng `start /wait coral.exe …` mới chờ được mã thoát. PowerShell và CI thì gọi
  thẳng. Ghi điều này vào README.

### 8.2 Test CLI

`cli.rs` có `#[cfg(test)] mod tests` với hai loại test (mẫu: `Project_P/src-tauri/src/cli.rs`):
- `parses_flags`: mọi subcommand, cờ thiếu giá trị, cờ lạ → `Err`.
- `runs_<subcommand>`: tạo dữ liệu trong `tempfile::tempdir()`, gọi `run(args)`, kiểm tra mã thoát và nội
  dung `--report`.

### 8.3 Tài liệu

README có mục **Command line**: mỗi subcommand một ví dụ, bảng mã thoát, một ví dụ dùng trong
GitHub Actions hoặc script build.

---

## 9. Chế độ `?mock`: phát triển UI không cần backend

- `npm run dev` rồi mở `http://localhost:<port>/?mock`. Chỉ bật khi `import.meta.env.DEV` **và** URL có
  `mock`. Không bao giờ bật trong bản build hay bên trong Tauri.
- `src/dev/mockBackend.ts` được import **đầu tiên** trong `main.tsx`, trước mọi thứ đọc `isTauri()`.
- Dùng `mockWindows("main")` và `mockIPC(handler, { shouldMockEvents: true })` của
  `@tauri-apps/api/mocks` (mẫu: `Project_P/src/dev/mockBackend.ts`).
- Handler phải trả lời **mọi command trong `lib/ipc.ts`**, và cả các command của plugin mà UI dùng:
  `plugin:dialog|open`, `plugin:dialog|save` (trả về đường dẫn mẫu), `plugin:updater|check`,
  `plugin:updater|download_and_install`, `plugin:window|set_theme`, `plugin:webview|set_webview_zoom`,
  `plugin:process|restart`, `plugin:event|*`.
- Job dài thì phát event progress thật (`emit(...)` kèm `sleep`) để thanh tiến độ và nút Cancel chạy được.
- Dữ liệu mẫu phải **thực tế và có lỗi cố ý** (file hỏng, issue mức warn và error), để mọi trạng thái của
  UI (rỗng, đang chạy, có lỗi, xong) đều xem được.
- Ảnh trong mock: sinh bằng `<canvas>` rồi `toDataURL()`. Không đưa file ảnh lớn vào repo.
- `npm run check:mock` (script `scripts/check-mock.mjs` từ template) báo lỗi khi một command trong
  `ipc.ts` không có `case` tương ứng trong mock. Script này nằm trong `npm run check`.
- Agent kiểm tra UI bằng Browser pane: chạy dev server (`.claude/launch.json` với
  `npm run dev`), mở `?mock`, đi qua mọi luồng chính, xem console không có lỗi, chụp màn hình làm bằng chứng.

---

## 10. Watch folder

Template nâng cấp có `utils/watch.rs`, command `watch_start` / `watch_stop` / `watch_list` và component
`WatchToggle` trong `@abyss/ui`. Quy ước:

- **Cấu hình**:
  `WatchConfig { paths: Vec<PathBuf>, recursive: bool, include: Vec<String> /*glob*/, exclude: Vec<String>, debounce_ms: 500, settle_ms: 300 }`.
- **Luôn bỏ qua**: thư mục output của chính lần chạy đó (tránh vòng lặp vô hạn), `.git/`, `node_modules/`,
  `Library/`, `Temp/`, `Intermediate/`, `Saved/`, `.godot/`, file tạm (`~*`, `*.tmp`, `*.part`, `*.crdownload`,
  `.~lock.*`, `*.bak`).
- **Chờ file ghi xong**: sau debounce, kiểm tra kích thước và mtime 2 lần cách nhau `settle_ms`. Chưa ổn
  định thì chờ tiếp, tối đa 10 giây, sau đó bỏ qua file đó và ghi warn.
- **Gộp lần chạy**: đang chạy mà có thay đổi mới thì đánh dấu `dirty`, chạy lại **một lần** khi xong. Không
  xếp hàng N lần.
- Lần chạy do watch kích hoạt phải **tăng dần** nếu engine hỗ trợ: chỉ xử lý những gì bị ảnh hưởng.
- Event `watch://status`:
  `{ watchId, state: "idle"|"running"|"error", lastRunAt, lastDurationMs, lastSummary, lastError, changedPaths[] }`.
- Watch dừng khi đóng app. Không tự bật lại khi mở app, trừ khi project có
  `"watch": { "autoStart": true }` (mặc định `false`).
- **UI**: `WatchToggle` đặt ở header của module, hiển thị `Watching · last run 12:03:41 · 0.4 s · 0 issues`.
  Có lỗi thì pill đỏ, bấm vào mở LogDrawer.
- **CLI**: `--watch` dùng cùng `utils/watch.rs`. Mỗi lần chạy lại in một dòng tổng kết.
- **Test**: test core của watch dùng thư mục tạm, ghi file, rồi chờ event với timeout 5 giây.

---

## 11. Quy ước UI

- **Layout từ template**: rail trái lấy từ `lib/modules.ts`, phím `Ctrl+1..9` chuyển module. Header có tên
  app, project đang mở, pill phiên bản, pill `via Abyss` và nút Update. LogDrawer mở bằng `` Ctrl+` ``.
  CommandPalette mở bằng `Ctrl+K`, liệt kê module, lệnh và project gần đây. About & contact dùng
  `author.ts` chép từ Poseidon. Settings gồm `AppearanceSettings` cộng phần cài đặt riêng của app.
- **Component** lấy từ `@abyss/ui` trước: `GlassCard`, `PillBadge`, `Checkbox`, `Segmented`, `TextField`,
  `FieldLabel`, `ProgressBar`, `PathText`, `EmptyState`, `Modal`, `RailButton`, `LogDrawer`,
  `CommandPalette`, `WatchToggle`, `JobProgress`, `AboutDialog`. Thiếu thứ gì dùng chung được cho mọi app
  thì thêm vào `@abyss/ui` (không chép vào từng app), bằng một thay đổi nhỏ riêng, ghi vào PROGRESS.md của
  app. Nút dùng class `btn`, `btn-primary`.
- **Kéo thả**: `useWindowDragDrop` + `dropRouter.ts`. Mỗi module khai báo loại file nó nhận.
- **Bảng trên 1000 dòng** phải virtualize (ví dụ `@tanstack/react-virtual`).
- **Ảnh và media trên đĩa**: dùng `convertFileSrc(path)` (asset protocol: bật feature `protocol-asset` và
  `app.security.assetProtocol.scope`). Ảnh tạo trong bộ nhớ (preview chưa ghi ra đĩa) trả về dạng
  `tauri::ipc::Response` (bytes thô), giống `decode_image` của Poseidon.
- **Module nặng** (three.js, uPlot, canvas lớn) phải `lazy()` import, để app khởi động dưới 0,5 giây.
- Text UI bằng tiếng Anh, ngắn gọn, kiểu câu thường (sentence case). Số có đơn vị (`12.4 MB`,
  `16.7 ms`, `−18.0 LUFS`).
- Phím tắt chung: `Esc` đóng dialog, `Ctrl+O` / `Ctrl+S` cho project, `F5` chạy lại thao tác của module
  hiện tại.

---

## 12. Cài đặt và dữ liệu

- Tùy chọn UI: zustand `persist` vào localStorage, key `<id>.<store>`.
- Cài đặt cấp app (đường dẫn công cụ ngoài như ffmpeg, Blender, UnrealPak): lưu
  `app_data_dir()/settings.json` qua command `get_settings` / `set_settings`, để CLI cũng đọc được.
- Công cụ ngoài: tìm theo thứ tự (1) đường dẫn trong settings, (2) biến môi trường (`FFMPEG_PATH`,
  `BLENDER_PATH`, …), (3) `PATH`, (4) đường dẫn cài đặt mặc định. Không tìm thấy thì UI hiện hướng dẫn
  và nút "Locate…". Không tự tải công cụ về.

---

## 13. Kiểm thử: phải chạy trước khi báo xong

| Lớp | Ở đâu | Lệnh |
|---|---|---|
| Unit test core | `src-tauri/src/core/**` `#[cfg(test)]` | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Contract test (JSON từ TS → struct Rust) | `src-tauri/src/commands/mod.rs` | (cùng lệnh) |
| IPC test trên mock runtime | `src-tauri/src/ipc_tests.rs` (mẫu: `Project_P/src-tauri/src/ipc_tests.rs`) | (cùng lệnh) |
| CLI test | `src-tauri/src/cli.rs` | (cùng lệnh) |
| Typecheck | toàn bộ `src/` | `npm run typecheck` |
| Mock đủ command | `scripts/check-mock.mjs` | `npm run check:mock` |
| Tất cả ở trên | | `npm run check` |
| UI thủ công | Browser pane, `?mock` | xem §9 |
| Bản release (cuối mỗi milestone) | | `npm run tauri build` rồi chạy `<id>.exe --help` và một lệnh CLI thật |

- Dữ liệu test **sinh bằng code** khi được (ảnh bằng `image::RgbaImage`, audio bằng sóng sine, CSV bằng
  string). File fixture thật (Aseprite, PSD, Editor.log, PO…) đặt ở `src-tauri/tests/fixtures/`,
  mỗi file dưới 200 KB, ghi nguồn gốc trong `tests/fixtures/README.md`.
- Thuật toán có tính chất bất biến (packer không chồng, LUFS sau chuẩn hóa nằm trong dung sai, round-trip
  đọc/ghi không đổi dữ liệu) phải có test kiểm tra tính chất đó.
- Không xong phase nào khi `npm run check` còn đỏ.

---

## 14. Phát hành và catalog

1. Ghi `docs/CHANGELOG.md`.
2. `npm run release -- -Version 0.1.0 -Notes "…"` để build thử; thêm `-Publish` khi người dùng đồng ý.
   Script là `Abyss/scripts/release.ps1`, theo `Abyss/docs/RELEASE_STANDARD.md`: NSIS đã ký,
   `latest.json`, `SHA256SUMS.txt`, tag `v0.1.0`.
3. Lần đầu tiên: `git init`, `gh repo create HoangTrongPhi/<Name> --public --source . --push` (chỉ khi
   người dùng cho phép).
4. Sau khi phát hành lần đầu: trong `Abyss/catalog/catalog.json`, đặt `"status": "available"` (hoặc `beta`
   cho bản < 1.0 nếu người dùng muốn), tăng `revision`, chạy `npm run catalog:check -- --online` trong
   Abyss.
5. Nhắc người dùng sao lưu `%USERPROFILE%\.tauri\<id>.key`.

Gợi ý mốc phiên bản: `0.1.0` khi xong MVP (spec mỗi app ghi rõ phase nào). Mỗi nhóm tính năng sau đó
tăng minor.

---

## 15. Mẫu `docs/PROGRESS.md`

```markdown
# <App> — Progress

## Status
- Current phase: P3 — Exporters (in progress)
- Last session: 2026-11-02 — Godot SpriteFrames exporter done; Unity .meta writer half done
- `npm run check`: green / red (why)

## Phases
- [x] P0 Scaffold
- [x] P1 Sources & trim
- [x] P2 Packer
- [ ] P3 Exporters — [x] JSON Hash [x] Godot [ ] Unity .meta [ ] Spine
...

## Decisions (answers to the spec's open questions)
- 2026-11-01 — Unity target: 2022.3 LTS and Unity 6 (user)

## Known issues / next steps
- Unity .meta: nameFileIdTable not written yet (see core/export/unity.rs TODO)
```

---

## 16. Định nghĩa hoàn thành chung (mọi phase)

- [ ] Checklist "Xong khi" của phase đạt hết.
- [ ] `npm run check` xanh.
- [ ] Tính năng mới đều có: core + test, command + contract test, mock case, UI, và CLI nếu spec yêu cầu.
- [ ] Mọi thao tác ghi đều có dry-run và báo cáo.
- [ ] Đã xem UI trong `?mock` và không có lỗi console.
- [ ] PROGRESS.md đã cập nhật. FORMATS.md đã cập nhật nếu format đổi.
- [ ] Không còn `TODO` không có ghi chú trong PROGRESS.md.

---

# Phần B — Add-on Blender (Trident, Compass)

### B.1 Định dạng và phiên bản
- **Blender extension** (4.2+), có `blender_manifest.toml`. Người dùng dùng Blender 5.x, nên đặt
  `blender_version_min = "4.2.0"` và kiểm thử trên bản 5.x đang cài.
- Sau khi cài, module là `bl_ext.user_default.<id>`. Abyss cài bằng Blender headless
  (`Abyss/apps/launcher/src-tauri/scripts/abyss_addon_tool.py`).
- Chỉ dùng thư viện chuẩn, `bpy`, `bmesh`, `mathutils` và `numpy` (có sẵn trong Blender). Không pip.

### B.2 Cấu trúc repo
```
<Addon>/                        repo HoangTrongPhi/<Addon>
├── <id>/                       package của extension
│   ├── blender_manifest.toml
│   ├── __init__.py             register()/unregister() gọi các module con
│   ├── props.py                PropertyGroup gắn vào bpy.types.Scene.<id>
│   ├── prefs.py                AddonPreferences
│   ├── ops/                    Operator: <ID>_OT_<name>, bl_idname "<id>.<name>"
│   ├── ui/                     Panel ở N-panel, tab tên add-on: <ID>_PT_<name>
│   ├── core/                   logic thuần trên bpy/bmesh, KHÔNG phụ thuộc UI
│   └── presets/*.json          preset dạng dữ liệu
├── cli/<id>_cli.py             chạy headless: blender -b file.blend --python-exit-code 1 -P cli/<id>_cli.py -- [args]
├── tests/
│   ├── run_tests.py            blender -b --factory-startup --python-exit-code 1 -P tests/run_tests.py
│   └── test_*.py               dựng scene bằng bpy trong test, không cần .blend nhị phân
├── scripts/build.ps1           blender --command extension build --source-dir <id> --output-dir dist
│                               + SHA256SUMS.txt
└── docs/ SPEC.md PROGRESS.md CHANGELOG.md
```

### B.3 Quy ước
- Mọi operator sửa dữ liệu đều có `bl_options = {"REGISTER", "UNDO"}`. Check (chỉ đọc) không sửa scene.
- Core trả về danh sách `Issue(code, severity, object_name, message, fixable)`. UI và CLI dùng chung.
- CLI: in JSON report ra `--report`, `sys.exit(1)` khi có issue ở mức `--fail-on`. Luôn chạy với
  `--python-exit-code 1` để exception cũng ra mã 1.
- Test: `tests/run_tests.py` tự tìm `test_*.py` và chạy bằng `unittest`. Lệnh trong README. Tìm Blender
  theo `BLENDER_PATH` hoặc giống Poseidon (`Project_P/src-tauri/src/core/blender_runner.rs`).

### B.4 Phát hành vào Abyss
1. `scripts/build.ps1` → `dist/<id>-<version>.zip` + `SHA256SUMS.txt`.
2. GitHub release `v<version>` đính kèm cả hai file.
3. Thêm vào `addons` trong `Abyss/catalog/catalog.json`, thay một `addon-slot-*`:
   `{ "id", "name", "tagline", "status": "available", "module": "bl_ext.user_default.<id>", "repo": "HoangTrongPhi/<Addon>", "asset": "<id>-*.zip", "minBlender": "4.2" }`,
   tăng `revision`, chạy `npm run catalog:check -- --online`.
