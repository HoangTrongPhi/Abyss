# Poseidon — ba tính năng bổ sung (không tạo app mới)

> **Repo**: Poseidon — `P:\Phineas_LIB\Gogo_Gadgets\Project_P` (`HoangTrongPhi/P`, phiên bản hiện tại 1.0.1)
> **Đọc trước**:
> - `Project_P/README.md`, `Project_P/docs/ARCHITECTURE.md`, `Project_P/docs/CHANGELOG.md`;
> - `00_SHARED_FRAMEWORK.md` §0, §4–§7, §13 (Poseidon **là** chuẩn của khung, nên không cần nâng cấp template).
>
> **Ba phần độc lập**, làm phần nào cũng được, mỗi phần một phiên bản minor:
> - A — VRAM budget;
> - B — glTF/OBJ optimizer + LOD;
> - C — Tileable texture tools.
>
> Tiến độ ghi vào `Project_P/docs/PROGRESS_ADDITIONS.md` (tạo mới theo mẫu §15 của khung chung).

## Bản đồ code Poseidon cần chạm (cho mọi phần)

| Thứ | File |
|---|---|
| Engine mới | `src-tauri/src/core/<engine>.rs`, khai báo trong `src-tauri/src/core/mod.rs` |
| Command | `src-tauri/src/commands/tools_cmd.rs` (hoặc file `<x>_cmd.rs` mới + `commands/mod.rs`), đăng ký trong `src-tauri/src/lib.rs` `configure()` |
| Contract test | `src-tauri/src/commands/mod.rs` `contract_tests` |
| IPC test | `src-tauri/src/ipc_tests.rs` |
| Recipe step | `src-tauri/src/core/recipe.rs` (`RecipeStep` enum + `kind()` + `title()` + chạy bước) |
| CLI | không đổi: recipe chạy qua `poseidon --recipe` |
| Kiểu TS | `src/types/pipeline.ts` |
| IPC TS | `src/lib/ipc.ts` |
| Mock | `src/dev/mockBackend.ts` (thêm `case`; nếu là recipe step thì thêm vào `titles` và `summaries`) |
| UI | `src/components/tabs/ToolsTab.tsx` (công cụ nhỏ) hoặc tab mới + `src/lib/modules.ts` + `TabId` |
| Store | `src/stores/toolsStore.ts` hoặc store mới |
| Docs | `README.md` (bảng Status, IPC commands), `docs/CHANGELOG.md`, `docs/user-guide/` |

Kiểm tra trước khi xong: `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build` (typecheck), xem
`http://localhost:1420/?mock`.

---

## A — VRAM budget (v1.1.0)

### Mục tiêu
Ước lượng **bộ nhớ GPU** texture sẽ chiếm **sau khi nén** trên nền tảng đích, theo thư mục, texture set hoặc
level. So với ngân sách và chạy "what-if" (ví dụ hạ mọi texture > 2K về 2K thì tiết kiệm bao nhiêu). Có recipe step
cho CI.

### Công thức (ghi vào `docs/user-guide`)
- Bits per pixel:

  | Format | bpp |
  |---|---|
  | RGBA8 / BGRA8 | 32 |
  | RGB8 (lưu thành RGBA trên GPU) | 32 |
  | R8 | 8 |
  | RG8 | 16 |
  | RGBA16F | 64 |
  | BC1 / DXT1 | 4 |
  | BC4 | 4 |
  | BC3 / DXT5, BC5, BC6H, BC7 | 8 |
  | ASTC 4×4 | 8.00 |
  | ASTC 5×5 | 5.12 |
  | ASTC 6×6 | 3.56 |
  | ASTC 8×8 | 2.00 |
  | ETC2 RGB | 4 |
  | ETC2 RGBA | 8 |

- **Định dạng nén khối**: mỗi mip làm tròn **lên** bội số của khối (4×4 với BC/ETC, N×N với ASTC), tối thiểu một
  khối. `bytes(mip) = ceil(w/bw) × ceil(h/bh) × bytesPerBlock`.
