import type { VideoMetadata } from "../types";

/**
 * Frame-rate choices.
 *
 * The source rate is a hard ceiling: asking ffmpeg for more frames than the
 * camera recorded only duplicates them and makes the file bigger.
 */

/** Below this the result stutters badly enough to look broken. */
export const MIN_FPS = 12;

/** The source rate, rounded to something a slider can land on exactly. */
export function frameRateCeiling(meta: VideoMetadata): number {
  const fps = Number.isFinite(meta.fps) && meta.fps > 0 ? meta.fps : 30;
  return Math.max(MIN_FPS, Math.round(fps * 10) / 10);
}

/** Keeps a chosen rate between the floor and the source ceiling. */
export function clampFrameRate(fps: number, meta: VideoMetadata): number {
  const ceiling = frameRateCeiling(meta);
  if (!Number.isFinite(fps)) return ceiling;
  return Math.min(ceiling, Math.max(MIN_FPS, Math.round(fps * 10) / 10));
}

export interface FrameRatePreset {
  id: "original" | "30" | "24";
  label: string;
  value: number;
}

/**
 * Původní · 30 · 24, minus anything above the source. A 24 fps clip offers
 * only „Původní", which is exactly right.
 */
export function frameRatePresets(meta: VideoMetadata): FrameRatePreset[] {
  const ceiling = frameRateCeiling(meta);

  const presets: FrameRatePreset[] = [
    { id: "original", label: "Původní", value: ceiling },
  ];

  for (const value of [30, 24] as const) {
    // Equal to the ceiling would just duplicate „Původní".
    if (value < ceiling) {
      presets.push({ id: String(value) as "30" | "24", label: String(value), value });
    }
  }

  return presets;
}

/** What the chosen rate will look like, in the user's words. */
export function frameRateDescription(fps: number): string {
  if (fps >= 50) {
    return "Velmi plynulé. Vhodné pro rychlý pohyb, ale soubor bude velký.";
  }
  if (fps >= 30) {
    return "Plynulé. Bezpečná volba pro většinu webových videí.";
  }
  if (fps >= 24) {
    return "Filmový vzhled. Ideální pro mluvící hlavu, ušetří místo.";
  }
  return "Znatelně trhané. Použij jen u statické scény.";
}
