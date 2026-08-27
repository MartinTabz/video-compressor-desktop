# Web Video Compressor — Project Specification

> **Setup note:** Commit this file to the repository root as `CLAUDE.md`. Claude Code loads it automatically into every session, so the phase prompts can stay short and reference it.

---

## What this is

A macOS desktop application that helps a **marketing team** compress video for the web. It is a friendly GUI wrapper around ffmpeg.

**The users are non-technical.** They must never see the words CRF, bitrate, codec, container, or pixel format anywhere in the interface. Every setting is expressed in plain language with an explanation of what to expect.

All UI copy is in **Czech**. All code, comments, commit messages, and identifiers are in **English**.

---

## ⚠️ Primary use case: VERTICAL video

The main input is **vertical video (9:16, filmed on a phone)** — customer testimonials that go into a social-proof carousel on a landing page. Horizontal video must also work correctly, but vertical is the default assumption and the case to optimize and test for first.

This matters because the most common bug in this kind of tool is scaling a vertical video **up** instead of down:

```
❌ scale=1280:-2   on a 1080×1920 clip  →  1280×2276  (upscaled, file gets bigger)
✅ scale=540:960   explicit even numbers, computed from real display dimensions
```

**Hard rules:**

1. **Never hardcode `-2` or a fixed dimension in the scale filter.** Always compute both width and height in the frontend and pass concrete integers.
2. **Read rotation metadata.** Phone video is frequently stored as 1920×1080 with a `rotation` of ±90 in side data. The real display dimensions are the swapped ones. If `abs(rotation) == 90`, swap width and height before doing anything else.
3. **Detect orientation explicitly** (`portrait` | `landscape` | `square`) and store it in the video metadata model. Resolution presets are computed from the **longer side**, so they behave identically for both orientations.
4. **Both output dimensions must be even numbers.** `yuv420p` halves chroma resolution and the encoder rejects odd values. Round down to the nearest even integer.
5. **Never allow upscaling.** Cap every dimension input at the source resolution.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Tauri v2** |
| Frontend | **React 18 + TypeScript + Vite** |
| Styling | **Tailwind CSS** |
| Icons | `lucide-react` |
| File dialogs | `tauri-plugin-dialog` |
| Process spawning | `tauri-plugin-shell` (sidecar) |
| Settings persistence | `tauri-plugin-store` |

No heavy UI component library. Write the components by hand.

**Platform:** macOS first (Apple Silicon and Intel). Write platform-agnostic code — use `PathBuf`, never hardcoded path separators — so a Windows build can be added later without a rewrite.

---

## Non-negotiable ffmpeg flags

These are always applied regardless of user choices:

| Flag | Why |
|---|---|
| `-c:v libx264` | Maximum compatibility, including in-app browsers |
| `-profile:v main` | Older devices and Meta/Instagram in-app webviews |
| `-pix_fmt yuv420p` | Without this Safari refuses to play the file |
| `-movflags +faststart` | Without this the browser must download the entire file before playback starts |
| `-progress pipe:1 -nostats` | Machine-readable progress output |
| `-y` | Overwrite (the UI handles confirmation) |

---

## Quality mapping

The UI shows a **percentage**, never a CRF number.

```ts
const crf = Math.round(38 - (qualityPercent / 100) * 20);
// 100% → 18 | 75% → 23 | 50% → 28 | 40% → 30 | 30% → 32 | 0% → 38
```

Default is **40%**.

| Range | Czech label | Czech description |
|---|---|---|
| 85–100% | Maximální kvalita | Prakticky bez ztráty. Velký soubor – pro web zbytečné. |
| 65–84% | Vysoká kvalita | Ostrý obraz, střední velikost. Pro důležitá videa. |
| 45–64% | Vyvážená | Dobrý poměr kvality a velikosti. Bezpečná volba. |
| **25–44%** | **Doporučeno pro web** | Rozdíl je okem téměř nepostřehnutelný. Malý soubor, rychlé načtení. |
| 0–24% | Nízká kvalita | Viditelné čtverečkování. Použij jen když opravdu musíš. |

The recommended band is highlighted directly on the slider track.

---

## Audio logic

| User choice | Flags |
|---|---|
| No audio needed | `-an` |
| Speech only | `-c:a aac -b:a 64k -ac 1` |
| Contains music | `-c:a aac -b:a 128k` |

If the source has no audio stream, skip the audio step entirely.

---

## Encoding speed presets

Presented as **cards with descriptions**, not a dropdown. Default `slow`.

| Value | Czech label | Czech description |
|---|---|---|
| `veryfast` | Rychlé | Hotovo za pár sekund. Soubor bude o něco větší. |
| `medium` | Vyvážené | Rozumný kompromis mezi časem a velikostí. |
| `slow` | **Doporučeno** | Trvá déle, ale soubor bude nejmenší při stejné kvalitě. |
| `veryslow` | Nejmenší soubor | Může trvat i několik minut. Rozdíl oproti „Doporučeno" je malý. |

Note shown below: *„Tohle nastavení neovlivňuje kvalitu obrazu, jen jak dlouho aplikace hledá způsoby, jak soubor zmenšit."*

---

## Project structure

