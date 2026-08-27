import type { PosterFormat } from "../types";

/**
 * The poster formats offered, in the order they appear in the picker. WebP is
 * first because it is the right answer for the web and the default here.
 */
export const POSTER_FORMATS: { value: PosterFormat; label: string }[] = [
  { value: "webp", label: "WebP" },
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
];

export function posterFormatLabel(format: PosterFormat): string {
  return POSTER_FORMATS.find((entry) => entry.value === format)?.label ?? "WebP";
}
