import { useCallback } from "react";
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

  return (
    <div className="flex flex-col gap-6">
      <div
        className={[
          "flex flex-col items-center justify-center gap-4 rounded-card border border-dashed px-6 py-12 text-center",
          "transition-colors duration-hover",
          isOver ? "border-accent bg-accent-soft" : "border-border bg-surface",
        ].join(" ")}
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

      {error && (
        <p role="alert" className="rounded-input border border-border bg-surface-2 p-4 text-danger">
          {error}
        </p>
      )}

      {metadata && !loading && <VideoInfoCard meta={metadata} />}
    </div>
  );
}

/** The card that proves the app understood the file. */
function VideoInfoCard({ meta }: { meta: VideoMetadata }) {
  // A still from the very first moment; a black frame at 0.0 is common, so
  // sample a fraction of a second in.
  const { src } = useFrame(meta, Math.min(0.2, meta.durationSeconds / 2), 0);

  const portrait = meta.orientation === "portrait";

  return (
    <div className="flex gap-6 rounded-card border border-border bg-surface p-6">
      {/* Constrained by height, never by width: a 9:16 still must not become a
          tower that pushes the facts off the card. */}
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-input border border-border bg-surface-2"
        style={{ width: 160, height: 160 }}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <FileVideo className="h-6 w-6 text-text-muted" aria-hidden="true" />
        )}
      </div>

      <dl className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="label">Soubor</dt>
          <dd className="truncate text-text" title={meta.fileName}>
            {meta.fileName}
          </dd>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Fact label="Velikost" value={formatBytes(meta.fileSizeBytes)} />
          <Fact label="Délka" value={formatDuration(meta.durationSeconds)} />
          <Fact
            label="Rozlišení"
            value={formatDimensions(meta.width, meta.height)}
            badge={portrait ? "Na výšku" : meta.orientation === "landscape" ? "Na šířku" : "Čtverec"}
          />
          <Fact label="Plynulost" value={formatFps(meta.fps)} />
        </div>

        <div className="flex items-center gap-2 text-text-muted">
          {meta.hasAudio ? (
            <Music className="h-4 w-4" aria-hidden="true" />
          ) : (
            <VolumeX className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{meta.hasAudio ? "Obsahuje zvuk" : "Bez zvukové stopy"}</span>
        </div>
      </dl>
    </div>
  );
}

function Fact({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="font-mono text-text">{value}</span>
        {badge && (
          <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-label text-accent">
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
