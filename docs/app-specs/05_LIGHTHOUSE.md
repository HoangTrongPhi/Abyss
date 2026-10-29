# Lighthouse — Store page & marketing asset generator

> **Ưu tiên**: 5 · **Dùng cho**: phát hành game lên Steam, itch.io, Google Play, mạng xã hội · **MVP**: hết P4 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Tạo app**:
> `npm run new-app -- "Lighthouse" --tagline "Store page & marketing asset generator" --category "Release" --spec docs/app-specs/05_LIGHTHOUSE.md`
> *Ghi chú tên*: "Lighthouse" trùng tên công cụ web của Google. Nếu người dùng muốn đổi (ví dụ "Beacon"),
> đổi trước khi chạy `new-app`.

## 1. Mục tiêu

Từ **một key art cộng một logo**, sinh mọi ảnh store cần, đúng kích thước:
- crop theo điểm focus;
- logo đặt đúng chỗ;
- cảnh báo vùng an toàn.

Lighthouse còn xử lý screenshot hàng loạt, cắt video thành GIF dưới giới hạn dung lượng (hoặc MP4 ngắn),
và đóng gói press kit. Đổi key art thì bấm một nút (hoặc để watch tự chạy) là toàn bộ ảnh được tạo lại.

### Ngoài phạm vi v1
- Upload lên store (Steamworks không có API công khai cho graphical assets).
- Thiết kế đồ họa (chữ nghệ thuật, hiệu ứng). Lighthouse chỉ crop, ghép lớp và resize.
- Bundle ffmpeg: người dùng tự cài, app chỉ tìm và chỉ đường.

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Tạo project: chọn `keyart.png` (4K), `logo.png` (trong suốt), bật preset Steam | Lưới thumbnail mọi ảnh Steam, mỗi ảnh có focal point và logo tự đặt, kèm cảnh báo (logo quá nhỏ ở small capsule) |
| U2 | Mở "Small capsule", kéo logo to hơn, dời focal point | Chỉ ảnh đó được override, còn lại giữ mặc định |
| U3 | Render all | `out/steam/header_capsule_920x430.jpg` … và `out/manifest.json` |
| U4 | Thả thư mục 30 screenshot 4K PNG → preset "Steam screenshots" | 1920×1080 JPG q90, đổi tên `screenshot_01.jpg…`, không metadata |
| U5 | Thả `trailer.mp4`, chọn đoạn 12.0–19.5 s, GIF ≤ 5 MB | `clip.gif` 640 px, 15 fps, 128 màu, 4.7 MB; báo cáo các lần thử |
| U6 | Press kit | `presskit.zip` có logo, screenshot, key art, `factsheet.md` + `factsheet.html` |
| U7 | Watch bật, Photoshop lưu đè `keyart.png` | Mọi ảnh render lại |
| U8 | CLI: `lighthouse render game.lighthouse.json` | Dùng trong script phát hành |

## 3. Preset kích thước

### 3.1 Định dạng `presets/*.json` (đi kèm app; người dùng thêm được trong `app_data_dir()/presets/`)

```jsonc
{ "format": "lighthouse.presets", "version": 1, "store": "steam",
  "source": "https://partner.steamgames.com/doc/store/assets", "verifiedAt": null,
  "items": [
    { "id": "steam.header", "name": "Header capsule", "w": 920, "h": 430, "format": "jpg",
      "logo": "required", "background": "keyart", "safeArea": null, "maxBytes": null },
    { "id": "steam.libraryHero", "name": "Library hero", "w": 3840, "h": 1240, "format": "png",
      "logo": "forbidden", "background": "keyart", "safeArea": null },
    { "id": "steam.libraryLogo", "name": "Library logo", "w": 1280, "h": 720, "format": "png",
      "logo": "only", "background": "transparent" }
  ] }
```

- `logo`: `required` | `optional` | `forbidden` | `only` (chỉ logo, nền trong suốt).
- `safeArea`: rect chuẩn hóa `[x, y, w, h]` (0–1), hoặc `null`.
- **`verifiedAt: null` nghĩa là chưa kiểm chứng.** UI hiện badge "Unverified" và tooltip có link `source`.

### 3.2 Giá trị khởi đầu (agent PHẢI kiểm chứng ở P1 với trang chính thức, rồi điền `verifiedAt` và sửa)

