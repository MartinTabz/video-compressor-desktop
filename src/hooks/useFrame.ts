import { useEffect, useRef, useState } from "react";

import type { VideoMetadata } from "../types";
import { extractFrame } from "../lib/frames";

/**
 * A single extracted frame, re-extracted on a debounce as `timeSeconds` moves.
 *
 * Scrubbing the poster slider would otherwise spawn an ffmpeg process per
 * pixel; 200 ms of quiet is enough to feel live without the storm.
 */
export function useFrame(
  meta: VideoMetadata | null,
  timeSeconds: number,
  debounceMs = 200,
): { src: string | null; path: string | null; loading: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Frames arrive out of order when an early extraction is slow; only the
  // newest request is allowed to paint.
  const requestId = useRef(0);

  useEffect(() => {
    if (!meta) {
      setSrc(null);
      setPath(null);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);

    const timer = setTimeout(() => {
      extractFrame(meta, timeSeconds)
        .then((frame) => {
          if (id !== requestId.current) return;
          setSrc(frame.src);
          setPath(frame.path);
        })
        .catch((cause) => {
          console.error("extract_frame failed:", cause);
          if (id !== requestId.current) return;
          // A missing thumbnail is cosmetic — the card falls back to a glyph.
          setSrc(null);
          setPath(null);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [meta, timeSeconds, debounceMs]);

  return { src, path, loading };
}
