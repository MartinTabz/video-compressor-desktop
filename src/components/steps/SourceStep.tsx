import { useCallback } from "react";
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FileVideo, Loader2, Music, Upload, VolumeX } from "lucide-react";

import type { VideoMetadata } from "../../types";
import { Button } from "../ui/Button";
import { formatDimensions, formatDuration, formatFps } from "../../lib/format";
import { formatBytes } from "../../lib/size";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useFrame } from "../../hooks/useFrame";

/** What the file dialog and the drop zone both accept. */
export const ACCEPTED_EXTENSIONS = ["mp4", "mov", "avi", "mkv", "webm", "m4v"];

const UNSUPPORTED = "Tento typ souboru neumím zpracovat. Zkus MP4, MOV nebo AVI.";

/** Drop zone and loaded card are the same height, so nothing jumps on upload. */
const CARD_HEIGHT = 224;

interface SourceStepProps {
  metadata: VideoMetadata | null;
  loading: boolean;
  error: string | null;
  onPick: (path: string) => void;
  onError: (message: string) => void;
}

export function SourceStep({
  metadata,
  loading,
  error,
  onPick,
  onError,
}: SourceStepProps) {
  const handleDrop = useCallback(
    (paths: string[]) => {
      const path = paths[0];
      if (!path) return;
      if (!hasAcceptedExtension(path)) {
        onError(UNSUPPORTED);
        return;
      }
      onPick(path);
    },
    [onPick, onError],
  );

  // Dropping only makes sense while there is nothing loaded or something is
  // being replaced; the listener is cheap either way.
  const { isOver } = useFileDrop(handleDrop, !loading);

  async function pickFile() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Video", extensions: ACCEPTED_EXTENSIONS }],
      });
      if (typeof selected === "string") onPick(selected);
    } catch (cause) {
      console.error("file dialog failed:", cause);
      onError("Dialog pro výběr souboru se nepodařilo otevřít.");
    }
  }

  const hasVideo = Boolean(metadata) && !loading;

  return (
    // The negative bottom margin pulls the wizard buttons closer to the
    // replace link than the standard section gap would.
    <div className="-mb-4 flex flex-col gap-4">
      {hasVideo ? (
        <VideoInfoCard meta={metadata!} highlight={isOver} />
      ) : (
        <div
          className={[
            "flex flex-col items-center justify-center gap-4 rounded-card border border-dashed px-6 text-center",
            "transition-colors duration-hover",
            isOver ? "border-accent bg-accent-soft" : "border-border bg-surface",
          ].join(" ")}
          style={{ height: CARD_HEIGHT }}
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
          ) : (
            <Upload className="h-8 w-8 text-text-muted" aria-hidden="true" />
          )}

          <div className="flex flex-col gap-1">
            <p className="text-text">
              {loading ? "Načítám video…" : "Přetáhni sem video"}
            </p>
            <p className="text-text-muted">
              Podporované formáty: MP4, MOV, AVI, MKV, WebM, M4V
            </p>
          </div>

          <Button onClick={pickFile} disabled={loading}>
            <FileVideo className="h-4 w-4" aria-hidden="true" />
            Vybrat soubor
          </Button>
        </div>
      )}

      {/* The row exists in both states so the wizard buttons never move. */}
      <div className="flex h-6 items-center justify-center">
        {hasVideo && (
          <button type="button" onClick={pickFile} className="link text-label">
            Nahrát jiné video
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-input border border-border bg-surface-2 p-4 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The card that proves the app understood the file. It replaces the drop
    zone once a video is loaded — only one video is compressed at a time. */
function VideoInfoCard({
  meta,
  highlight,
}: {
  meta: VideoMetadata;
  highlight: boolean;
}) {
  // A still from the very first moment; a black frame at 0.0 is common, so
  // sample a fraction of a second in.
  const { src } = useFrame(meta, Math.min(0.2, meta.durationSeconds / 2), 0);

  const orientationLabel =
    meta.orientation === "portrait"
      ? "Na výšku"
      : meta.orientation === "landscape"
        ? "Na šířku"
        : "Čtverec";

  return (
    <div
      className={[
        "flex gap-5 rounded-card border bg-surface p-4 transition-colors duration-hover",
        highlight ? "border-accent bg-accent-soft" : "border-border",
      ].join(" ")}
      style={{ height: CARD_HEIGHT }}
    >
      {/* A fixed 4:5 window, full card height. The still is contained inside
          it, so a 9:16 clip and a 16:9 clip sit in the same frame. */}
      <div
        className="h-full shrink-0 overflow-hidden rounded-input border border-border bg-surface-2"
        style={{ aspectRatio: "4 / 5" }}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileVideo className="h-6 w-6 text-text-muted" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p
          className="truncate font-display text-subtitle font-bold tracking-title text-text"
          title={meta.fileName}
        >
          {meta.fileName}
        </p>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Fact label="Velikost" value={formatBytes(meta.fileSizeBytes)} />
          <Fact label="Délka" value={formatDuration(meta.durationSeconds)} />
          <Fact
            label="Rozlišení"
            value={formatDimensions(meta.width, meta.height)}
            badge={orientationLabel}
          />
          <Fact label="FPS" value={formatFps(meta.fps)} />
          <Fact
            label="Zvuk"
            value={meta.hasAudio ? "Obsahuje zvuk" : "Bez zvuku"}
            icon={
              meta.hasAudio ? (
                <Music className="h-4 w-4 text-text-muted" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4 text-text-muted" aria-hidden="true" />
              )
            }
            mono={false}
          />
        </dl>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  badge,
  icon,
  mono = true,
}: {
  label: string;
  value: string;
  badge?: string;
  icon?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="label">{label}</dt>
      <dd className="flex items-center gap-2">
        {icon}
        <span className={mono ? "truncate font-mono text-text" : "truncate text-text"}>
          {value}
        </span>
        {badge && (
          <span className="shrink-0 rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-label text-accent">
            {badge}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Extension check, so an unsupported drop fails with a sentence, not ffprobe. */
export function hasAcceptedExtension(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return ACCEPTED_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase());
}
