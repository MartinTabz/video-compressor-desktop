import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import type { VideoMetadata } from "../types";
import { dimensionsForLongerSide } from "./orientation";

/**
 * Still frames pulled out of the source for the info card and the poster
 * picker. The Rust side writes them into the app cache and the asset protocol
 * serves them back.
 */

/** Big enough for a retina thumbnail, small enough to extract instantly. */
export const THUMBNAIL_LONGER_SIDE = 640;

export interface ExtractedFrame {
  /** Absolute path on disk — what a later ffmpeg call would be given. */
  path: string;
  /** `asset://` URL the webview can put in an `<img>`. */
  src: string;
}

/**
 * Extracts one frame at `timeSeconds`.
 *
 * The size is computed from the **display** dimensions through the same
 * longer-side helper the encode uses, so a 9:16 clip produces a 9:16 thumbnail
 * and nothing is ever scaled up.
 */
export async function extractFrame(
  meta: VideoMetadata,
  timeSeconds: number,
  longerSide: number = THUMBNAIL_LONGER_SIDE,
): Promise<ExtractedFrame> {
  const { width, height } = dimensionsForLongerSide(meta, longerSide);

  const path = await invoke<string>("extract_frame", {
    path: meta.path,
    timeSeconds,
    width,
    height,
  });

  return { path, src: convertFileSrc(path) };
}