| Store | Mục | Kích thước khởi đầu |
|---|---|---|
| Steam | Header capsule | 920×430 |
| Steam | Small capsule | 462×174 |
| Steam | Main capsule | 1232×706 |
| Steam | Vertical capsule | 748×896 |
| Steam | Page background | 1438×810 |
| Steam | Library capsule | 600×900 |
| Steam | Library header | 920×430 |
| Steam | Library hero | 3840×1240 (không logo) |
| Steam | Library logo | 1280×720 (chỉ logo, PNG trong suốt) |
| Steam | Screenshot | ≥ 1920×1080, 16:9 |
| Google Play | App icon | 512×512 PNG |
| Google Play | Feature graphic | 1024×500 (JPG hoặc PNG 24-bit, không alpha) |
| itch.io | Cover image | 630×500 (tỉ lệ khuyến nghị) |
| Social | X/Twitter card | 1600×900 |
| Social | YouTube thumbnail | 1280×720 |

Epic Games Store, App Store và console: để `items: []` kèm `source`. Chỉ thêm sau khi người dùng cần (Q2) và
đã kiểm chứng.

## 4. Mô hình project `*.lighthouse.json` (`format: "lighthouse.project"`)

```jsonc
{ "format": "lighthouse.project", "version": 1,
  "game": { "title": "Abyss Diver", "developer": "Phineas", "releaseDate": "2027-03-01", "platforms": ["PC"],
            "price": "$14.99", "website": "", "pressContact": "", "description": "", "features": [] },
  "inputs": { "keyart": "art/keyart.png", "logo": "art/logo.png", "logoDark": null, "screenshots": "shots/", "videos": ["video/trailer.mp4"] },
  "defaults": { "focal": [0.5, 0.45], "logoAnchor": "bottomLeft", "logoScale": 0.35, "logoMargin": 0.05,
                "logoScrim": { "enabled": true, "opacity": 0.45 }, "jpgQuality": 90 },
  "presets": ["steam", "googlePlay", "social"],
  "overrides": { "steam.smallCapsule": { "logoScale": 0.6, "focal": [0.55, 0.4], "zoom": 1.2 } },
  "screenshots": { "preset": "steam.screenshot", "naming": "screenshot_{##}", "watermark": null },
  "out": "out/",
  "watch": { "autoStart": false } }
```

## 5. Thuật toán render một ảnh

1. **Nền**:
   - `keyart`: scale nền để **phủ kín** khung đích (cover) × `zoom`; đặt sao cho `focal` (tọa độ chuẩn hóa
     trên key art) nằm đúng tâm khung; kẹp lại để không lộ mép.
   - `transparent`: không nền.
   - `color`: màu đặc.
2. **Scrim** (tùy chọn): dải gradient tối dưới vùng logo, giúp logo đọc được.
3. **Logo**:
   - chiều rộng logo = `logoScale × w`; neo theo 9 điểm (`logoAnchor`), lề `logoMargin × min(w,h)`;
   - `logo: only` → logo nằm giữa, vừa 90% khung, giữ tỉ lệ.
4. **Resize**: `fast_image_resize` (Lanczos3), làm việc trong **sRGB tuyến tính hóa** khi downscale.
   Bước này là bắt buộc, để ảnh không bị tối và gắt.
5. **Ghi**: JPG (chất lượng theo project, không EXIF) hoặc PNG; tên `<store>/<id>_<w>x<h>.<ext>`; ghi nguyên tử.
6. **Cảnh báo**:

   | Code | Điều kiện |
   |---|---|
   | `logo-too-small` | logo cao < 12% chiều cao khung, khi `logo: required` |
   | `logo-outside-safe-area` | logo nằm ngoài `safeArea` |
   | `upscaled` | nền phải phóng to quá 1.0 (key art thiếu độ phân giải) |
   | `alpha-in-jpg` | logo trong suốt bị đặt lên nền trống mà định dạng là JPG |
   | `over-max-bytes` | file vượt `maxBytes` |

## 6. Screenshot hàng loạt
- Đầu vào: thư mục ảnh (png, jpg, bmp, tga).
- Crop về đúng tỉ lệ của preset (giữa ảnh, hoặc theo focal riêng từng ảnh nếu có sidecar), rồi resize
  (Lanczos3, linear-light), rồi ghi JPG q90.
