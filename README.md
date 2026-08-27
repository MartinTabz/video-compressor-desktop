# Video Kompresor

A macOS desktop app that prepares video for the web. It is a friendly GUI wrapper
around ffmpeg, aimed at a non-technical marketing team.

The interface is in Czech. The code is in English. See `CLAUDE.md` for the full
specification.

---

## Prerequisites

| | |
|---|---|
| **Node.js** | 20.19+ or 22.12+ (Vite 7 requirement) |
| **Rust** | stable, via [rustup](https://rustup.rs) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Xcode command line tools** | `xcode-select --install` |

For a universal build you also need both Rust targets:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

---

## First run

**`./scripts/fetch-binaries.sh` must be run before the first build.**

ffmpeg and ffprobe ship *inside* the app — they are not expected to be installed
on the user's machine. The script downloads static builds for both Apple Silicon
and Intel, names them with the target triple suffix Tauri requires, and verifies
that each one actually executes.

```sh
npm install
./scripts/fetch-binaries.sh
```

The binaries land in `src-tauri/binaries/` and are gitignored:

```
src-tauri/binaries/ffmpeg-aarch64-apple-darwin
src-tauri/binaries/ffprobe-aarch64-apple-darwin
src-tauri/binaries/ffmpeg-x86_64-apple-darwin
src-tauri/binaries/ffprobe-x86_64-apple-darwin
```

The script is safe to re-run: anything already present and valid is skipped, and
anything corrupt is re-downloaded. If the Tauri build ever fails with a confusing
error about a missing external binary, run it again — a missing target triple
suffix is the usual cause.

---

## Development

```sh
npm run tauri dev
```

## Tests

```sh
npm test          # Vitest — dimension math, quality mapping, ffmpeg arguments
cd src-tauri && cargo test   # ffprobe parsing, rotation normalization
```

The frontend suite is pure logic and runs in Node with no DOM. It is the guard
against the one bug that matters most in this app: scaling vertical video *up*
instead of down.

---

## Building

```sh
npm run tauri build
```

Produces a `.dmg` in `src-tauri/target/release/bundle/dmg/`.

### Universal binary

```sh
npm run tauri build -- --target universal-apple-darwin
```

This is the build to hand to the team — one app that runs natively on both Apple
Silicon and Intel Macs. It requires both `rustup` targets listed above, and it
requires all four sidecar binaries to be present.

---

## Licensing

The bundled ffmpeg is a **GPL-licensed** static build (configured with
`--enable-gpl --enable-libx264`). Distributing the app therefore means
distributing GPL software, with everything that implies.

**This app is currently for internal use only.** Before it is ever shipped
outside the company, the licensing needs a proper look — either by complying with
the GPL or by swapping in an LGPL ffmpeg build without libx264 support.

The bundled Geist Sans and Geist Mono fonts are licensed under the SIL Open Font
License; see `src/assets/fonts/LICENSE-Geist.txt`.

---

## Project layout

```
src/                  React frontend
  styles/tokens.css   the only place colour is defined
  assets/fonts/       Geist Sans + Geist Mono, bundled locally
  lib/orientation.ts  rotation, dimension math, resolution presets
  lib/quality.ts      percent -> CRF, band labels
  lib/size.ts         output size estimate
  lib/ffmpegArgs.ts   buildArgs(config) — the command that actually runs
  hooks/              thin wrappers around the Tauri commands
src-tauri/
  src/probe.rs        sidecar invocation, ffprobe parsing, VideoMetadata
  binaries/           gitignored, filled by scripts/fetch-binaries.sh
scripts/
  fetch-binaries.sh
```
