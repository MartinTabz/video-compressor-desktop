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
 * Bits per pixel at CRF 23, measured rather than guessed.
 *
 * Four real clips encoded at the app defaults imply 0.013 / 0.052 / 0.054 /
 * 0.070 — see `size.calibration.test.ts`. The old 0.072 sat above every one of
 * them, so the estimate was never once too low; 0.050 sits in the middle of
 * real footage that is not heavily downscaled.
 */
const BITS_PER_PIXEL_AT_REFERENCE_CRF = 0.05;
const REFERENCE_CRF = 23;

/**
 * How far a source can shrink before its pixels get cheaper.
 *
 * Up to a quarter of the original pixel count the footage keeps its detail and
 * each pixel costs about the same. Past that — a 4K phone clip going to 540p,
 * the app's main scenario — the sensor grain that x264 was spending most of its
 * bits on is averaged away by the scaler, and the file collapses. Without this
 * term that case came out 4.4× over.
 */
const DOWNSCALE_KNEE = 4;

/**
 * Beyond the knee the bits stay roughly flat as the pixels fall away, which is
 * what an exponent of 1 expresses: half the pixels, twice the bits each.
 */
const DOWNSCALE_EXPONENT = 1;

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
  /**
   * Source pixel count, for the downscale correction. Omitted means "no
   * downscaling", which is the safe reading: no discount is applied.
   */
  sourcePixels?: number;
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
    downscaleFactor(input.sourcePixels ?? width * height, width * height) *
    Math.pow(2, (REFERENCE_CRF - crf) / CRF_STEPS_PER_HALVING);

  const videoBits =
    bitsPerPixel * width * height * Math.max(fps, 1) * durationSeconds;
  const audioBits = Math.max(input.audioBitsPerSecond, 0) * durationSeconds;

  const totalBits = (videoBits * SPEED_FACTOR[speed] + audioBits) * CONTAINER_OVERHEAD;

  return Math.round(totalBits / 8);
}

/**
 * How much cheaper each output pixel is, given how far the source shrank.
 *
 * `1` means no discount. Upscaling — which the app forbids anyway — is also 1;
 * inventing extra bits for pixels that carry no new detail would be wrong in
 * the opposite direction.
 */
export function downscaleFactor(
  sourcePixels: number,
  outputPixels: number,
): number {
  if (
    !Number.isFinite(sourcePixels) ||
    !Number.isFinite(outputPixels) ||
    outputPixels <= 0 ||
    sourcePixels <= outputPixels
  ) {
    return 1;
  }

  const ratio = sourcePixels / outputPixels;
  if (ratio <= DOWNSCALE_KNEE) return 1;

  return Math.pow(ratio / DOWNSCALE_KNEE, -DOWNSCALE_EXPONENT);
}

/** Same estimate, driven straight off an `EncodeConfig` plus source facts. */
export function estimateSizeForConfig(
  config: EncodeConfig,
  source: {
    /** Source display dimensions — the downscale term needs both pairs. */
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
  },
): number {
  const audioMode: AudioMode = config.hasAudio ? config.audio : "none";

  return estimateSizeBytes({
    width: config.width,
    height: config.height,
    sourcePixels: source.width * source.height,
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
