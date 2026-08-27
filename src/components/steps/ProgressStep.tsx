import { useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { CheckCircle2, FolderOpen, RotateCcw, XCircle } from "lucide-react";

import type { VideoMetadata, WizardState } from "../../types";
import type { UseEncoder } from "../../hooks/useEncoder";
import { Button } from "../ui/Button";
import { ShapeProxy } from "../ui/ShapeProxy";
import { formatRemaining, formatSpeed, savingsPercent } from "../../lib/format";
import { formatBytes } from "../../lib/size";
import { useFrame } from "../../hooks/useFrame";

/**
 * The encode itself.
 *
 * The progress indicator is the shape proxy, filling bottom to top like a
 * container — a horizontal bar would say nothing about what is being made.
 */
interface ProgressStepProps {
  state: WizardState;
  meta: VideoMetadata;
  encoder: UseEncoder;
  onBackToSummary: () => void;
  onStartOver: () => void;
}

export function ProgressStep({
  state,
  meta,
  encoder,
  onBackToSummary,
  onStartOver,
}: ProgressStepProps) {
  if (encoder.status === "done" && encoder.result) {
    return (
      <ResultView
        state={state}
        meta={meta}
        result={encoder.result}
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
        <Button onClick={onBackToSummary}>Zpět na souhrn</Button>
      </div>
    );
  }

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

      <div className="flex items-center gap-6 font-mono text-text-muted">
        <span>{encoder.speed !== null ? formatSpeed(encoder.speed) : "—"}</span>
        <span aria-hidden="true">·</span>
        <span>{formatRemaining(encoder.remainingSeconds)}</span>
      </div>

      <Button onClick={encoder.cancel}>Zrušit</Button>
    </div>
  );
}

/** What the user came for: the two numbers and the file itself. */
function ResultView({
  state,
  meta,
  result,
  onStartOver,
}: {
  state: WizardState;
  meta: VideoMetadata;
  result: NonNullable<UseEncoder["result"]>;
  onStartOver: () => void;
}) {
  const savings = savingsPercent(result.originalSizeBytes, result.outputSizeBytes);

  // The finished file is what should play here. Until it exists — the phase 3
  // encoder only pretends — fall back to the source, which has the same frames.
  const [videoSrc, setVideoSrc] = useState(() => convertFileSrc(result.outputPath));

  const poster = useFrame(
    state.poster.enabled ? meta : null,
    state.poster.timeSeconds,
    0,
  );

  async function reveal() {
    try {
      await invoke("reveal_in_file_manager", { path: result.outputPath });
    } catch (cause) {
      console.error("reveal failed:", cause);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden="true" />
        <p className="font-mono text-title text-text">
          {formatBytes(result.originalSizeBytes)} →{" "}
          <span className="text-success">{formatBytes(result.outputSizeBytes)}</span>
          <span className="ml-3 text-body text-text-muted">(úspora {savings} %)</span>
        </p>
      </div>

      <div className="flex items-start justify-center gap-6">
        {/* Height-constrained so a 9:16 result stays on screen whole. */}
        <video
          src={videoSrc}
          controls
          className="rounded-card border border-border bg-surface-2"
          style={{ maxHeight: 320, maxWidth: "100%" }}
          onError={() => {
            const source = convertFileSrc(meta.path);
            if (videoSrc !== source) setVideoSrc(source);
          }}
        />

        {result.posterPath && (
          <div className="flex flex-col gap-2">
            <span className="label">Poster</span>
            <div
              className="flex items-center justify-center overflow-hidden rounded-input border border-border bg-surface-2"
              style={{ width: 120, height: 180 }}
            >
              {poster.src && (
                <img src={poster.src} alt="Náhledový obrázek" className="h-full w-full object-contain" />
              )}
            </div>
            <span className="font-mono text-label text-text-muted">
              {formatBytes(result.posterSizeBytes ?? 0)}
              {result.webpSizeBytes !== null && (
                <> · WebP {formatBytes(result.webpSizeBytes)}</>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
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
