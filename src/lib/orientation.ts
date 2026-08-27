import type {
  Orientation,
  ResolutionPreset,
  ResolutionPresetId,
  VideoMetadata,
} from "../types";

/**
 * Dimension math for the scale filter.
 *
 * Two rules run through everything here:
 *
 * 1. Presets are expressed against the **longer** side, so a 1080×1920 phone
 *    clip and a 1920×1080 camera clip behave identically.
 * 2. Nothing is ever scaled **up**. A target above the source resolution
 *    returns the source, it does not stretch it.
 */

/** Smallest dimension the encoder will accept. */
const MIN_DIMENSION = 2;

/**
 * Rounds down to the nearest even integer, minimum 2.
 *
 * `yuv420p` halves chroma resolution, so x264 rejects odd dimensions outright.
 */
export function toEven(n: number): number {
  if (!Number.isFinite(n)) return MIN_DIMENSION;
  const floored = Math.floor(n);
  const even = floored - (floored % 2);
  return Math.max(MIN_DIMENSION, even);
}

/** Counterpart width for a given height, on a locked aspect ratio. */
export function deriveWidth(height: number, aspectRatio: number): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return MIN_DIMENSION;
  return toEven(height * aspectRatio);
}

/** Counterpart height for a given width, on a locked aspect ratio. */
export function deriveHeight(width: number, aspectRatio: number): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return MIN_DIMENSION;
  return toEven(width / aspectRatio);
}

/** Longer side of the source, in display orientation. */
export function longerSide(meta: VideoMetadata): number {
  return Math.max(meta.width, meta.height);
}

/** Orientation of an arbitrary dimension pair. */
export function orientationOf(width: number, height: number): Orientation {
  if (height > width) return "portrait";
  if (width > height) return "landscape";
  return "square";
}

/**
 * Scales the source so its longer side equals `target`, preserving orientation.
 *
 * **This is the function that prevents the upscaling bug.** For a 1080×1920
 * source with target 960 it returns `540 × 960`, never `960 × 1707`. A target
 * at or above the source's longer side returns the source untouched.
 */
export function dimensionsForLongerSide(
  meta: VideoMetadata,
  target: number,
): { width: number; height: number } {
  const source = longerSide(meta);

  // Never upscale, and never trust a nonsense target.
  if (!Number.isFinite(target) || target <= 0 || target >= source) {
    return { width: toEven(meta.width), height: toEven(meta.height) };
  }

  const scale = target / source;

  // The longer side is pinned to the target exactly; the shorter one follows.
  // Doing it in this order keeps the requested class honest — a "540p" file
  // really is 960 on its long edge.
  if (meta.height > meta.width) {
    return { width: toEven(meta.width * scale), height: toEven(target) };
  }
  if (meta.width > meta.height) {
    return { width: toEven(target), height: toEven(meta.height * scale) };
  }
  return { width: toEven(target), height: toEven(target) };
}

/**
 * Preset catalogue, in descending order of size.
 *
 * The numbers are longer-side targets, which is why "1080p" is 1920: a 1080p
 * frame is 1920 on its long edge whether it is lying down or standing up.
 */
const PRESET_TARGETS: Array<{
  id: Exclude<ResolutionPresetId, "original">;
  label: string;
  targetLongerSide: number;
}> = [
  { id: "1080p", label: "1080p", targetLongerSide: 1920 },
  { id: "720p", label: "720p", targetLongerSide: 1280 },
  { id: "540p", label: "540p", targetLongerSide: 960 },
  { id: "480p", label: "480p", targetLongerSide: 854 },
];

/**
 * Presets available for this source, largest first.
 *
 * "Původní" is always present. Anything that would meet or exceed the source
 * is dropped: at best it duplicates "Původní", at worst it upscales.
 */
export function resolutionPresets(meta: VideoMetadata): ResolutionPreset[] {
  const source = longerSide(meta);

  const original: ResolutionPreset = {
    id: "original",
    label: "Původní",
    targetLongerSide: source,
    width: toEven(meta.width),
    height: toEven(meta.height),
  };

  const smaller = PRESET_TARGETS.filter(
    (preset) => preset.targetLongerSide < source,
  ).map((preset) => ({
    ...preset,
    ...dimensionsForLongerSide(meta, preset.targetLongerSide),
  }));

  return [original, ...smaller];
}

/**
 * Forces a user-entered dimension pair into something the encoder accepts:
 * even numbers, at least 2px, never larger than the source.
 *
 * `wasClamped` reports only the size cap, not the rounding to even — the UI
 * uses it to explain why a typed number changed.
 */
export function clampDimensions(
  requested: { width: number; height: number },
  meta: VideoMetadata,
): { width: number; height: number; wasClamped: boolean } {
  const maxWidth = toEven(meta.width);
  const maxHeight = toEven(meta.height);

  const rawWidth = Number.isFinite(requested.width) ? requested.width : 0;
  const rawHeight = Number.isFinite(requested.height) ? requested.height : 0;

  const wasClamped =
    rawWidth > maxWidth ||
    rawHeight > maxHeight ||
    rawWidth < MIN_DIMENSION ||
    rawHeight < MIN_DIMENSION;

  return {
    width: Math.min(toEven(rawWidth), maxWidth),
    height: Math.min(toEven(rawHeight), maxHeight),
    wasClamped,
  };
}
