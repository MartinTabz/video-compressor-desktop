import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { buildArgs } from "../lib/ffmpegArgs";
import type { EncodeConfig, PosterConfig } from "../types";

/**
 * The encoder, as the UI sees it.
 *
 * Rust does the spawning and the progress parsing; this hook is the seam that
 * turns four Tauri events into the five fields the progress screen reads.
 * **Nothing outside this file knows there is a sidecar** — that is the point.
 */

export type EncoderStatus = "idle" | "running" | "done" | "cancelled" | "error";

/**
 * Which half of the run is on screen. The poster is a second, much shorter
 * ffmpeg call after the video is already finished, and saying so is what keeps
 * a slow poster from reading as a hang at 100 %.
 */
export type EncodePhase = "video" | "poster";

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
  /** Source length — every percentage and ETA is measured against it. */
  durationSeconds: number;
  /** Source size, for the „48,2 MB → 3,2 MB" comparison. */
  originalSizeBytes: number;
  poster: PosterConfig;
}

export interface UseEncoder {
  status: EncoderStatus;
  /** 0–100. */
  progress: number;
  /** Which ffmpeg call is running. Only meaningful while `status` is running. */
  phase: EncodePhase;
  /** Encoded video seconds per real second, e.g. `2.4`. Null until known. */
  speed: number | null;
  /** Seconds of wall clock left, or null while it is still guesswork. */
  remainingSeconds: number | null;
  result: EncodeResult | null;
  /** A finished Czech sentence, never ffmpeg output. */
  error: string | null;
  /**
   * Something went wrong that did not cost the user the video — today that
   * means only a failed poster. Shown next to the result, not instead of it.
   */
  warning: string | null;
  start: (config: EncodeConfig, context: EncodeContext) => void;
  cancel: () => void;
  reset: () => void;
}

// --- The event payloads, exactly as `encode.rs` serializes them.

interface ProgressEvent {
  jobId: string;
  percent: number;
  speed: number | null;
  etaSeconds: number | null;
}

interface CompleteEvent {
  jobId: string;
  exitCode: number;
  outputPath: string;
  outputSizeBytes: number;
}

interface ErrorEvent {
  jobId: string;
  message: string;
}

interface CancelledEvent {
  jobId: string;
}

interface PosterResult {
  jpegPath: string;
  jpegSizeBytes: number;
  webpPath: string | null;
  webpSizeBytes: number | null;
}

/** Shown when the invoke itself fails, i.e. before ffmpeg ever starts. */
const START_FAILED = "Kompresi se nepodařilo spustit.";