- Cảnh báo `below-min-size` khi ảnh gốc nhỏ hơn mức tối thiểu.
- Watermark góc (tùy chọn): logo nhỏ, opacity.
- Đổi tên theo `naming`, sắp theo natural sort hoặc theo mtime.

## 7. Video → GIF / MP4 (cần ffmpeg)
- Tìm ffmpeg theo §12 khung chung. Không có thì module Video hiện hướng dẫn và link
  `https://ffmpeg.org/download.html`, kèm nút "Locate ffmpeg.exe…".
- **Không dùng `gifski`** (giấy phép AGPL). Dùng hai bước của ffmpeg:
  ```
  ffmpeg -ss <start> -t <dur> -i in.mp4 -vf "fps=<fps>,scale=<w>:-1:flags=lanczos,palettegen=max_colors=<n>:stats_mode=diff" -y palette.png
  ffmpeg -ss <start> -t <dur> -i in.mp4 -i palette.png -lavfi "fps=<fps>,scale=<w>:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=<bayer:bayer_scale=3|sierra2_4a>" -y out.gif
  ```
- **Tìm cấu hình vừa dung lượng**: bắt đầu từ (w, fps, colors) người dùng chọn. Còn vượt `maxMB` thì giảm lần
  lượt colors 256→128→64, rồi fps 20→15→12→10, rồi w ×0.9 mỗi bước (tối đa 12 lần). Báo bảng các lần thử.
  Không đạt được thì issue `size-target-unreachable`.
- MP4: `-c:v libx264 -crf <18–28> -preset slow -pix_fmt yuv420p -movflags +faststart -an` (có tùy chọn giữ
  audio); WebM: `-c:v libvpx-vp9 -crf 32 -b:v 0`.
- Tiến độ: parse `-progress pipe:1` (`out_time_ms`) → event `lighthouse://progress`. Hủy job = kill process.
- Thư mục tạm: `app_data_dir()/tmp/<job>/`, xóa khi xong.

## 8. Press kit
- Cấu trúc zip:
  ```
  presskit/
    factsheet.md
    factsheet.html
    logo/          logo.png, logo_white.png nếu có, logo_1024.png
    key_art/       keyart.png, header_capsule.jpg
    screenshots/
    videos/        link, không chép video lớn trừ khi bật
  ```
- `factsheet.html` tự chứa (CSS inline), lấy dữ liệu từ `game`.

## 9. Kiến trúc

### 9.1 Rust core
`project.rs`, `presets.rs` (nhúng preset mặc định bằng `include_str!` + đọc thư mục user), `compose.rs`
(render §5), `color.rs` (sRGB ↔ linear), `screenshots.rs`, `ffmpeg.rs` (tìm, chạy, parse progress, hủy),
`gif_fit.rs`, `presskit.rs`, `warnings.rs`.

Crate: `image` (png, jpeg), `fast_image_resize`, `zip`, `rayon`.

### 9.2 Commands

| Command | Mô tả |
|---|---|
| `load_project` / `save_project` / `new_project(keyart, logo)` | |
| `list_presets()` → `PresetSet[]` | |
| `render_preview(project, itemId, maxSide)` → PNG bytes + `warnings[]` | nhanh: render ở kích thước nhỏ |
| `render_all(project, { only?, dryRun })` → `RenderReport` | job, event `lighthouse://progress` |
| `process_screenshots(project, { dryRun })` | |
| `probe_video(path)` → `{ durationMs, w, h, fps }` | ffprobe hoặc `ffmpeg -i` |
| `make_gif(GifOptions)` / `make_mp4(Mp4Options)` | job, có hủy |
| `build_presskit(project, out, { includeVideos })` | |
| `find_ffmpeg()` / `get_settings` / `set_settings` | |
| `watch_start({ action: { kind: "renderProject", project } })` | |

### 9.3 UI

| Hotkey | Module | Nội dung |
|---|---|---|
| 1 | **Store art** | lưới thumbnail theo store (badge cảnh báo, badge Unverified); click mở editor: canvas lớn, kéo focal (chấm tròn), lăn chuột để zoom, kéo/scale logo, bật safe-area overlay, Reset override |
| 2 | **Screenshots** | danh sách ảnh nguồn, preset, preview trước/sau, render |
| 3 | **Video** | trình phát `<video src=convertFileSrc>`, chọn in/out (phím I/O), cài đặt GIF/MP4, mục tiêu MB, bảng các lần thử |
| 4 | **Press kit** | form `game`, preview factsheet, build zip |

