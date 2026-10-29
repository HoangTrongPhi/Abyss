# Siren — Game audio linter & batch processor

> **Ưu tiên**: 3 · **Dùng cho**: SFX, VO, nhạc của mọi game · **MVP**: hết P5 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Tạo app**:
> `npm run new-app -- "Siren" --tagline "Game audio linter & batch processor" --category "Audio" --spec docs/app-specs/03_SIREN.md`

## 1. Mục tiêu

Quét thư mục audio của game, chỉ ra mọi lỗi kỹ thuật:
- stereo giả;
- SFX 3D không phải mono;
- khoảng lặng đầu file;
- clipping, DC offset;
- loudness lệch chuẩn.

Sau đó sửa hàng loạt bằng một chuỗi xử lý lưu thành preset. Siren còn tách file dài theo khoảng lặng,
làm loop liền mạch, tạo biến thể và đổi tên theo quy ước. Có CLI cho CI và watch thư mục "Incoming".

### Ngoài phạm vi v1
- Mã hóa Opus (cần libopus C) và MP3: v1 chỉ ghi WAV và OGG Vorbis (FLAC tùy chọn).
- Hiệu ứng sáng tạo (reverb, EQ đầy đủ), time-stretch giữ pitch.
- Tích hợp Wwise/FMOD project: chỉ xuất CSV/TSV danh sách file.

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Kéo thư mục `Audio/` vào → Lint với profile mặc định | Bảng mọi file kèm số đo và issue: 37 SFX stereo giả, 12 file im lặng đầu > 10 ms, 3 file clip |
| U2 | Chọn 37 file stereo giả → Fix: chuyển mono | 37 file mono ở thư mục output (dung lượng giảm khoảng 50%), có dry-run |
| U3 | Tạo chain: trim → fade 5 ms → normalize −18 LUFS (TP ≤ −1 dBTP) → OGG q6 → lưu `sfx.siren.json` | Chạy cho cả thư mục; báo file nào không đạt target vì giới hạn true peak |
| U4 | Kéo `footsteps_session.wav` (3 phút) → Split by silence | 48 file `SFX_Footstep_Grass_01..48.wav`, chỉnh được vùng cắt trên waveform trước khi ghi |
| U5 | Kéo `music_loop.wav` → Loop: tìm điểm loop + crossfade 50 ms | Nghe thử chỗ nối, ghi WAV có chunk `smpl` |
| U6 | Chọn `impact.wav` → Variations ×6 (pitch ±150 cent, gain ±2 dB) | `impact_v01..v06.wav` |
| U7 | Bật Watch trên `Incoming/` với chain `sfx.siren.json` → output `Game/Assets/Audio/SFX` | File thả vào Incoming được xử lý tự động |
| U8 | CI: `siren lint Assets/Audio --profile rules.siren.json --fail-on error` | Mã thoát 1 nếu có lỗi |

## 3. Số đo cho mỗi file (`AudioFacts`)

| Trường | Cách tính |
|---|---|
| `container`, `codec`, `sampleRate`, `bitDepth`, `channels`, `durationMs`, `fileSize` | metadata khi decode (`symphonia`) |
| `peakDbfs` | max |sample| → 20·log10 |
| `truePeakDbtp` | `ebur128` mode `TRUE_PEAK` (oversample ×4) |
| `integratedLufs`, `lra` | `ebur128` mode `I`, `LRA`. File < 400 ms: integrated không xác định → `null` |
| `maxMomentaryLufs`, `maxShortTermLufs` | dùng cho SFX ngắn thay cho integrated |
| `dcOffset` | trung bình mẫu mỗi kênh (tuyệt đối, max theo kênh) |
| `clippedRuns` | số đoạn ≥ 3 mẫu liên tiếp có |x| ≥ 0.999 |
| `leadingSilenceMs`, `trailingSilenceMs` | mẫu đầu/cuối vượt ngưỡng (mặc định −60 dBFS) |
| `stereo` | `{ identical: bool /* max\|L−R\| < 1e-5 */, correlation: f32, inverted: bool /* corr < −0.9 */ }` |
| `waveform` | 1000 bucket `[min, max]` mỗi kênh cho UI (lấy theo yêu cầu, không đưa vào report) |

