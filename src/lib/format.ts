/**
 * Czech formatting for everything the user reads as data.
 *
 * Decimal comma throughout, and every number that updates live is rendered in
 * mono with tabular figures so it cannot jitter.
 */

/** `41` → `0:41`, `125` → `2:05`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/** `59.9` → `59,9`, `24` → `24`. Trailing `,0` is noise. */
export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(decimals));
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(decimals).replace(".", ",");
}

/** `24` → `24 fps`. */
export function formatFps(fps: number): string {
  return `${formatNumber(fps)} fps`;
}

/** `540 × 960` — the multiplication sign, not a letter x. */
export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

/**
 * How much smaller the output got, as a whole percentage.
 * Returns 0 when the "saving" would be negative — never promise a loss.
 */
export function savingsPercent(originalBytes: number, newBytes: number): number {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return 0;
  const saved = 1 - newBytes / originalBytes;
  return Math.max(0, Math.round(saved * 100));
}

/** `2.4` → `2,4×` — the live speed readout during an encode. */
export function formatSpeed(multiplier: number): string {
  return `${formatNumber(multiplier)}×`;
}

/** Seconds remaining as `zbývá 0:41`, or a shrug while it is unknown. */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return "odhadujeme zbývající čas…";
  }
  return `zbývá ${formatDuration(seconds)}`;
}

/** `clip.mov` → `clip`. Works on both path separators. */
export function fileStem(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? fileName : fileName.slice(0, dot);
}

/** The directory part of a path, without the trailing separator. */
export function directoryOf(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const cut = path.lastIndexOf(separator);
  return cut <= 0 ? path : path.slice(0, cut);
}

/** The last path segment. */
export function baseName(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const cut = path.lastIndexOf(separator);
  return cut === -1 ? path : path.slice(cut + 1);
}

/** Joins a directory and a file name with the separator already in use. */
export function joinPath(directory: string, fileName: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  const trimmed = directory.endsWith(separator)
    ? directory.slice(0, -1)
    : directory;
  return `${trimmed}${separator}${fileName}`;
}

/** `/Users/me/Movies/clip.mov` → `~/Movies/clip.mov` when it fits. */
export function shortenHomePath(path: string, home: string | null): string {
  if (!home || !path.startsWith(home)) return path;
  return `~${path.slice(home.length)}`;
}

/** `clip.mov` → `clip-web.mp4`, the default name for the output. */
export function defaultOutputName(fileName: string): string {
  return `${fileStem(fileName)}-web.mp4`;
}