export function useEncoder(): UseEncoder {
  const [status, setStatus] = useState<EncoderStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<EncodePhase>("video");
  const [speed, setSpeed] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [result, setResult] = useState<EncodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  /**
   * The job the UI is currently watching. Every handler compares against this
   * first: a cancelled job's last few events are still in flight when the next
   * run starts, and without the check they would drive the new progress bar.
   */
  const jobId = useRef<string | null>(null);

  /** What the running job was asked to do — the completion handler needs it. */
  const pending = useRef<EncodeContext | null>(null);

  // One subscription for the lifetime of the hook. Re-subscribing per run is
  // what produces duplicate progress updates on a second encode.
  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    async function subscribe() {
      const handlers: [string, (payload: never) => void][] = [
        ["encode-progress", onProgress as (payload: never) => void],
        ["encode-complete", onComplete as (payload: never) => void],
        ["encode-error", onError as (payload: never) => void],
        ["encode-cancelled", onCancelled as (payload: never) => void],
      ];

      for (const [name, handler] of handlers) {
        const unlisten = await listen(name, (event) => handler(event.payload as never));
        // The hook can unmount while these awaits are still resolving.
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      }
    }

    void subscribe();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
    };
    // The handlers below only touch refs and setState, both of which are
    // stable, so this subscribes exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isCurrent(payload: { jobId: string }): boolean {
    return payload.jobId === jobId.current;
  }

  function onProgress(payload: ProgressEvent) {
    if (!isCurrent(payload)) return;
    setProgress(payload.percent);
    setSpeed(payload.speed);
    setRemainingSeconds(payload.etaSeconds);
  }

  function onComplete(payload: CompleteEvent) {
    if (!isCurrent(payload)) return;

    setProgress(100);
    setRemainingSeconds(0);
    setSpeed(null);

    const context = pending.current;
    const finished: EncodeResult = {
      outputPath: payload.outputPath,
      outputSizeBytes: payload.outputSizeBytes,
      originalSizeBytes: context?.originalSizeBytes ?? 0,
      posterPath: null,
      posterSizeBytes: null,
      webpPath: null,
      webpSizeBytes: null,
    };

    if (!context?.poster.enabled) {
      finish(finished);
      return;
    }

    // The video is already safe on disk. Whatever happens from here is at
    // worst a warning.
    setPhase("poster");
    const job = payload.jobId;

    invoke<PosterResult>("generate_poster", {
      videoPath: payload.outputPath,
      timeSeconds: context.poster.timeSeconds,
      alsoWebp: context.poster.alsoWebp,
    })
      .then((poster) => {
        if (jobId.current !== job) return;
        finish({
          ...finished,
          posterPath: poster.jpegPath,
          posterSizeBytes: poster.jpegSizeBytes,
          webpPath: poster.webpPath,
          webpSizeBytes: poster.webpSizeBytes,
        });
      })
      .catch((cause: unknown) => {
        if (jobId.current !== job) return;
        console.error("generate_poster failed:", cause);
        setWarning(
          typeof cause === "string"
            ? cause
            : "Náhledový obrázek se nepodařilo vytvořit. Video je ale hotové.",
        );
        finish(finished);
      });
  }

  function finish(value: EncodeResult) {
    setPhase("video");
    setResult(value);
    setStatus("done");
    jobId.current = null;
    pending.current = null;
  }

  function onError(payload: ErrorEvent) {
    if (!isCurrent(payload)) return;
    setStatus("error");
    setError(payload.message);
    setSpeed(null);
    setRemainingSeconds(null);
    jobId.current = null;
    pending.current = null;
  }

  function onCancelled(payload: CancelledEvent) {
    if (!isCurrent(payload)) return;
    setStatus("cancelled");
    setSpeed(null);
    setRemainingSeconds(null);
    jobId.current = null;
    pending.current = null;
  }

  const start = useCallback((config: EncodeConfig, context: EncodeContext) => {
    // A fresh id per run: any straggler from the previous job now fails the
    // `isCurrent` check instead of painting over this one.
    const job = crypto.randomUUID();
    jobId.current = job;
    pending.current = context;

    setStatus("running");
    setPhase("video");
    setProgress(0);
    setSpeed(null);
    setRemainingSeconds(null);
    setResult(null);
    setError(null);
    setWarning(null);

    // The one place arguments are built, and the same array the summary step
    // shows. Rust is handed the finished list.
    const args = buildArgs(config);

    invoke("start_encode", {
      args,
      durationSeconds: context.durationSeconds,
      jobId: job,
    }).catch((cause: unknown) => {
      if (jobId.current !== job) return;
      console.error("start_encode failed:", cause);
      setStatus("error");
      setError(typeof cause === "string" ? cause : START_FAILED);
      jobId.current = null;
      pending.current = null;
    });
  }, []);

  const cancel = useCallback(() => {
    const job = jobId.current;
    if (job === null) return;

    // The state change waits for `encode-cancelled`: Rust deletes the partial
    // file only once the process is really gone, and the screen should not
    // claim otherwise before then.
    invoke("cancel_encode", { jobId: job }).catch((cause: unknown) => {
      console.error("cancel_encode failed:", cause);
    });
  }, []);

  const reset = useCallback(() => {
    jobId.current = null;
    pending.current = null;
    setStatus("idle");
    setPhase("video");
    setProgress(0);
    setSpeed(null);
    setRemainingSeconds(null);
    setResult(null);
    setError(null);
    setWarning(null);
  }, []);

  return {
    status,
    progress,
    phase,
    speed,
    remainingSeconds,
    result,
    error,
    warning,
    start,
    cancel,
    reset,
  };
}