```
├── src/
│   ├── components/
│   │   ├── steps/          # One component per wizard step
│   │   ├── ui/             # Button, Slider, Toggle, Card, ...
│   │   └── Stepper.tsx
│   ├── hooks/
│   │   ├── useVideoMetadata.ts
│   │   └── useEncoder.ts
│   ├── lib/
│   │   ├── ffmpegArgs.ts   # buildArgs(config): string[] — pure function
│   │   ├── orientation.ts  # rotation handling, dimension math, presets
│   │   ├── quality.ts      # percent → CRF, band labels
│   │   └── size.ts         # output size estimation
│   ├── types.ts
│   └── App.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── probe.rs        # ffprobe wrapper
│   │   └── encode.rs       # spawn, progress parsing, cancellation
│   ├── binaries/           # gitignored
│   └── tauri.conf.json
├── scripts/
│   └── fetch-binaries.sh
└── README.md
```

---

## Error messages

Human language, never terminal output:

| Situation | Message |
|---|---|
| Unsupported file | „Tento typ souboru neumím zpracovat. Zkus MP4, MOV nebo AVI." |
| ffprobe failed | „Soubor se nepodařilo načíst. Může být poškozený." |
| No write permission | „Do této složky nemám oprávnění zapisovat. Zkus jinou." |
| Output exists | Modal with Přepsat / Zvolit jiný název |
| Missing binary | „Chybí součást aplikace. Spusť prosím `scripts/fetch-binaries.sh`." |

Log full ffmpeg output to the console for debugging. Never surface it in the main UI.

---

## Visual design

**Dark mode only.** Do not build a light theme — it is out of scope and doubles the styling surface for no benefit. Set `color-scheme: dark` so native controls and scrollbars match.

The tone is a calm, precise tool. Modern but not flashy. Restraint everywhere except the one signature element below.

### Color tokens

Define these as CSS custom properties in `src/styles/tokens.css` and map them into `tailwind.config.js`. **Never use a raw hex or a stock Tailwind gray anywhere else in the codebase.**

```css
--bg:          #101218;  /* app background — cool graphite, not pure black */
--surface:     #171A22;  /* cards, panels */
--surface-2:   #1F2430;  /* inputs, hover states */
--border:      #2A303C;  /* hairlines, 1px only */
--text:        #E8EAEF;  /* primary text */
--text-muted:  #8D95A6;  /* labels, help text, descriptions */
--accent:      #E0A742;  /* amber — the single accent */
--accent-soft: #E0A74222;/* accent at 13% for fills and highlights */
--success:     #5FBF8C;
--danger:      #E0715F;
```

Amber is the accent because it reads as "processing / rendering" and stays warm against the cool base. Use it for: the active step, the primary button, the recommended quality band, focus rings, and progress. **Nowhere else.** No gradients, no glows, no colored shadows.

### Typography

Two families, both bundled locally in `src/assets/fonts` — no CDN or Google Fonts request from a desktop app.

- **Geist Sans** — all UI text. Step titles at 24px/600 with `-0.02em` tracking. Body 14px/400. Labels 12px/500 uppercase with `0.06em` tracking, in `--text-muted`.
- **Geist Mono** — every number the user reads as data: dimensions (`540 × 960`), timecodes (`0:41`), frame rates (`24 fps`), file sizes (`3,2 MB`), percentages. This is the vocabulary of video work and it makes the numbers scannable.

Use tabular figures (`font-variant-numeric: tabular-nums`) on anything that updates live, so the progress percentage and size estimate don't jitter.

### Layout and surfaces

- Content column max 620px, centered. The window is not a dashboard — one thing at a time.
- Border radius: **10px** on cards and buttons, **8px** on inputs. Consistent, never mixed.
- Separation comes from `--surface` against `--bg` and 1px `--border` hairlines. **No drop shadows** — they read as cheap on dark backgrounds.
- Spacing on a 4px scale. Generous vertical rhythm: 32px between sections, 12px between a label and its control.

### Signature element: the output shape proxy

The one memorable thing in the app. Because the primary input is vertical video, the app's visual motif is a **tall rectangle**.

A live rectangle rendered at the true output aspect ratio, persistent in the wizard from step 2 onward:

- In **step 2** it morphs as the dimensions change, with the pixel size labelled in mono along its edges
- In **step 4** its interior fill gets subtly noisier as quality drops — a literal preview of the trade-off
- In **step 9** the amber progress fills it **bottom to top**, like a container filling, instead of a conventional horizontal bar

Animate its transitions with a 240ms ease-out. This is where the boldness is spent — keep everything around it quiet.

### Motion

- Step transitions: 200ms fade plus 8px horizontal translate. Nothing longer.
- Hover states: 120ms background shift only. No scale, no lift, no bounce.
- Respect `prefers-reduced-motion` — drop the translate and the shape-proxy animation, keep the fade.

### Quality floor

- Visible keyboard focus on every interactive element: 2px `--accent` ring with 2px offset
- Full keyboard navigation through the wizard, including Enter to advance
- Text contrast at or above 4.5:1 — verify `--text-muted` on `--surface` specifically
- No layout shift when live values (size estimate, progress) update

---

## Test matrix

Every phase must keep these passing:

- ☐ **Vertical 9:16 phone video** — output must be smaller, never upscaled
- ☐ **Vertical video with `rotation: -90` in metadata** — dimensions swapped correctly
- ☐ Horizontal 16:9 video
- ☐ Square 1:1 video
- ☐ Video with no audio stream — audio step is skipped
- ☐ Very short video (< 3 s) — poster frame slider still works
- ☐ Cancelling mid-encode — partial output file is deleted
