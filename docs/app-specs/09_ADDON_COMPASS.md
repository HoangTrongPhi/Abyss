# Compass — Texel density & UV checker (Blender add-on)

> **Loại**: Blender extension (slot add-on của Abyss) · **Blender**: 4.2+ (kiểm thử trên 5.x của người dùng)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md` **Phần B** và §0. Không cần template Tauri.
> **Repo**: `HoangTrongPhi/Compass` · **Thư mục**: `P:\Phineas_LIB\Gogo_Gadgets\Compass` · **id**: `compass_texel`
> **MVP**: hết P3 (v0.1.0)

## 1. Mục tiêu

Giữ **texel density** đồng đều giữa các asset, và bắt lỗi UV trước khi bake hoặc texture:
- đo và đặt px/m;
- copy density giữa các object;
- heatmap density ngay trên viewport;
- kiểm padding theo độ phân giải, UV ra ngoài 0–1, đảo chồng ngoài ý muốn.

### Ngoài phạm vi
Unwrap tự động (dùng công cụ có sẵn của Blender), packing nâng cao (chỉ gọi `pack_islands` của Blender).

## 2. Định nghĩa (ghi vào README)

- **Texel density của face** `TD_f = sqrt(areaUV_f × res²) / sqrt(area3D_f)` (px/m). `area3D` tính trong world
  space (đã nhân `matrix_world`); `res` là kích thước texture đích (cạnh dài; nếu texture không vuông thì
  dùng `sqrt(w×h)` và ghi chú).
- **TD của object** = trung bình **có trọng số diện tích 3D**: `sqrt(Σ areaUV_f × res² / Σ area3D_f)`.
  Kèm min, max và độ lệch (percentile 5/95 theo diện tích).
- **Đơn vị**: px/m; UI hiển thị thêm px/cm (÷100).
- Gợi ý mặc định: 512 px/m (10.24 px/cm) cho asset góc nhìn thứ nhất/thứ ba trên PC. Chỉnh được.

## 3. Tính năng

| # | Tính năng | Chi tiết |
|---|---|---|
| F1 | **Measure** | Object đang chọn (hoặc face đang chọn trong edit mode): TD trung bình, min, max, % diện tích lệch > ±20% so với target |
| F2 | **Set** | Scale UV đến target: mode `object` (scale mọi đảo quanh tâm chung) hoặc `island` (mỗi đảo tự scale đến target). Sau đó tùy chọn **Pack** (`bpy.ops.uv.pack_islands`, margin = padding_px / res, `margin_method = "FRACTION"`, có trong Blender 3.6+; nếu tham số không tồn tại thì bỏ, ghi warn) |
| F3 | **Copy / Paste TD** | Lấy TD của object active, áp cho các object chọn |
| F4 | **Heatmap** | Ghi color attribute `Compass_TD` (domain CORNER, kiểu BYTE_COLOR): xanh dương = thấp, xanh lá = đúng target (±10%), đỏ = cao (thang log2 của tỉ lệ TD/target, kẹp ±1 octave). Chuyển viewport shading sang Attribute; nút Restore khôi phục shading cũ (lưu trong Scene) và tùy chọn xóa attribute |
| F5 | **UV checks** | `uv-out-of-bounds` (UV0 ngoài 0–1, nếu project không dùng tiling), `uv-overlap` (rasterize đảo lên lưới res/4; ô ≥ 2 đảo; nhận diện **đảo xếp chồng giống hệt** là `stacked` mức info), `padding-too-small` (khoảng cách nhỏ nhất giữa hai đảo, theo pixel ở `res`, < padding yêu cầu), `island-tiny` (đảo < 2×2 px ở `res`), `uv-flipped` (đảo bị lật, area có dấu âm) |
| F6 | **Padding table** | Mặc định: 512→2 px, 1K→4 px, 2K→8 px, 4K→16 px (chỉnh được trong Preferences) |
| F7 | **Report** | Bảng cho mọi object đã chọn (tên, res, TD, min/max, issue), xuất CSV |
| F8 | **CLI** | `blender -b file.blend --python-exit-code 1 -P cli/compass_cli.py -- --res 2048 --target 512 [--tolerance 20] [--fail-on warn] [--report r.json]` |

`res` lấy theo thứ tự: override trên object (custom property `compass_res`) → kích thước ảnh đầu tiên trong
material của object (node Image Texture nối vào Base Color) → giá trị mặc định của Scene.

## 4. Kiến trúc

```
compass_texel/
  core/density.py     tính TD theo face (numpy trên foreach_get để nhanh), theo object
  core/islands.py     tìm đảo UV (union-find trên loop UV dùng chung đỉnh UV), bbox, area có dấu
  core/raster.py      rasterize tam giác UV lên lưới (numpy), overlap, khoảng cách
  core/checks.py      Issue list (giống Trident: code, severity, object, message, fixable)
  ops/                COMPASS_OT_measure, _set, _copy, _paste, _heatmap, _restore, _check, _report
  ui/panel.py         N-panel tab "Compass"
  props.py prefs.py
cli/compass_cli.py
tests/
```

Hiệu năng: mesh 200.000 tri, Measure dưới 1 giây. Dùng `mesh.polygons.foreach_get("area", …)`, mảng UV loop qua
`uv_layer.data.foreach_get("uv", …)`, numpy vector hóa; không loop Python theo từng face.

## 5. Các phase

### P0 — Scaffold
Theo Phần B.2, `id = "compass_texel"`, test runner, build script. **Xong khi**: test rỗng chạy xanh, build ra zip.

### P1 — Density core + Measure
`density.py`, `islands.py`; test:
- plane 1×1 m với UV phủ 0–1, res 1024 → TD = 1024 px/m;
- plane 2×2 m, cùng UV → 512;
- object scale 2 (chưa apply) → tính đúng theo world.

Panel Measure. **Xong khi**: test xanh; số trên panel đúng.

### P2 — Set + Copy/Paste + Pack
Test: sau Set target 512 trên plane 2×2 m, res 1024 → TD = 512 ±0.5%; mode island giữ tâm đảo.
**Xong khi**: F2, F3 chạy; một bước undo.

### P3 — Heatmap + UV checks + Report + CLI (MVP, v0.1.0)
F4–F8; test overlap (hai đảo chồng một nửa → overlap ≈ 50% diện tích đảo nhỏ), padding (hai đảo cách 3 px ở
1K với yêu cầu 4 px → issue). Build, phát hành, đưa vào catalog (Phần B.4) khi người dùng cho phép.
**Xong khi**: F1–F8 đạt; CLI cho mã thoát đúng.

### P4 — Hoàn thiện
Preset target theo loại asset (hero / prop / environment) trong Preferences; tài liệu có ảnh.

## 6. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Target TD chuẩn của dự án (px/m) và res texture thường dùng? | P1 |
| Q2 | Có dùng UDIM không (v1 chỉ hỗ trợ ô 0–1)? | P3 |
| Q3 | Gộp Compass vào Trident thành một add-on, hay giữ riêng? (mặc định: riêng) | P0 |

## 7. Rủi ro
- **Mesh có face diện tích 0** → bỏ qua khi chia; đếm vào issue `zero-area-faces` (mức info).
- **`pack_islands` đổi tham số giữa các phiên bản Blender** → kiểm tra RNA trước khi truyền tham số (giống Trident).
