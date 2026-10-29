# Trident — Blender game export validator (add-on)

> **Loại**: Blender extension (slot add-on của Abyss) · **Blender**: 4.2+ (kiểm thử trên 5.x của người dùng)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md` **Phần B** (add-on) và §0 (quy trình). Không cần template Tauri.
> **Repo**: `HoangTrongPhi/Trident` · **Thư mục**: `P:\Phineas_LIB\Gogo_Gadgets\Trident` · **id**: `trident_export`
> **MVP**: hết P4 (v0.1.0)

## 1. Mục tiêu

Một nút trong Blender làm ba việc:
1. **Kiểm tra** mesh trước khi xuất (transform chưa apply, n-gon, non-manifold, normal ngược, thiếu UV
   lightmap, tên sai quy ước…), **sửa một click** khi sửa được;
2. **Sinh collision và LOD** theo đúng quy ước của từng engine;
3. **Xuất hàng loạt** mỗi object hoặc collection ra FBX/GLB bằng preset UE5 / Unity / Godot.

Có CLI headless cho CI (`--python-exit-code`).

### Ngoài phạm vi
- Bake texture.
- Retopology.
- Rig và animation (chỉ kiểm vài lỗi armature cơ bản).

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Chọn 12 object → N-panel "Trident" → Validate | Danh sách issue theo object, mỗi issue có nút Select / Fix |
| U2 | Fix all fixable | Một bước undo; issue còn lại là loại không tự sửa được |
| U3 | Generate collision (UCX) cho `SM_Crate` | `UCX_SM_Crate_00` (convex hull), ẩn trong viewport, đúng collection |
| U4 | Generate LODs (preset Unity) | `SM_Rock_LOD0..LOD3`, báo số tri mỗi LOD |
| U5 | Batch export preset UE5, mode "per collection" | `Export/SM_Crate.fbx`… + `trident_report.json` |
| U6 | CI: `blender -b level.blend --python-exit-code 1 -P cli/trident_cli.py -- --validate --fail-on error` | Mã thoát 1 khi có lỗi |

## 3. Kiểm tra (`core/checks/*.py`)

Mỗi check là một hàm `check(obj, ctx) -> list[Issue]`, có thể có `fix(obj, ctx) -> bool`. Tất cả đăng ký trong
`core/checks/__init__.py` với `code`, `severity` mặc định, loại object áp dụng, `fixable`.

| Code | Mức | Phát hiện | Fix |
|---|---|---|---|
| `transform-unapplied` | warn | `scale != (1,1,1)` hoặc `rotation != 0` (mesh) | apply rot+scale; nếu mesh dùng chung data (multi-user) thì `make_single_user` trước, ghi cảnh báo |
| `negative-scale` | error | scale có thành phần âm | apply scale + recalc normals outside |
| `ngons` | warn | face > 4 đỉnh | `bmesh.ops.triangulate` chỉ trên các ngon |
| `non-manifold` | warn | cạnh non-manifold > 0 | không fix; nút Select (vào edit mode, chọn đúng phần) |
| `zero-area-faces` | warn | face có diện tích < 1e-8 | `bmesh.ops.dissolve_degenerate` |
| `loose-geometry` | info | đỉnh hoặc cạnh rời | xóa loose |
| `normals-inverted` | warn | mesh kín (manifold) có thể tích có dấu < 0 | `recalc_face_normals` |
| `no-uv` | error | không có UV layer | Smart UV Project (hỏi trước qua operator) |
| `lightmap-uv-missing` | warn | preset yêu cầu UV1 (UE) mà chỉ có 1 layer | tạo UV1 bằng Lightmap Pack (margin theo preset) |
| `lightmap-uv-overlap` | warn | rasterize đảo UV1 lên lưới N×N (mặc định 256): ô bị ≥ 2 đảo phủ | không fix; báo % chồng |
| `uv-out-of-bounds` | info | UV1 ra ngoài 0–1 (UV0 chỉ báo khi preset bật `uv0ZeroToOne`) | — |
| `material-empty-slot` | warn | slot không có material | xóa slot trống |
| `too-many-materials` | warn | > `maxMaterials` (preset) | — |
| `name-prefix` | warn | tên không khớp prefix (`SM_`, `SK_`) theo loại | đổi tên (thêm prefix) |
| `name-invalid-chars` | warn | khoảng trắng, ký tự ngoài `[A-Za-z0-9_\-]` | thay bằng `_` |
| `tri-budget` | warn | tri > ngân sách của object hoặc collection | — |
| `pivot-not-base` | info | origin không ở tâm đáy bbox (khi preset yêu cầu) | set origin bottom-center |
| `armature-scale` | error | armature scale ≠ 1 | apply scale cho armature và mesh con (cẩn thận, chỉ khi người dùng xác nhận) |
| `modifiers-unapplied` | info | còn modifier (exporter sẽ apply nếu preset bật) | — |

`ctx` có preset, ngân sách, cờ "chỉ object được chọn". Check **không bao giờ** sửa scene.

## 4. Preset (`presets/*.json`, dữ liệu)

```jsonc
{ "id": "ue5", "name": "Unreal Engine 5", "format": "fbx",
  "fbx": { "apply_unit_scale": true, "apply_scale_options": "FBX_SCALE_NONE", "axis_forward": "-Z", "axis_up": "Y",
           "bake_space_transform": false, "use_mesh_modifiers": true, "mesh_smooth_type": "FACE",
           "use_tspace": true, "add_leaf_bones": false, "bake_anim": false },
  "naming": { "static": "SM_", "skeletal": "SK_" },
  "collision": { "style": "ue", "prefixConvex": "UCX_", "prefixBox": "UBX_", "prefixSphere": "USP_" },
  "lod": { "style": "separateFiles", "suffix": "_LOD{n}" },
  "requireLightmapUv": true, "lightmapMarginPx": 4, "lightmapRes": 64,
  "pivot": "keep", "exportAtOrigin": true, "maxMaterials": 8 }
```

| Preset | Định dạng | Collision | LOD |
|---|---|---|---|
| `ue5` | FBX | `UCX_<Mesh>_00` (convex), `UBX_`, `USP_` | file riêng `SM_X_LOD1.fbx` (UE gộp LOD bằng tay hoặc qua Import LOD) |
| `unity` | FBX, `apply_scale_options: "FBX_SCALE_ALL"`, `bake_space_transform: true` (tránh xoay −90° X) | không sinh (Unity thêm collider trong engine); tùy chọn xuất mesh `<Mesh>_Collider` | trong **cùng FBX**: con tên `<Mesh>_LOD0`, `_LOD1`… (Unity tự tạo LODGroup) |
| `godot` | GLB (`export_format: "GLB"`, `export_apply: true`) | hậu tố tên `-convcolonly` (convex) / `-colonly` | không sinh (Godot tự sinh mesh LOD khi import) |

**Cảnh báo cho agent**: giá trị trục và scale ở trên là **giá trị khởi đầu**. P5 bắt buộc kiểm chứng
bằng import thật vào từng engine người dùng có: mesh đúng kích thước 1 m, đúng hướng, không xoay thừa. Sửa
preset theo kết quả và ghi vào PROGRESS.md.

## 5. Collision và LOD (`core/collision.py`, `core/lod.py`)

- **Convex**:
  - mỗi phần rời (loose part) một hull, hoặc gộp toàn mesh (tùy chọn);
  - `bmesh.ops.convex_hull`;
  - giảm số mặt tới `maxHullFaces` (mặc định 64) bằng Decimate (collapse) trên bản hull;
  - đặt tên theo preset, chỉ số `_00`, `_01`…;
  - cùng collection, parent tùy chọn, `display_type = WIRE`, `hide_render = True`.
- **Box / Sphere**: theo bbox cục bộ.
- **LOD**:
  - nhân bản mesh, thêm Decimate collapse theo `ratios` (mặc định `[1.0, 0.5, 0.25, 0.12]`);
  - **không apply** cho đến khi export (giữ khả năng chỉnh);
  - đặt tên theo preset; báo số tri.

## 6. Batch export (`core/export.py`)

- **Mode**: `perObject` | `perCollection` | `selection` (một file).
- **Với mỗi đơn vị**:
  1. Chạy check. Có issue `error` thì bỏ qua đơn vị đó (trừ khi `force`).
  2. Nếu `exportAtOrigin`: lưu `matrix_world` của root, đặt location về 0, export, **khôi phục** (dùng `try/finally`).
  3. Gọi `bpy.ops.export_scene.fbx` hoặc `export_scene.gltf` với `use_selection=True` trên đúng tập object
     (mesh + collision + LOD tùy preset).
  4. Tên file: `{prefix}{name}.{ext}`, thư mục `{exportDir}/{collection?}/`.
- **Report** `trident_report.json`: file, object, tri, material, issue, preset, thời gian, phiên bản Blender.
- Không ghi đè file mới hơn `.blend` trừ khi bật `overwrite`.

## 7. UI (N-panel tab "Trident")

1. **Preset**: dropdown, thư mục export, mode.
2. **Validate**: nút Validate (selection / visible / all), danh sách issue (`UIList`) nhóm theo object, mỗi dòng có
   Select / Fix, nút Fix all fixable.
3. **Collision**: kiểu, max faces, Generate, Remove.
4. **LOD**: tỉ lệ, Generate, Remove, bảng số tri.
5. **Export**: Export, dry-run (liệt kê file sẽ ghi), mở thư mục export.

Kết quả validate lưu vào `Scene.trident.issues` (CollectionProperty) để UIList hiển thị. Validate lại khi bấm,
không tự chạy liên tục.

## 8. CLI (`cli/trident_cli.py`)

```
blender -b scene.blend --python-exit-code 1 -P cli/trident_cli.py -- --preset ue5 [--validate] [--fix] [--export <dir>] [--mode perCollection] [--fail-on warn|error] [--report r.json]
```
- In bảng issue ra stdout.
- `sys.exit(1)` khi có issue ở mức `--fail-on`.
- `--fix` chỉ áp các fix an toàn (không áp `armature-scale`) và **không lưu .blend** trừ khi có `--save`.

## 9. Các phase

### P0 — Scaffold
1. Tạo repo theo Phần B.2: `blender_manifest.toml`
   (`id = "trident_export"`, `name = "Trident"`, `version = "0.1.0"`, `type = "add-on"`,
   `blender_version_min = "4.2.0"`, `license = ["SPDX:GPL-3.0-or-later"]`).
   *Ghi chú*: add-on Blender dùng `bpy` thường phải theo GPL; hỏi người dùng Q3.
2. `tests/run_tests.py` + một test rỗng; `scripts/build.ps1`.
3. Tìm Blender (BLENDER_PATH hoặc Program Files) và ghi đường dẫn vào PROGRESS.md.
**Xong khi**: `blender -b --factory-startup --python-exit-code 1 -P tests/run_tests.py` chạy xanh;
`blender --command extension build` tạo được zip.

### P1 — Check engine
Mọi check ở §3 (chưa có fix). Test dựng scene bằng bpy cho từng check (ví dụ cube scale 2 → `transform-unapplied`;
mặt 5 đỉnh → `ngons`; cube lật normal → `normals-inverted`; UV1 hai đảo chồng → `lightmap-uv-overlap`).
**Xong khi**: mỗi check có test dương và test âm.

### P2 — Fix + UI Validate
Fix cho các check fixable (một bước undo cho Fix all), N-panel Validate. **Xong khi**: U1, U2 (test fix: chạy fix →
check lại → hết issue).

### P3 — Batch export + preset + report
§4, §6. Test: export một cube → file tồn tại, report đúng; `exportAtOrigin` khôi phục vị trí.
**Xong khi**: U5 từ UI.

### P4 — CLI (MVP, v0.1.0)
§8 + test chạy CLI bằng `subprocess` trong test runner. Build zip + `SHA256SUMS.txt`; đưa vào catalog
(Phần B.4) khi người dùng cho phép phát hành. **Xong khi**: U6.

### P5 — Kiểm chứng preset trong engine
Người dùng import file xuất ra vào UE5, Unity và Godot (những engine họ có). Agent hướng dẫn từng bước, sửa
preset theo kết quả. **Xong khi**: mỗi preset có dòng "verified in <engine version> on <date>" trong PROGRESS.md.

### P6 — Collision + LOD
§5 + UI + test (hull có ≤ maxHullFaces; LOD tri giảm đúng tỉ lệ ±10%). **Xong khi**: U3, U4. Phát hành v0.2.0.

## 10. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Engine nào cần preset (UE5 / Unity / Godot)? | P3 |
| Q2 | Quy ước tên hiện tại của bạn (SM_/SK_/…)? | P1 |
| Q3 | Giấy phép cho add-on: GPL-3.0-or-later (thông lệ của add-on Blender) được không? | P0 |
| Q4 | Ngân sách tri mặc định theo loại asset? | P1 |

## 11. Rủi ro
- **Exporter của Blender đổi tên tham số giữa các phiên bản** → bọc lời gọi, lọc tham số theo
  `bpy.ops.export_scene.fbx.get_rna_type().properties` trước khi truyền, ghi warn khi một tham số không còn.
- **Apply transform trên mesh dùng chung data làm hỏng object khác** → luôn kiểm `data.users > 1` trước khi fix.
