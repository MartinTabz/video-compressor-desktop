import { useCallback, useEffect, useRef, useState } from "react";

import type { EncodeConfig, PosterConfig, SpeedPreset } from "../types";

/**
 * The encoder, as the UI sees it.
 *
 * Phase 3 fills this in with a simulation so the whole screen can be built and
 * judged; phase 4 replaces the body of `start` with a real sidecar spawn and
 * `-progress pipe:1` parsing. **Nothing outside this file may know which one is
 * running** — that is the entire point of the seam.
 */

export type EncoderStatus = "idle" | "running" | "done" | "cancelled" | "error";

/** What a finished job leaves behind. */
export interface EncodeResult {
  outputPath: string;
  outputSizeBytes: number;
  originalSizeBytes: number;
  posterPath: string | null;
  posterSizeBytes: number | null;
  webpPath: string | null;
  webpSizeBytes: number | null;
}

/** Everything needed to run a job that is not already in `EncodeConfig`. */
export interface EncodeContext {
  /** Source length — the mock paces itself against it. */
  durationSeconds: number;
  /** Source size, for the „48,2 MB → 3,2 MB" comparison. */
  originalSizeBytes: number;
  /** What `estimateSizeForConfig` predicted. The mock delivers roughly that. */
  estimatedSizeBytes: number;
  poster: PosterConfig;
}

export interface UseEncoder {
  status: EncoderStatus;
  /** 0–100. */
  progress: number;
  /** Encoded video seconds per real second, e.g. `2.4`. Null until known. */
  speed: number | null;
  /** Seconds of wall clock left, or null while it is still guesswork. */
  remainingSeconds: number | null;
  result: EncodeResult | null;
  /** A finished Czech sentence, never ffmpeg output. */
  error: string | null;
  start: (config: EncodeConfig, context: EncodeContext) => void;
  cancel: () => void;
  reset: () => void;
}

/** Roughly how many video seconds each preset chews through per real second. */
const MOCK_THROUGHPUT: Record<SpeedPreset, number> = {
  veryfast: 12,
  medium: 5,
  slow: 2.4,
  veryslow: 0.9,
};

/** The simulation stays inside these bounds however long the clip is. */
const MOCK_MIN_SECONDS = 3;
const MOCK_MAX_SECONDS = 20;

/** How often progress is repainted. Matches what ffmpeg emits in practice. */
const TICK_MS = 100;

/** A JPEG poster runs about this many bytes per pixel at quality 3. */
const POSTER_BYTES_PER_PIXEL = 0.14;
/** WebP is advertised as „o polovinu menší" and behaves like it. */
const WEBP_RATIO = 0.5;

export function useEncoder(): UseEncoder {
  const [status, setStatus] = useState<EncoderStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [result, setResult] = useState<EncodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  // A wizard reset or a closed window must not leave an interval running.
  useEffect(() => stopTimer, [stopTimer]);

  const start = useCallback(
    (config: EncodeConfig, context: EncodeContext) => {
      stopTimer();
      setStatus("running");
      setProgress(0);
      setSpeed(null);
      setRemainingSeconds(null);
      setResult(null);
      setError(null);

      const duration = Math.max(context.durationSeconds, 0.5);
      const throughput = MOCK_THROUGHPUT[config.speed];
      const totalSeconds = Math.min(
        MOCK_MAX_SECONDS,
        Math.max(MOCK_MIN_SECONDS, duration / throughput),
      );

      const startedAt = Date.now();

      timer.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        const fraction = Math.min(1, elapsed / totalSeconds);

        setProgress(Math.round(fraction * 100));
        // Real encoders wobble; a perfectly constant number looks fake.
        setSpeed((duration / totalSeconds) * (0.94 + Math.random() * 0.12));
        setRemainingSeconds(Math.max(0, Math.round(totalSeconds - elapsed)));

        if (fraction < 1) return;

        stopTimer();
        setProgress(100);
        setRemainingSeconds(0);
        setStatus("done");
        setResult(finishedResult(config, context));
      }, TICK_MS);
    },
    [stopTimer],
  );

  const cancel = useCallback(() => {
    stopTimer();
    setStatus("cancelled");
    setSpeed(null);
    setRemainingSeconds(null);
    // Phase 4 also deletes the partial file here.
  }, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    setStatus("idle");
    setProgress(0);
    setSpeed(null);
    setRemainingSeconds(null);
    setResult(null);
    setError(null);
  }, [stopTimer]);

  return {
    status,
    progress,
    speed,
    remainingSeconds,
    result,
    error,
    start,
    cancel,
    reset,
  };
}

/** The numbers a real run would report, derived from the estimate. */
function finishedResult(
  config: EncodeConfig,
  context: EncodeContext,
): EncodeResult {
  const posterPixels = config.width * config.height;
  const posterBytes = Math.round(posterPixels * POSTER_BYTES_PER_PIXEL);

  return {
    outputPath: config.outputPath,
    // The estimate is deliberately not exact; nudge it so nobody reads the
    // result as proof the estimator is perfect.
    outputSizeBytes: Math.round(context.estimatedSizeBytes * 1.04),
    originalSizeBytes: context.originalSizeBytes,
    posterPath: context.poster.enabled ? posterPathFor(config.outputPath, "jpg") : null,
    posterSizeBytes: context.poster.enabled ? posterBytes : null,
    webpPath:
      context.poster.enabled && context.poster.alsoWebp
        ? posterPathFor(config.outputPath, "webp")
        : null,
    webpSizeBytes:
      context.poster.enabled && context.poster.alsoWebp
        ? Math.round(posterBytes * WEBP_RATIO)
        : null,
  };
}

/** `clip-web.mp4` → `clip-web.jpg`, next to the video. */
export function posterPathFor(outputPath: string, extension: "jpg" | "webp"): string {
  const dot = outputPath.lastIndexOf(".");
  const stem = dot <= 0 ? outputPath : outputPath.slice(0, dot);
  return `${stem}.${extension}`;
}