Phân tích chạy song song (`rayon`), **streaming** (không nạp cả file dài vào RAM). Cache theo
`(path, size, mtime)` ở `app_data_dir()/facts-cache.json`.

## 4. Profile lint `*.siren.json` (`format: "siren.profile"`)

```jsonc
{
  "format": "siren.profile", "version": 1,
  "groups": [
    { "name": "SFX 3D", "match": ["SFX/World/**", "SFX/Weapons/**"],
      "rules": { "channels": "mono", "leadingSilenceMaxMs": 10, "loudness": { "metric": "maxShortTerm", "target": -18, "tolerance": 3 },
                 "truePeakMax": -1.0, "sampleRates": [48000], "clipping": "error", "naming": "^SFX_[A-Z][A-Za-z]+_[A-Za-z0-9]+(_\\d{2})?$" } },
    { "name": "UI", "match": ["SFX/UI/**"], "rules": { "leadingSilenceMaxMs": 5, "durationMaxMs": 3000 } },
    { "name": "Music", "match": ["Music/**"], "rules": { "channels": "stereo", "loudness": { "metric": "integrated", "target": -24, "tolerance": 2 } } },
    { "name": "VO", "match": ["VO/**"], "rules": { "channels": "mono", "loudness": { "metric": "integrated", "target": -24, "tolerance": 2 } } }
  ],
  "defaults": { "silenceThresholdDb": -60, "dcOffsetMax": 0.01 }
}
```

**Issue code**:
- `stereo-fake` (L == R; fix: mono) — warn
- `channels-mismatch` — error
- `stereo-inverted` — warn
- `leading-silence` (fix: trim) — warn
- `trailing-silence` (fix: trim) — info
- `clipping` — error
- `true-peak` — warn
- `loudness-out-of-range` (fix: normalize) — warn
- `sample-rate` (fix: resample) — warn
- `dc-offset` (fix: remove DC) — warn
- `naming` — warn
- `duration-max` — warn
- `decode-failed` — error

**Preset loudness đi kèm** (*phải kiểm chứng lại con số với tài liệu ASWG-R001 trước khi phát hành, ghi
nguồn vào FORMATS.md*): "Console/PC: −24 LUFS ±2, TP ≤ −1 dBTP" và "Mobile: −18 LUFS ±2, TP ≤ −1 dBTP".
Đây là target **toàn bộ mix**. Với asset lẻ, đặt target trong profile theo kinh nghiệm của dự án.

## 5. Chuỗi xử lý `*.siren.json` (`format: "siren.chain"`)

```jsonc
{ "format": "siren.chain", "version": 1,
  "steps": [
    { "kind": "trim", "thresholdDb": -60, "keepPreRollMs": 2, "end": true },
    { "kind": "removeDc" },
    { "kind": "toMono", "mode": "auto" },            // auto: lấy L nếu stereo giả, ngược lại (L+R)/2
    { "kind": "fade", "inMs": 2, "outMs": 5, "curve": "equalPower" },
    { "kind": "normalizeLoudness", "metric": "maxShortTerm", "target": -18, "truePeakCeiling": -1.0 },
    { "kind": "resample", "rate": 48000 },
    { "kind": "bitDepth", "bits": 16, "dither": "tpdf" },
    { "kind": "encode", "format": "ogg", "quality": 6 }   // wav | ogg | flac
  ],
  "output": { "dir": "../Game/Assets/Audio", "keepStructure": true, "naming": "{name}", "overwrite": false } }
```

- `normalizeLoudness`: gain = target − đo được. Nếu sau gain true peak > ceiling thì **giảm gain cho
  vừa ceiling** và ghi issue `target-not-reached` (kèm số dB thiếu). v1 **không có limiter**.
