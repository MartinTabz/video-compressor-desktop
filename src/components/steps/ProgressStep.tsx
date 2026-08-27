import { useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Check, FolderOpen, RotateCcw, XCircle } from "lucide-react";

import type { WizardState } from "../../types";
import type { UseEncoder } from "../../hooks/useEncoder";
import { Button } from "../ui/Button";
import { ShapeProxy } from "../ui/ShapeProxy";
import { formatRemaining, formatSpeed, savingsPercent } from "../../lib/format";
import { formatBytes } from "../../lib/size";

/**
 * The encode itself.
 *
 * The progress indicator is the shape proxy, filling bottom to top like a
 * container — a horizontal bar would say nothing about what is being made.
 */
interface ProgressStepProps {
  state: WizardState;
  encoder: UseEncoder;
  onBackToSummary: () => void;
  onStartOver: () => void;
}

export function ProgressStep({
  state,
  encoder,
  onBackToSummary,
  onStartOver,
}: ProgressStepProps) {
  if (encoder.status === "done" && encoder.result) {
    return (
      <ResultView
        state={state}
        result={encoder.result}
        warning={encoder.warning}
        onStartOver={onStartOver}
      />
    );
  }

  if (encoder.status === "cancelled") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <XCircle className="h-8 w-8 text-text-muted" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-text">Komprese byla zrušena.</p>
          <p className="text-text-muted">
            Rozdělaný soubor jsme smazali, původní video zůstalo beze změny.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={onBackToSummary}>Zpět na souhrn</Button>
          <Button variant="primary" onClick={onStartOver}>
            Zkomprimovat další video
          </Button>
        </div>
      </div>
    );
  }

  if (encoder.status === "error") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <XCircle className="h-8 w-8 text-danger" aria-hidden="true" />
        <p role="alert" className="text-danger">
          {encoder.error ?? "Kompresi se nepodařilo dokončit."}
        </p>
        {/* The only place the log is ever offered. A finished run has no use
            for it, and a working app should not advertise its own plumbing. */}
        <button type="button" className="link" onClick={openLog}>
          Otevřít log
        </button>
        <Button onClick={onBackToSummary}>Zpět na souhrn</Button>
      </div>
    );
  }

  return <RunningView state={state} encoder={encoder} />;
}

/**
 * The run in progress. Split out so „Zrušit" can remember it has been pressed
 * without that flag surviving into the next encode.
 */
function RunningView({ state, encoder }: { state: WizardState; encoder: UseEncoder }) {
  // Killing ffmpeg and deleting the partial file takes a moment, and the
  // percentage keeps climbing until it lands. A button that stays live would
  // invite a second click at exactly the wrong time.
  const [cancelling, setCancelling] = useState(false);

  const poster = encoder.phase === "poster";

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      <ShapeProxy
        width={state.width}
        height={state.height}
        mode="progress"
        progress={encoder.progress}
        showLabels={false}
        maxHeight={300}
        maxWidth={240}
      />

      {/* Fixed height on both lines: the readout must not push the shape
          around as the numbers arrive and disappear. */}
      <div className="flex h-6 items-center gap-6 font-mono text-text-muted">
        {poster ? (
          <span className="font-sans">Vytvářím náhledový obrázek…</span>
        ) : (
          <>
            <span>{encoder.speed !== null ? formatSpeed(encoder.speed) : "—"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatRemaining(encoder.remainingSeconds)}</span>
          </>
        )}
      </div>

      <div className="h-10">
        {/* Cancelling has nothing left to stop once the video is written, and
            the poster call is a second or two at most. */}
        {!poster && (
          <Button
            onClick={() => {
              setCancelling(true);
              encoder.cancel();
            }}
            disabled={cancelling}
          >
            {cancelling ? "Ruším…" : "Zrušit"}
          </Button>
        )}
      </div>
    </div>
  );
}

async function openLog() {
  try {
    await invoke("open_log");
  } catch (cause) {
    console.error("open_log failed:", cause);
  }
}

/** What the user came for: the two numbers and the file itself. */
function ResultView({
  state,
  result,
  warning,
  onStartOver,
}: {
  state: WizardState;
  result: NonNullable<UseEncoder["result"]>;
  warning: string | null;
  onStartOver: () => void;
}) {
  const savings = savingsPercent(result.originalSizeBytes, result.outputSizeBytes);

  // The finished file, played straight from disk through the asset protocol.
  const [videoFailed, setVideoFailed] = useState(false);

  async function reveal() {
    try {
      await invoke("reveal_in_file_manager", { path: result.outputPath });
    } catch (cause) {
      console.error("reveal failed:", cause);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      {/* Bare stroke, no disc around it: the tick is the only mark on the
          screen, and it arrives a beat after the numbers it confirms. */}
      <Check
        className="animate-check h-12 w-12 text-success"
        strokeWidth={2.5}
        aria-hidden="true"
      />

      <div className="flex flex-col items-center gap-2">
        <p className="figure">
          {formatBytes(result.originalSizeBytes)} →{" "}
          <span className="text-success">{formatBytes(result.outputSizeBytes)}</span>
        </p>
        <p className="text-text-muted">úspora {savings} %</p>
      </div>

      {warning && (
        <p className="flex items-center justify-center gap-2 text-text-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          {warning}
        </p>
      )}

      {/*
       * Three columns: the video sits in the middle one, so it is centred on
       * the screen itself rather than on the pair, and the poster hangs off its
       * right. Both are vertically centred against each other.
       */}
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div aria-hidden="true" />
        {/* Height-constrained so a 9:16 result stays on screen whole. */}
        <div className="min-w-0">
          {videoFailed ? (
            <div
              className="flex items-center justify-center rounded-card border border-border bg-surface-2 px-6 text-center text-text-muted"
              style={{ height: 320, maxWidth: "100%" }}
            >
              Náhled se nepodařilo přehrát. Soubor je uložený.
            </div>
          ) : (
            <video
              src={convertFileSrc(result.outputPath)}
              controls
              className="rounded-card border border-border bg-surface-2"
              style={{ maxHeight: 320, maxWidth: "100%" }}
              onError={() => setVideoFailed(true)}
            />
          )}
        </div>

        {result.posterPath && (
          <div className="flex flex-col items-center gap-2 justify-self-start">
            <span className="label">Poster</span>
            <div
              className="flex items-center justify-center overflow-hidden rounded-input border border-border bg-surface-2"
              style={{ width: 120, height: 120 * (state.height / state.width) }}
            >
              <img
                src={convertFileSrc(result.posterPath)}
                alt="Náhledový obrázek"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="font-mono text-label text-text-muted">
              {formatBytes(result.posterSizeBytes ?? 0)}
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-3">
        <Button onClick={reveal}>
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          Zobrazit ve Finderu
        </Button>
        <Button variant="primary" onClick={onStartOver}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Zkomprimovat další video
        </Button>
      </div>
    </div>
  );
}
