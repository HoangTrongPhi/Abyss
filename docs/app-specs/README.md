# App specs — bộ công cụ pipeline game của Abyss

Spec cho các app và add-on sắp tới. Mỗi file viết sao cho **một agent ở bất kỳ session nào** đọc xong là làm
được, không cần lịch sử hội thoại.

## Các file

| # | File | Loại | Phụ thuộc | MVP | Trạng thái |
|---|---|---|---|---|---|
| — | [00_SHARED_FRAMEWORK.md](00_SHARED_FRAMEWORK.md) | Quy ước chung (Tauri app + Phần B add-on) | — | — | tham chiếu |
| 0 | [00_TEMPLATE_UPGRADE.md](00_TEMPLATE_UPGRADE.md) | Nâng cấp `templates/tauri-app`: CLI, `?mock`, watch, job, log | — | T1–T5 | xong (2026-10-29) |
| 1 | [01_CORAL.md](01_CORAL.md) | App: sprite atlas & animation 2D | #0 | P5 | P0–P10 xong; chờ kiểm chứng engine + phát hành 0.1.0 |
| 2 | [02_CONCH.md](02_CONCH.md) | App: localization & font | #0 | P5 | chưa làm |
| 3 | [03_SIREN.md](03_SIREN.md) | App: audio lint & batch | #0 | P5 | chưa làm |
| 4 | [04_KRAKEN.md](04_KRAKEN.md) | App: build size & frame time | #0 | P4 | chưa làm |
| 5 | [05_LIGHTHOUSE.md](05_LIGHTHOUSE.md) | App: ảnh store & marketing | #0 | P4 | chưa làm |
| 6 | [06_SONAR.md](06_SONAR.md) | App: heatmap playtest + SDK engine | #0 | P5 | chưa làm |
| 7 | [07_NAUTILUS.md](07_NAUTILUS.md) | App: dữ liệu game & balancing | #0 | P5 | chưa làm |
| 8 | [08_ADDON_TRIDENT.md](08_ADDON_TRIDENT.md) | Add-on Blender: validate + collision/LOD + batch export | — | P4 | chưa làm |
| 9 | [09_ADDON_COMPASS.md](09_ADDON_COMPASS.md) | Add-on Blender: texel density & UV | — | P3 | chưa làm |
| 10 | [10_POSEIDON_ADDITIONS.md](10_POSEIDON_ADDITIONS.md) | Poseidon: VRAM budget, LOD glTF, tileable | — | từng phần | chưa làm |

Cột *Trạng thái* chỉ là tổng quan; trạng thái chi tiết nằm trong `docs/PROGRESS.md` của từng app.

## Thứ tự

```
00_TEMPLATE_UPGRADE ──► Coral ──► Conch ──► Siren ──► Kraken ──► Lighthouse ──► Sonar ──► Nautilus
                         (các app độc lập với nhau; thứ tự trên là ưu tiên, không phải phụ thuộc)

Trident, Compass, Poseidon additions: độc lập, làm lúc nào cũng được (không cần template upgrade)
```

**Chạy song song nhiều session được, với ba lưu ý:**
1. `npm run new-app` sửa `Abyss/catalog/catalog.json`, nên **tạo từng app một**, không tạo hai app cùng lúc.
2. Khi một app cần thêm component vào `@abyss/ui`, làm thành thay đổi nhỏ riêng trong Abyss. Không để hai
   session cùng sửa `packages/abyss-ui` một lúc.
3. Catalog chỉ còn 5 slot trống. App thứ 6 và 7 sẽ được `create-app` thêm vào cuối danh sách (không cần slot).

## Cách giao việc cho một session (copy và sửa tên)

**Bắt đầu hoặc làm tiếp một app:**
```
Đọc P:\Phineas_LIB\Gogo_Gadgets\Abyss\docs\app-specs\00_SHARED_FRAMEWORK.md
và P:\Phineas_LIB\Gogo_Gadgets\Abyss\docs\app-specs\01_CORAL.md.
Làm phase tiếp theo theo docs/PROGRESS.md của Coral (chưa có app thì bắt đầu P0).
Xong thì chạy npm run check, cập nhật PROGRESS.md và báo lại cho tôi.
```

**Làm một phase cụ thể:**
```
Theo spec P:\Phineas_LIB\Gogo_Gadgets\Abyss\docs\app-specs\03_SIREN.md, làm đúng Phase P3 của Siren.
```

**Nâng cấp template (việc đầu tiên):**
```
Làm P:\Phineas_LIB\Gogo_Gadgets\Abyss\docs\app-specs\00_TEMPLATE_UPGRADE.md từ T1 đến T5.
```

**Trả lời câu hỏi mở trước để session không phải dừng lại hỏi:**
```
Coral — Q1: Unity 6000.0 LTS (file .meta mẫu ở D:\…\sheet.png.meta). Q4: 32 PPU.
Ghi vào mục Decisions của PROGRESS.md rồi làm P3.
```

**Phần bổ sung Poseidon:**
```
Làm phần A (VRAM budget) trong P:\Phineas_LIB\Gogo_Gadgets\Abyss\docs\app-specs\10_POSEIDON_ADDITIONS.md.
```

## Quy ước của mọi spec

- Mỗi app có các mục: mục tiêu / ngoài phạm vi, luồng chính (U1…), mô hình dữ liệu và format, kiến trúc (core,
  commands, UI), CLI, watch, **các phase có checklist "Xong khi"**, câu hỏi mở (Q…), rủi ro.
- Phase làm theo thứ tự. Phase MVP kết thúc bằng bản phát hành `0.1.0` (chỉ khi người dùng cho phép).
- Con số hoặc định dạng ngoài thực tế chưa chắc chắn (kích thước store, cột log của engine, trục xuất FBX) được
  đánh dấu **"kiểm chứng"**. Agent phải xác minh, ghi nguồn, không đoán.
- Người dùng đã từ chối và không đưa lại: TechForge trong launcher, shared Rust engine, workspace chung /
  `gogo://` deep links.