- `resample`: `rubato` (sinc, chất lượng cao). `bitDepth`: dither TPDF khi giảm bit.
- `encode`: WAV qua `hound`; OGG qua `vorbis_rs` (quality −1..10); FLAC qua `flacenc` (tùy chọn, P10).
- Mọi bước chạy trên buffer `f32` đa kênh, rồi encode một lần ở cuối.

## 6. Kiến trúc

### 6.1 Rust core
| File | Nội dung |
|---|---|
| `decode.rs` | `symphonia` (wav, flac, mp3, ogg/vorbis, aiff, pcm) → stream khung f32 |
| `analyze.rs` | `AudioFacts` theo §3; streaming; `ebur128` |
| `lint.rs` | profile, match glob theo đường dẫn tương đối, issue |
| `dsp/{trim,fade,mono,dc,gain,resample,dither}.rs` | các bước |
| `chain.rs` | chạy chain, dry-run (tính kết quả dự kiến: độ dài, LUFS dự kiến, đường dẫn output) |
| `encode/{wav,ogg,flac}.rs` | ghi file nguyên tử |
| `split.rs` | vùng theo silence: ngưỡng dB, `minSilenceMs`, `minClipMs`, `padMs` |
| `looping.rs` | tìm điểm loop, crossfade, ghi chunk `smpl` |
| `variations.rs` | pitch (resample-based, đổi cả độ dài), gain, seed cố định |
| `rename.rs` | pattern `{category}_{name}_{##}` + history để undo (chép ý tưởng từ `Project_P/src-tauri/src/utils/history.rs`) |
| `manifest.rs` | xuất CSV/TSV/JSON danh sách file và số đo |

Crate: `symphonia` (features cần thiết), `hound`, `ebur128`, `rubato`, `vorbis_rs`, `rayon`, `globset`,
`regex`, `rand` (`StdRng` có seed).

### 6.2 Commands

| Command | Mô tả |
|---|---|
| `scan_audio(folder, { recursive })` → `AudioFacts[]` | event `siren://progress`; dùng cache |
| `waveform(path, buckets)` → `Float32Array` (raw bytes) | |
| `lint(folder, profile)` → `LintReport` | |
| `run_chain(files[], chain, { dryRun })` → `ChainReport` | job `chain` |
| `preview_chain(file, chain)` → đường dẫn WAV tạm trong `app_data_dir()/preview/` | nghe A/B |
| `detect_splits(file, SplitOptions)` → `Region[]` | |
| `apply_splits(file, regions[], { outDir, naming, dryRun })` | |
| `find_loop(file, LoopOptions)` → `LoopCandidate[]` (start, end, score) | |
| `write_loop(file, { start, end, crossfadeMs, out, dryRun })` | |
| `make_variations(file, VariationOptions)` | |
| `plan_rename(files[], pattern)` / `apply_rename(plan)` / `undo_rename(folder)` | |
| `export_manifest(folder, { format, columns[] })` | |
| `load_profile` / `save_profile` / `load_chain` / `save_chain` | |
| `watch_start({ action: { kind: "processIncoming", chain, inbox } })` | |

### 6.3 UI

| Hotkey | Module | Nội dung |
|---|---|---|
| 1 | **Library** | bảng virtualized (tên, nhóm, kênh, SR, thời lượng, LUFS, TP, im lặng đầu, issue), waveform của file chọn, phát (`<audio src=convertFileSrc>`), nút phát nhanh (Space) |
| 2 | **Lint** | chọn profile, issue nhóm theo code, chọn hàng loạt → "Fix selected" sinh chain tạm |
| 3 | **Process** | editor chain (thêm, xóa, kéo đổi thứ tự bước, form theo `kind`), A/B (bản gốc / qua chain, cân bằng độ to khi so sánh), dry-run bảng kết quả dự kiến |
| 4 | **Split** | waveform lớn, vùng cắt kéo sửa được, ngưỡng có thanh trượt và cập nhật trực tiếp, mẫu đặt tên |
| 5 | **Loop** | waveform với marker start/end, danh sách ứng viên điểm loop (điểm số), phát lặp vô hạn quanh chỗ nối (Web Audio `loopStart`/`loopEnd`) |
| 6 | **Variations & Rename** | biến thể; đổi tên có preview, undo |