Preview trong editor **render bằng canvas phía UI** (cùng thuật toán bố cục, dùng drawImage) để mượt khi
kéo. Ảnh cuối cùng do Rust render. Test đảm bảo bố cục (tọa độ logo, crop rect) **trùng khớp** giữa TS và Rust:
cùng hàm bố cục viết hai nơi, kèm bảng test dùng chung `tests/fixtures/layout_cases.json`.

## 10. CLI

```
lighthouse render <project> [--only steam,social] [--dry-run] [--report r.json] [--watch]
lighthouse shots <project> [--dry-run]
lighthouse gif <video> --start 12.0 --end 19.5 [--width 640] [--fps 15] [--max-mb 5] --out clip.gif
lighthouse mp4 <video> --start 12.0 --end 19.5 [--crf 22] [--width 1280] [--audio] --out clip.mp4
lighthouse presskit <project> --out presskit.zip [--include-videos]
lighthouse presets [--store steam]           # in danh sách preset + trạng thái verified
```

## 11. Các phase

### P0 — Scaffold
Tạo app; 4 module rỗng; crate. `sample-assets/`: key art 3840×2160 sinh bằng code (gradient và vài hình khối
để thấy crop), logo 1200×400 PNG trong suốt (chữ "LOGO" vẽ bằng hình khối).
**Xong khi**: `npm run check` xanh.

### P1 — Preset + kiểm chứng
1. `presets.rs` + file preset theo §3.
2. **Kiểm chứng**: mở các trang `source` (Steamworks Graphical Assets, Google Play Console Help về
   graphic assets, itch.io), so từng kích thước, điền `verifiedAt` và sửa số nếu khác. Ghi kết quả vào
   PROGRESS.md (bảng: mục, số cũ, số mới, URL).
**Xong khi**: mọi preset Steam và Google Play có `verifiedAt`.

### P2 — Compose (Rust) + CLI render
1. `compose.rs` theo §5, kèm test bố cục (focal ở tâm khung, cover không lộ mép, logo đúng neo); resize
   linear-light (test: ảnh caro đen/trắng 1px downscale ×2 → xám khoảng 188 sRGB, không phải 128).
2. Cảnh báo §5.6.
3. `lighthouse render`.
**Xong khi**: luồng U3, U8 từ CLI trên sample-assets.

### P3 — Screenshots
§6 + `lighthouse shots`. **Xong khi**: luồng U4.

### P4 — UI Store art + Screenshots + mock (MVP, v0.1.0)
1. Lưới, editor với focal/zoom/logo, overlay, override; hàm bố cục TS dùng chung test fixture với Rust.
2. Module Screenshots.
3. Mock: preview sinh bằng canvas.
4. Phát hành 0.1.0.
**Xong khi**: U1–U4 trên app thật.

### P5 — Video (ffmpeg)
§7: tìm ffmpeg, probe, GIF hai bước, vòng lặp vừa dung lượng, MP4/WebM, tiến độ, hủy.
Test: test có `#[ignore]` chạy khi có ffmpeg, dùng video tổng hợp sinh bằng
`ffmpeg -f lavfi -i testsrc=duration=5:size=1280x720:rate=30`.
**Xong khi**: luồng U5.

### P6 — Press kit + watch
§8 + watch `renderProject` (theo dõi `inputs.*`). **Xong khi**: U6, U7.

### P7 — Hoàn thiện, v0.2.0
User guide, thêm preset người dùng cần (Q2), phát hành.

## 12. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Đổi tên app để tránh trùng "Google Lighthouse"? | trước P0 |
| Q2 | Ngoài Steam / Google Play / itch.io / social, cần store nào (Epic, App Store, Switch…)? | P1/P7 |
| Q3 | Máy đã có ffmpeg chưa, hay để người dùng tự cài? | P5 |
| Q4 | Có logo bản sáng/tối khác nhau không? | P2 |

## 13. Rủi ro
- **Store đổi kích thước** → preset là dữ liệu, có `verifiedAt` và `source`; người dùng sửa được không cần build lại.
- **Màu lệch khi resize** → linear-light, có test.
- **ffmpeg khác phiên bản** → chỉ dùng filter phổ biến (`palettegen`, `paletteuse`, `scale`, `fps`); ghi phiên bản
  ffmpeg vào report.
