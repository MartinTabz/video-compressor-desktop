import type { AudioMode, EncodeConfig, SpeedPreset } from "../types";
import { crfFromQuality } from "./quality";

/**
 * Rough output-size estimate.
 *
 * This is a heuristic, not a simulation: x264's real output depends on how
 * much the footage actually moves. It is here so the user sees „Odhad: ~3,4 MB"
 * before committing to a two-minute encode, and it is labelled as an estimate
 * everywhere it appears.
 */

/**
 * Bits per pixel at CRF 23 for typical talking-head footage. Derived from
 * 1920×1080 @ 30 fps landing around 4.5 Mbit/s.
 */
const BITS_PER_PIXEL_AT_REFERENCE_CRF = 0.072;
const REFERENCE_CRF = 23;

/** x264 rate roughly halves for every 6 steps of CRF. */
const CRF_STEPS_PER_HALVING = 6;

/** Slower presets find more savings at the same CRF. Small, but real. */
const SPEED_FACTOR: Record<SpeedPreset, number> = {
  veryfast: 1.15,
  medium: 1.0,
  slow: 0.93,
  veryslow: 0.9,
};

/** Audio bitrates, matching what `buildArgs` actually emits. */
const AUDIO_BITS_PER_SECOND: Record<AudioMode, number> = {
  none: 0,
  speech: 64_000,
  music: 128_000,
};

/** MP4 headers, faststart index and per-frame overhead. */
const CONTAINER_OVERHEAD = 1.02;

export interface SizeEstimateInput {
  width: number;
  height: number;
  fps: number;
  crf: number;
  durationSeconds: number;
  speed: SpeedPreset;
  audioBitsPerSecond: number;
}

/** Estimated output size in bytes. Returns 0 for a zero-length input. */
export function estimateSizeBytes(input: SizeEstimateInput): number {
  const { width, height, fps, crf, durationSeconds, speed } = input;

  if (
    ![width, height, fps, crf, durationSeconds].every(Number.isFinite) ||
    durationSeconds <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return 0;
  }

  const bitsPerPixel =
    BITS_PER_PIXEL_AT_REFERENCE_CRF *
    Math.pow(2, (REFERENCE_CRF - crf) / CRF_STEPS_PER_HALVING);

  const videoBits =
    bitsPerPixel * width * height * Math.max(fps, 1) * durationSeconds;
  const audioBits = Math.max(input.audioBitsPerSecond, 0) * durationSeconds;

  const totalBits = (videoBits * SPEED_FACTOR[speed] + audioBits) * CONTAINER_OVERHEAD;

  return Math.round(totalBits / 8);
}

/** Same estimate, driven straight off an `EncodeConfig` plus source facts. */
export function estimateSizeForConfig(
  config: EncodeConfig,
  source: { fps: number; durationSeconds: number },
): number {
  const audioMode: AudioMode = config.hasAudio ? config.audio : "none";

  return estimateSizeBytes({
    width: config.width,
    height: config.height,
    fps: source.fps,
    crf: crfFromQuality(config.qualityPercent),
    durationSeconds: source.durationSeconds,
    speed: config.speed,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND[audioMode],
  });
}

/**
 * Czech file size: decimal comma, one decimal place below 100 MB.
 * `formatBytes(3_400_000)` → `"3,4 MB"`.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 kB";

  const units = ["B", "kB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }

  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals).replace(".", ",")} ${units[unit]}`;
}

/** „~3,4 MB" — the estimate always wears its tilde. */
export function formatEstimate(bytes: number): string {
  return `~${formatBytes(bytes)}`;
}