Phát và so sánh dùng Web Audio (`decodeAudioData` trên bytes đọc qua asset protocol). Waveform vẽ
bằng canvas từ dữ liệu `waveform`.

## 7. Đặc tả quan trọng

### 7.1 Chunk `smpl` (loop trong WAV)
- Thêm chunk `smpl` vào sau chunk `data` rồi cập nhật kích thước RIFF.
- Header 36 byte: `manufacturer=0, product=0, samplePeriod=1e9/sampleRate (ns), midiUnityNote=60, midiPitchFraction=0, smpteFormat=0, smpteOffset=0, numSampleLoops=1, samplerData=0`.
- Tiếp theo một loop 24 byte: `cuePointId=0, type=0 (forward), start=<sample frame>, end=<sample frame, inclusive>, fraction=0, playCount=0`.
- Little-endian. Test: đọc lại và so giá trị.
- Godot 4 đọc loop này khi import WAV với *Loop Mode = Detect From WAV* (người dùng kiểm chứng một lần).
- OGG: tùy chọn ghi Vorbis comment `LOOPSTART` / `LOOPLENGTH` (tính theo sample).

### 7.2 Tìm điểm loop
- Cửa sổ so sánh W = 2048 mẫu.
- Ứng viên `end` trong `[len − search, len]`: zero-crossing cùng chiều dốc với `start`.
- Điểm số = cross-correlation chuẩn hóa giữa W mẫu trước `end` và W mẫu trước `start`, trừ hình phạt chênh
  RMS. Trả top 5.
- Crossfade equal-power: trộn đoạn `[end − xf, end]` với `[start − xf, start]` (khi `start ≥ xf`), hoặc
  dùng đoạn đầu file.

### 7.3 Tách theo silence
RMS trên khung 10 ms, so với ngưỡng dB → vùng có tiếng → gộp vùng cách nhau < `minSilenceMs` → bỏ vùng
< `minClipMs` → nới mỗi vùng thêm `padMs` (không chồng nhau).

## 8. CLI

```
siren lint <folder> [--profile p.siren.json] [--fail-on warn|error] [--report r.json] [--csv facts.csv]
siren process <files|folder> --chain c.siren.json [--out <dir>] [--dry-run] [--report r.json] [--watch]
siren split <file> [--threshold -50] [--min-silence 300] [--min-clip 80] [--pad 20] --out <dir> [--naming "{base}_{##}"]
siren loop <file> [--crossfade 50] [--search 2.0] --out <file.wav>
siren variations <file> --count 6 [--pitch-cents 150] [--gain-db 2] [--seed 1] --out <dir>
siren stats <folder> --out facts.csv
```

## 9. Watch

- Action `processIncoming`: thư mục inbox + chain + output.
- File mới hoặc đổi (đã settle) → chạy chain cho file đó → (tùy chọn) chuyển file gốc vào `inbox/_done/`.
  Chỉ chuyển, không xóa.
- Output nằm ngoài inbox, hoặc nằm trong danh sách exclude, để tránh vòng lặp.

## 10. Các phase

### P0 — Scaffold
1. Tạo app; 6 module rỗng; thêm crate (kiểm tra `vorbis_rs` build được trên MSVC; nếu lỗi, ghi lại và hỏi
   người dùng Q3).
2. `scripts/gen-samples` (test Rust `#[ignore]` hoặc bin nhỏ) sinh WAV mẫu vào `sample-assets/`:
   - sine 440 Hz stereo giả;
   - stereo thật (L 440, R 660);
   - file có 120 ms im lặng đầu;
   - file clip;
   - file DC offset 0.05;
   - chuỗi 6 tiếng "click" cách nhau 400 ms (cho Split);
   - loop nhạc tổng hợp 4 giây.