- **Chuỗi mip**: cộng mọi level tới 1×1 (xấp xỉ ×4/3, nhưng tính chính xác).
- Cubemap ×6; texture array × số lớp.

### Gán format đích (preset nền tảng, JSON nhúng `include_str!`, người dùng sửa được)

```jsonc
{ "id": "pc-dx12", "name": "PC (DX12/Vulkan)", "budgetMb": 2048, "mips": true,
  "byMap": { "baseColor": "BC7", "baseColorNoAlpha": "BC1", "normal": "BC5", "orm": "BC7", "roughness": "BC4",
             "metallic": "BC4", "ao": "BC4", "emissive": "BC1", "height": "BC4", "opacity": "BC4", "hdr": "BC6H", "ui": "RGBA8" },
  "maxSize": null }
```
Có thêm `mobile-astc` (6×6 cho màu, 4×4 cho normal), `switch-like` (để `budgetMb` trống cho người dùng điền).
Loại map lấy từ `core/texture_sets.rs::classify_map` (đã có). Không phân loại được thì dùng `baseColor`.
`.dds` / `.ktx2` đọc header để lấy format và mip **thật**, thay cho format đích.

### Engine `core/vram.rs`
`vram_estimate(paths, &VramOptions { preset, groupBy: folder|textureSet|none, whatIf: { maxSize?, dropMip0? } }) -> VramReport`
- Mỗi file: kích thước gốc (đọc header bằng `image::image_dimensions`, không decode cả ảnh), map kind,
  format đích, bytes, có alpha hay không (BC1 hay BC7 cho base color: kiểm kênh alpha **có dùng** hay không,
  tức là có pixel nào khác 255; chỉ khi bật `checkAlpha`, vì phải decode).
- Nhóm, tổng, % ngân sách, top 20 file.
- What-if: tính lại với `maxSize`, báo phần tiết kiệm.

### Recipe step
`{ "kind": "vramBudget", "preset": "pc-dx12", "budgetMb": 1500, "groupBy": "folder" }`: bước **fail** khi vượt
ngân sách, nên `poseidon --recipe` thoát 1. Dùng làm cổng CI.

### UI
Card "VRAM budget" trong ToolsTab:
- chọn preset;
- bảng nhóm có thanh % ngân sách;
- top file;
- ô what-if;
- nút xuất CSV/HTML (dùng `src/lib/reportBuilders.ts` sẵn có).

### Test
- 2048² BC7 có mip → 5.592.432 byte (12 mip; số khối mỗi cạnh 512, 256, …, 2, 1, 1, 1; tổng bình phương
  349.527 × 16 byte). Agent **tự tính lại** giá trị kỳ vọng trong test bằng code độc lập.
- 1×1 BC1 → 8 byte (một khối).
- Recipe vượt ngân sách → step fail.

### Xong khi
Card chạy trên thư mục thật; recipe step có test; mock có case; CHANGELOG ghi v1.1.0.

---

## B — glTF/OBJ optimizer + LOD (v1.2.0)

### Mục tiêu
Tạo chuỗi LOD và tối ưu mesh cho **glTF/GLB và OBJ** (FBX chỉ đọc được, không ghi được, nên ngoài phạm vi):
- simplify theo tỉ lệ;
- tối ưu vertex cache và overdraw;
- (tùy chọn) quantize.

Có báo cáo tri, đỉnh và dung lượng trước/sau.

### Engine `core/mesh_opt.rs`
- Đọc: crate `gltf` (thêm mới, feature `import` để nạp buffer); OBJ dùng reader sẵn có trong
  `core/mesh_stats.rs` nếu tách ra được, hoặc crate `tobj`.
- Tối ưu: crate `meshopt` (bindings của meshoptimizer):
  - `optimize_vertex_cache`, `optimize_overdraw` (ngưỡng 1.05), `optimize_vertex_fetch`;
  - `simplify` với `target_index_count = ratio × index_count`, `target_error` (mặc định 0.01), cờ `LockBorder`
    cho mesh có seam.
