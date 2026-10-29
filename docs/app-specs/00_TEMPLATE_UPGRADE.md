# Nâng cấp template `tauri-app`: CLI, `?mock`, watch, job, log

> **Làm một lần, TRƯỚC app đầu tiên.** Mọi app tạo bằng `npm run new-app` sau đó có sẵn khung của
> Poseidon.
> **Repo**: Abyss — `P:\Phineas_LIB\Gogo_Gadgets\Abyss` (git, nhánh `main`)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md` (cùng thư mục). File này hiện thực các §5, §8, §9, §10, §11 của nó.

## 0. Bối cảnh

Hiện template (`Abyss/templates/tauri-app`) chỉ có: theme `@abyss/ui`, `app_info`, updater và một màn
hình "Start here". Nó **chưa có** CLI, `?mock`, logbus, job/progress/cancel, watch folder, plugin
dialog/fs, rail nhiều module, LogDrawer hay CommandPalette. Poseidon có gần đủ những thứ này, chỉ thiếu
watch.

Mục tiêu: template có **một module mẫu chạy đủ mọi hợp đồng**, gọi là **Folder Stats** (đếm file và dung
lượng theo đuôi file). App mới chỉ cần thay module mẫu bằng module thật và làm theo đúng khuôn đó.

Nguồn để chép hoặc tổng quát hóa (đọc trước khi viết):

| Cần | Lấy từ |
|---|---|
| CLI switch + attach console + test | `Project_P/src-tauri/src/main.rs`, `Project_P/src-tauri/src/cli.rs` |
| Logbus | `Project_P/src-tauri/src/utils/logbus.rs` |
| `configure()` + IPC test harness | `Project_P/src-tauri/src/lib.rs`, `Project_P/src-tauri/src/ipc_tests.rs` |
| Job + cancel | `Project_P/src-tauri/src/commands/blender_cmd.rs`, `matcher_cmd.rs` |
| Contract tests | `Project_P/src-tauri/src/commands/mod.rs` |
| Mock backend | `Project_P/src/dev/mockBackend.ts`, `Project_P/src/main.tsx` |
| Layout (rail, header, log drawer, palette, about, settings, update) | `Project_P/src/components/layout/*.tsx` |
| Hooks | `Project_P/src/hooks/useBackendBridge.ts`, `useGlobalHotkeys.ts`, `useWindowDragDrop.ts` |
| Module list | `Project_P/src/lib/modules.ts` |
| Capabilities (dialog, fs, asset) | `Project_P/src-tauri/capabilities/default.json`, `Project_P/src-tauri/tauri.conf.json` |
| Template hiện tại | `Abyss/templates/tauri-app/**`, `Abyss/scripts/create-app.mjs` |

**Không** sửa Poseidon trong việc này.

---

## Phase T1 — Component chung trong `@abyss/ui`

Thư mục `Abyss/packages/abyss-ui/src/`. Component phải **thuần props**, không phụ thuộc store của app nào.

1. `LogDrawer.tsx`: tổng quát hóa từ `Project_P/src/components/layout/LogDrawer.tsx`.
   - Props: `entries: LogEntry[]`, `open`, `onToggle`, `onClear`, `filter?`.
   - `LogEntry = { tsMs: number; level: "debug"|"info"|"warn"|"error"; source: string; message: string }`.
   - Lọc theo level, tự cuộn xuống cuối, nút copy tất cả.
2. `CommandPalette.tsx`: từ bản của Poseidon.
   - Props: `open`, `onClose`, `items: { id, label, hint?, group?, icon?, run(): void }[]`.
   - Tìm mờ (fuzzy), điều hướng bằng phím mũi tên, Enter để chạy.
3. `AboutDialog.tsx`: lấy **khung** từ `Project_P/src/components/layout/AboutDialog.tsx`.
   - Props: `author` (kiểu của `author.ts`), `appName`, `version`, `onCheckUpdates`.
4. `WatchToggle.tsx`: mới.
   - Props: `status: WatchStatus | null`, `onStart`, `onStop`, `disabled?`.
   - Hiển thị pill `Watching · last run hh:mm:ss · 0.4 s · N issues`, chuyển màu đỏ khi `state === "error"`.
5. `JobProgress.tsx`: mới. Gồm thanh tiến độ (`ProgressBar`), message, nút Cancel và thời gian đã chạy.
   - Props: `{ done, total, message, startedAt, onCancel }`.
6. Export cả 5 component (và kiểu `LogEntry`, `WatchStatus`) trong `index.ts`. Thêm style vào `theme.css`
   nếu cần, theo quy ước `.fx-*` đã có.

**Xong khi**: `npm run typecheck` trong Abyss xanh; launcher vẫn build được (`npm run build`).

---

## Phase T2 — Backend Rust của template

Thư mục `Abyss/templates/tauri-app/src-tauri/`. Giữ placeholder `__APP_ID__`, `__APP_CRATE__`,
`__APP_NAME__`, …

1. `Cargo.toml`, thêm:
   - `tauri` với feature `protocol-asset`;
   - `tauri-plugin-dialog`, `tauri-plugin-fs`;
   - `clap` (derive), `rayon`, `walkdir`, `globset`, `notify`, `notify-debouncer-full`, `thiserror`;
   - dev: `tempfile`, `tauri` với feature `test` (như Poseidon).
2. `src/utils/logbus.rs`: chép nguyên bản của Poseidon (event `log://entry`, ring buffer 1000).
3. `src/utils/jobs.rs`: mới.
   ```rust
   pub struct JobRegistry { /* Mutex<HashMap<u64, (String /*kind*/, Arc<AtomicBool>)>> + next id */ }
   impl JobRegistry {
       pub fn start(&self, kind: &str) -> Result<JobHandle, String>; // Err if same kind running
       pub fn cancel(&self, id: u64) -> bool;
   }
   pub struct JobHandle { pub id: u64, pub cancel: Arc<AtomicBool>, /* Drop removes it from the registry */ }
   /// Throttles progress to ~20 events/s and emits "<module>://progress" { jobId, done, total, message }.
   pub fn progress_emitter<R: Runtime>(app: &AppHandle<R>, event: &'static str, job: u64) -> impl Fn(u64, u64, &str) + Sync;
   pub struct RunCtx<'a> { pub progress: &'a (dyn Fn(u64, u64, &str) + Sync), pub cancel: &'a AtomicBool }
   ```
   `RunCtx` đặt ở `src/core/mod.rs`, để core không phụ thuộc `tauri`.
4. `src/utils/watch.rs`: mới, theo §10 của khung chung.
   - `WatchConfig` (serde camelCase), `WatchStatus`.
   - `Watcher::start(config, on_run: impl Fn(&[PathBuf]) -> RunSummary + Send + 'static) -> WatchHandle`.
   - Debounce bằng `notify-debouncer-full`, rồi kiểm tra "settle" (kích thước và mtime ổn định), lọc
     include/exclude bằng `globset`, áp danh sách bỏ qua mặc định, gộp lần chạy bằng cờ `dirty`.
   - Dùng được cả từ Tauri (phát `watch://status`) lẫn CLI (in dòng tổng kết).
5. `src/core/sample.rs`: module mẫu **Folder Stats**.
   - `folder_stats(root, &StatsOptions { recursive, exclude }, &RunCtx) -> Result<StatsReport, CoreError>`.
   - Báo cáo: số file và byte theo đuôi file, 10 file lớn nhất, `issues` (file không đọc được), `elapsedMs`,
     `cancelled`.
   - Dùng `walkdir` + `rayon`, kiểm tra cancel sau mỗi file.
6. `src/commands/`:
   - `app_cmd.rs`: `app_info` (giữ nguyên), `log_history`, `ui_log`, `reveal_in_explorer`, `open_url`,
     `get_settings`, `set_settings` (JSON trong `app_data_dir()/settings.json`), `cancel_job`.
   - `sample_cmd.rs`: `folder_stats(path, options)` (job kind `"stats"`, event `stats://progress`).
   - `watch_cmd.rs`:
     - `watch_start(request: WatchRequest { action: WatchAction, config: Option<WatchConfig> }) -> watchId`.
       `WatchAction` là enum có tag (`#[serde(tag = "kind")]`) các thao tác watch được; ở template chỉ có
       `{ kind: "folderStats", path, options }`. Mỗi action tự suy ra `WatchConfig` mặc định (đường dẫn cần
       theo dõi, thư mục output cần bỏ qua) khi `config` trống. Spec các app gọi theo đúng dạng này:
       `watch_start({ action: { kind: "packProject", project } })`.
     - `watch_stop(id)`, `watch_list()`.
   - `mod.rs`: contract test cho `StatsOptions`, `WatchConfig`.
7. `src/lib.rs`: tách `fn configure<R: Runtime>(builder: Builder<R>) -> Builder<R>` (manage `LogBus`,
   `JobRegistry`, `WatchRegistry`; đăng ký mọi command). `run()` thêm plugin dialog, fs, updater, process.
8. `src/main.rs`: chuyển sang CLI theo §8.1. `src/cli.rs` dùng clap:
   `__APP_ID__ stats <folder> [--report r.json] [--watch] [--quiet]`, cùng `attach_console()` và test
   `parses_flags`, `runs_stats`.
9. `src/ipc_tests.rs`: harness `Harness::new()` / `invoke()` chép từ Poseidon. Test: `app_info`,
   `folder_stats` trên thư mục tạm (kiểm tra có event progress), job thứ hai cùng loại bị từ chối,
   `cancel_job`, `watch_start` → ghi file → nhận `watch://status` (timeout 5 giây) → `watch_stop`.
10. `capabilities/default.json`: thêm `dialog:default`, `fs:default`, quyền đọc `**` (giống Poseidon).
    `tauri.conf.json`: `app.security.assetProtocol = { enable: true, scope: ["**"] }`, CSP thêm
    `asset: http://asset.localhost` vào `img-src` và `media-src`.

**Xong khi**: copy template ra một thư mục tạm và thay placeholder bằng tay (hoặc làm luôn T4 rồi quay
lại), `cargo test` xanh.

---

## Phase T3 — Frontend của template

Thư mục `Abyss/templates/tauri-app/src/`.

1. `lib/ipc.ts`: `EVENTS = { log: "log://entry", stats: "stats://progress", watch: "watch://status" }`,
   cùng các hàm cho mọi command ở T2.
2. `types/__APP_ID__.ts`: `StatsOptions`, `StatsReport`, `Issue`, `WatchConfig`, `WatchStatus`,
   `AppSettings`.
3. `stores/appStore.ts`: `activeTab`, `logs` (giới hạn 2000), `addLogs`, `uiLog`, `dragActive`, `droppedPaths`.
   `stores/sampleStore.ts`: chạy, hủy, kết quả, trạng thái watch.
4. `lib/modules.ts`: `MODULES = [{ id: "stats", label: "Folder Stats", icon, hotkey: "1", accepts: "folder" }]`.
5. `components/layout/`: `NavigationRail`, `HeaderBar` (giữ nút Update và pill của template hiện tại),
   `SettingsDialog`, `AboutDialog` wiring. Dùng `LogDrawer`, `CommandPalette`, `AboutDialog` từ `@abyss/ui`.
   `lib/author.ts` chép từ Poseidon.
6. `hooks/`: `useBackendBridge` (log + app info + update check), `useGlobalHotkeys` (`Ctrl+1..9`,
   `Ctrl+K`, `` Ctrl+` ``, `F5`), `useWindowDragDrop` + `lib/dropRouter.ts`.
7. `components/tabs/StatsTab.tsx`: chọn thư mục (dialog), hoặc kéo thả, tùy chọn, Run, `JobProgress`
   (Cancel), bảng kết quả, `WatchToggle`, danh sách issues.
8. `dev/mockBackend.ts`: mọi command ở T2 và command plugin ở §9 của khung chung; `folder_stats` phát
   progress 10 bước; watch giả phát `watch://status` mỗi 5 giây. `main.tsx` import nó đầu tiên.
9. `scripts/check-mock.mjs`: đọc `src/lib/ipc.ts`, lấy mọi `invoke<…>("name"` (regex), báo lỗi nếu
   `src/dev/mockBackend.ts` không có `case "name"`.
10. `package.json`, thêm scripts:
    `"check:mock": "node scripts/check-mock.mjs"`,
    `"test": "cargo test --manifest-path src-tauri/Cargo.toml"`,
    `"check": "npm run typecheck && npm run check:mock && npm run test"`.

**Xong khi**: trong app thử (T5), `npm run dev` + `?mock` hiện Folder Stats chạy đủ (progress, cancel,
kết quả, watch pill, log drawer, palette); console không có lỗi.

---

## Phase T4 — `create-app.mjs` và tài liệu template

1. `scripts/create-app.mjs`:
   - Thêm `--spec <file>`: chép file đó vào `<out>/docs/SPEC.md` (không thay placeholder trong spec).
   - Tạo `<out>/docs/PROGRESS.md` theo mẫu §15 của khung chung, với tên app và
     `Current phase: P0 — Scaffold (done by create-app)`.
   - Thêm `mjs` vào regex kiểm tra placeholder còn sót.
   - In thêm `npm run check` vào phần "Next:".
2. `templates/tauri-app/README.md`: thêm mục *Command line*, *Mock mode*, *Watch*, *Project layout* (rút
   gọn từ khung chung, trỏ về `docs/SPEC.md`).
3. `templates/tauri-app/docs/CHANGELOG.md` và `docs/FORMATS.md`: khung trống có placeholder tên app.
4. `Abyss/README.md`: cập nhật dòng `templates/` và lệnh `new-app` (thêm `--spec`).

---

## Phase T5 — Kiểm chứng đầu-cuối

1. `npm run new-app -- "Template Probe" --out <scratchpad>/TemplateProbe --no-catalog --spec docs/app-specs/00_SHARED_FRAMEWORK.md`
2. Trong app probe:
   - `npm run check` phải xanh;
   - `npm run dev`, mở `?mock` bằng Browser pane, chụp màn hình;
   - `npm run tauri build` (lâu, chạy nền), rồi
     `start /wait src-tauri\target\release\template-probe.exe stats <thư mục bất kỳ> --report r.json`
     → mã thoát 0 và có file `r.json`;
   - chạy `template-probe.exe` không có tham số → mở cửa sổ.
3. Xóa thư mục probe (nằm trong scratchpad). Kiểm tra `catalog.json` **không** bị đổi.

## Xong khi (toàn bộ)

- [ ] T1–T5 đạt.
- [ ] `npm run typecheck` và `npm run build` của Abyss xanh.
- [ ] Không còn placeholder sót (create-app tự kiểm tra).
- [ ] README của Abyss và của template đã cập nhật.
- [ ] Báo người dùng: template sẵn sàng; lệnh tạo app đầu tiên (Coral) là
  `npm run new-app -- "Coral" --tagline "Sprite atlas & 2D animation toolkit" --category "2D Pipeline" --spec docs/app-specs/01_CORAL.md`.