**Xong khi**: `npm run check` xanh, có file mẫu.

### P1 — Decode + analyze
1. `decode.rs` streaming; test với WAV 16/24/32f, FLAC, OGG (sinh bằng encoder ở P3, hoặc fixture nhỏ).
2. `analyze.rs`:
   - test sine 1 kHz full scale → peak ≈ 0 dBFS;
   - test LUFS: sine 1 kHz −20 dBFS mono → khoảng −23 LUFS (dung sai 0.5; ghi rõ công thức kỳ vọng trong
     test). *Lưu ý cho agent*: kiểm lại giá trị kỳ vọng bằng cách tính, đừng đoán;
   - stereo giả, DC, leading silence đúng tới ±1 ms.
3. Cache facts; `scan_audio` + mock.
**Xong khi**: test số đo xanh; 1000 file SFX ngắn quét dưới 5 giây (release).

### P2 — Lint
1. Profile, glob, mọi issue code §4; profile mặc định nhúng sẵn.
2. Commands `lint`, mock; module Library + Lint (bảng, waveform, phát).
**Xong khi**: luồng U1 trên `sample-assets`.

### P3 — DSP + chain + encode
1. Các bước ở §5, mỗi bước có test (trim: độ dài sau trim; fade: mẫu đầu = 0; mono: L=R; normalize: LUFS sau
   xử lý trong ±0.3 dB, hoặc báo `target-not-reached`; resample: độ dài × tỉ lệ ±1 mẫu).
2. Encode WAV/OGG; ghi nguyên tử; giữ cấu trúc thư mục.
3. `run_chain` + dry-run, `preview_chain`.
**Xong khi**: luồng U2, U3 từ CLI.

### P4 — CLI + watch
1. `lint`, `process`, `stats` kèm test; watch `processIncoming`.
**Xong khi**: luồng U7, U8.

### P5 — UI Process (MVP, v0.1.0)
1. Module Process: editor chain, A/B, dry-run.
2. "Fix selected" từ Lint sinh chain.
3. Mock đầy đủ (waveform giả sinh bằng sin trong TS).
4. Phát hành 0.1.0.
**Xong khi**: U1–U3, U7, U8 chạy trên app thật.

### P6 — Split
`split.rs` + module Split (vùng kéo sửa được) + CLI. **Xong khi**: luồng U4, test ra đúng 6 vùng trên file click.

### P7 — Loop
`looping.rs`, chunk `smpl`, module Loop (phát lặp quanh chỗ nối) + CLI. **Xong khi**: luồng U5, test smpl round-trip.

### P8 — Variations + Rename + Manifest
**Xong khi**: luồng U6; rename có undo; CSV manifest mở được trong Excel (UTF-8 BOM).

### P9 — Hoàn thiện, v0.2.0
User guide; kiểm chứng preset ASWG; phát hành.

### P10 — (Tùy chọn) FLAC encode, Opus
Hỏi người dùng trước.

## 11. Câu hỏi mở

| # | Câu hỏi | Phase |
|---|---|---|
| Q1 | Engine nào, và đọc loop WAV hay dùng loop trong engine? | P7 |
| Q2 | Target loudness của dự án (nếu đã có) cho SFX/VO/Music? | P2 |
| Q3 | Nếu `vorbis_rs` không build được: chấp nhận dùng `oggenc` ngoài, hay chỉ xuất WAV? | P0/P3 |
| Q4 | Quy ước đặt tên file audio đang dùng? | P2 |

## 12. Rủi ro
- **LUFS của file rất ngắn không có nghĩa** → dùng `maxShortTerm` hoặc `maxMomentary` cho SFX; UI ghi rõ
  metric đang dùng.
- **Pitch bằng resample đổi độ dài** → ghi rõ trong UI. Time-stretch thật để ngoài phạm vi.
- **Encoder C (libvorbis) kéo dài build và thời gian CI** → cache build trong CI; nếu thất bại, theo Q3.