- Ghi: glTF tách mỗi LOD thành mesh `<name>_LOD<n>` **trong cùng file** (hoặc file riêng, tùy chọn). Dùng
  `gltf-json` để dựng lại document, giữ material và texture **tham chiếu nguyên** (không chép ảnh); GLB đóng
  buffer. OBJ: file `<name>_LOD<n>.obj`, giữ `mtllib`/`usemtl`.
- Tùy chọn `KHR_mesh_quantization` (position 16-bit, normal 8-bit, uv 16-bit): **phase sau**, hỏi người dùng.
- Báo cáo: mỗi LOD (tri, vert, error đạt được, bytes); cảnh báo `simplify-stalled` khi không đạt tỉ lệ.

### Recipe step
`{ "kind": "generateLods", "ratios": [0.5, 0.25, 0.12], "targetError": 0.01, "layout": "sameFile" | "separateFiles", "outDir": "lod" }`

### UI
- Card "LOD generator" trong ToolsTab (danh sách file, tỉ lệ, chạy, bảng kết quả).
- Trong PreviewTab: dropdown chọn LOD để xem nếu file có `_LOD` (viewport three.js sẵn có).

### Test
Mesh lưới 100×100 sinh bằng code (đủ tri) → LOD 0.25 có tri ≤ 27% gốc; glTF ghi ra đọc lại được bằng crate
`gltf`; material index giữ nguyên.

### Xong khi
Chạy trên GLB thật của người dùng, mở được trong Blender và trong viewport Poseidon; CHANGELOG v1.2.0.

---

## C — Tileable texture tools (v1.3.0)

### Mục tiêu
Kiểm tra và sửa texture lặp (tileable):
- xem lặp 3×3;
- điểm "seam" theo số đo;
- xuất bản offset 50%;
- make-tileable bằng blend biên.

### Engine `core/tileable.rs`
- **Seam score**: so cột trái với cột phải và hàng trên với hàng dưới. Lấy trung bình |Δ| trên dải `k` px
  (mặc định 2), chuẩn hóa 0–1, rồi so với **trung bình độ khác giữa hai cột kề nhau bên trong ảnh** (để ảnh nhiễu
  không bị phạt oan).
  `score = edgeDiff / interiorDiff`. Score > 1.5 → `not-tileable` (warn).
- **Offset 50%**: dịch vòng (wrap) W/2, H/2. Xuất `<name>_offset.png` để họa sĩ sửa tay vùng seam.
- **Make tileable**: dịch 50%, rồi blend vùng chữ thập (rộng `w%`, mặc định 15%) giữa ảnh dịch và ảnh gốc theo mask
  gradient. Tùy chọn mirror-blend. Xuất `<name>_tile.png`.
  Normal map (map kind normal): blend trên vector đã giải mã, rồi chuẩn hóa lại, **không** blend thẳng RGB.

### UI
- TextureViewer (`src/components/previewer/TextureViewer.tsx`): thêm nút "Tile 3×3" (chỉ ở UI: vẽ texture
  `RepeatWrapping`, hoặc vẽ 9 lần trên canvas).
- ToolsTab: card "Tileable" có score cho cả thư mục, nút Offset và Make tileable (dry-run, thư mục output riêng).

### Recipe step
`{ "kind": "checkTileable", "threshold": 1.5, "nameContains": "_D" }`, chỉ kiểm tra, không sửa.

### Test
- Ảnh sin tuần hoàn đúng chu kỳ → score ≈ 1.
- Gradient ngang → score cao.
- Make-tileable trên gradient → score giảm dưới ngưỡng.

### Xong khi
Card chạy; nút Tile 3×3 trong viewer; CHANGELOG v1.3.0.

---

## Câu hỏi mở

| # | Câu hỏi | Phần |
|---|---|---|
| Q1 | Nền tảng đích và ngân sách VRAM thực tế? | A |
| Q2 | Có dùng glTF trong pipeline không, hay chủ yếu FBX? (nếu chỉ FBX, phần B nên chuyển thành chạy LOD qua Blender headless như `blender_runner.rs`) | B |
| Q3 | Có cần quantization (KHR_mesh_quantization) cho web game không? | B |
| Q4 | Làm ba phần theo thứ tự nào? (đề xuất: A → C → B) | — |
