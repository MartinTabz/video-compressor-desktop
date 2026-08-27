import type { EncodeConfig } from "../types";
import { crfFromQuality } from "./quality";

/**
 * The single source of truth for what ffmpeg is asked to do.
 *
 * `buildArgs` is pure and its output is what actually runs — the summary step's
 * "technical details" panel renders this same array, so it must never be an
 * approximation of the real command.
 */

/** Flags that are applied no matter what the user picked, and why. */
const ALWAYS: string[] = [
  // Maximum compatibility, including in-app browsers.
  "-c:v",
  "libx264",
  // Older devices and Meta/Instagram webviews choke on high profile.
  "-profile:v",
  "main",
  // Without this Safari refuses to play the file at all.
  "-pix_fmt",
  "yuv420p",
];

export function buildArgs(config: EncodeConfig): string[] {
  const crf = crfFromQuality(config.qualityPercent);

  // Two concrete even integers, always. No `-2`, no fixed dimension: the
  // frontend has already computed both sides from the display resolution.
  const scale = `scale=${config.width}:${config.height}`;

  return [
    // Overwrite silently — the UI has already handled the confirmation.
    "-y",
    "-i",
    config.inputPath,
    "-vf",
    scale,
    ...ALWAYS,
    "-preset",
    config.speed,
    "-crf",
    String(crf),
    ...audioArgs(config),
    // Without this the browser downloads the whole file before playback starts.
    "-movflags",
    "+faststart",
    // Machine-readable progress on stdout instead of the usual status line.
    "-progress",
    "pipe:1",
    "-nostats",
    config.outputPath,
  ];
}

/**
 * Audio flags. A silent source skips the audio question entirely and gets
 * `-an`, which is also what "no audio needed" produces.
 */
function audioArgs(config: EncodeConfig): string[] {
  if (!config.hasAudio || config.audio === "none") {
    return ["-an"];
  }

  if (config.audio === "speech") {
    // Mono at 64k is transparent for a talking head and costs almost nothing.
    return ["-c:a", "aac", "-b:a", "64k", "-ac", "1"];
  }

  return ["-c:a", "aac", "-b:a", "128k"];
}

/**
 * The argument array as one copyable command line.
 *
 * For display and debugging only — the encoder is handed the array, so nothing
 * depends on this quoting being shell-perfect.
 */
export function toCommandString(args: string[], binary = "ffmpeg"): string {
  return [binary, ...args].map(quoteIfNeeded).join(" ");
}

function quoteIfNeeded(token: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}
