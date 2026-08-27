import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { VideoMetadata } from "../types";

/** Fallback for the impossible case where Rust sends something that is not a string. */
const GENERIC_ERROR = "Soubor se nepodařilo načíst. Může být poškozený.";

export interface UseVideoMetadata {
  metadata: VideoMetadata | null;
  loading: boolean;
  /** Always a finished Czech sentence, never terminal output. */
  error: string | null;
  probe: (path: string) => Promise<VideoMetadata | null>;
  reset: () => void;
}

/**
 * Wraps the `probe_video` command with loading / error / result states.
 *
 * The Rust side is the only place that decides what the user reads, so this
 * hook passes its message straight through and logs everything else.
 */
export function useVideoMetadata(): UseVideoMetadata {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<VideoMetadata>("probe_video", { path });
      setMetadata(result);
      return result;
    } catch (cause) {
      console.error("probe_video failed:", cause);
      setMetadata(null);
      setError(typeof cause === "string" ? cause : GENERIC_ERROR);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMetadata(null);
    setError(null);
    setLoading(false);
  }, []);

  return { metadata, loading, error, probe, reset };
}
