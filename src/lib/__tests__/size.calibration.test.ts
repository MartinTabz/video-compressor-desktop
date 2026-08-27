import { describe, expect, it } from "vitest";

import { crfFromQuality } from "../quality";
import { downscaleFactor, estimateSizeBytes } from "../size";

/**
 * The estimator, pinned to reality.
 *
 * Every row below is a real clip encoded with exactly the flags `buildArgs`
 * emits at the app defaults — 960 on the longer side, quality 40 % (CRF 30),
 * `-preset slow`, mono 64k audio — and the byte count ffmpeg actually wrote.
 *
 * These numbers are why the constants are what they are. Change a constant and
 * this test tells you what it does to real footage instead of to a guess.
 */
interface MeasuredClip {
  name: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  /** What ffmpeg wrote, in bytes. */
  actualBytes: number;
}

const MEASURED: MeasuredClip[] = [
  {
    // 4K60 phone clip scaled to 540p — the app's primary scenario, and the case
    // that was 4.4× over before the downscale term existed.
    name: "IMG_7808.MOV",
    sourceWidth: 3840,
    sourceHeight: 2160,
    width: 960,
    height: 540,
    fps: 60,
    durationSeconds: 79.118,
    actualBytes: 2_284_274,
  },
  {
    name: "maty.mp4",
    sourceWidth: 1920,
    sourceHeight: 1080,
    width: 960,
    height: 540,
    fps: 60,
    durationSeconds: 32.5167,
    actualBytes: 3_051_192,
  },
  {
    // Already-compressed near-vertical ad, kept at its source resolution.
    name: "lunara-ad.mp4",
    sourceWidth: 720,
    sourceHeight: 898,
    width: 720,
    height: 898,
    fps: 30,
    durationSeconds: 314.667,
    actualBytes: 20_001_721,
  },
  {
    name: "recovist-ad.mp4",
    sourceWidth: 720,
    sourceHeight: 900,
    width: 720,
    height: 900,
    fps: 30,
    durationSeconds: 286.267,
    actualBytes: 22_775_306,
  },
];

function estimateFor(clip: MeasuredClip): number {
  return estimateSizeBytes({
    width: clip.width,
    height: clip.height,
    sourcePixels: clip.sourceWidth * clip.sourceHeight,
    fps: clip.fps,
    crf: crfFromQuality(40),
    durationSeconds: clip.durationSeconds,
    speed: "slow",
    audioBitsPerSecond: 64_000,
  });
}

describe("downscaleFactor", () => {
  it("leaves mild downscaling alone", () => {
    expect(downscaleFactor(1920 * 1080, 1920 * 1080)).toBe(1);
    // 1080×1920 → 540×960 is exactly the knee: still no discount.
    expect(downscaleFactor(1080 * 1920, 540 * 960)).toBe(1);
  });

  it("discounts heavy downscaling in proportion", () => {
    // 4K → 540p is 16× the pixels, four times past the knee.
    expect(downscaleFactor(3840 * 2160, 960 * 540)).toBeCloseTo(0.25, 5);
    expect(downscaleFactor(3840 * 2160, 1920 * 1080)).toBe(1);
  });

  it("never invents bits for an upscale", () => {
    expect(downscaleFactor(540 * 960, 1080 * 1920)).toBe(1);
    expect(downscaleFactor(Number.NaN, 1000)).toBe(1);
  });
});

describe("estimates against real encodes", () => {
  for (const clip of MEASURED) {
    it(`lands within 1.5× on ${clip.name}`, () => {
      const ratio = estimateFor(clip) / clip.actualBytes;
      expect(ratio).toBeGreaterThan(0.66);
      expect(ratio).toBeLessThan(1.5);
    });
  }

  it("no longer over-predicts every single clip", () => {
    const ratios = MEASURED.map((clip) => estimateFor(clip) / clip.actualBytes);
    expect(Math.min(...ratios)).toBeLessThan(1);
  });
});
