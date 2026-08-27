import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, FileVideo, Loader2 } from "lucide-react";

import { useVideoMetadata } from "./hooks/useVideoMetadata";
import { buildArgs, toCommandString } from "./lib/ffmpegArgs";
import {
  dimensionsForLongerSide,
  resolutionPresets,
} from "./lib/orientation";
import { DEFAULT_QUALITY_PERCENT, crfFromQuality, qualityBand } from "./lib/quality";
import { estimateSizeForConfig, formatBytes, formatEstimate } from "./lib/size";
import type { EncodeConfig, Orientation, VideoMetadata } from "./types";

/**
 * Phase 2 debug screen. Disposable — phase 3 replaces it with the wizard.
 *
 * Its only job is to let a human check the orientation math against real
 * files: what came out of ffprobe, what the presets resolve to, and the exact
 * command that would run.
 */

/** The target used for the headline sanity check: 540p, i.e. 960 on the long edge. */
const SANITY_CHECK_TARGET = 960;

const ORIENTATION_LABEL: Record<Orientation, string> = {
  portrait: "PORTRAIT — na výšku",
  landscape: "LANDSCAPE — na šířku",
  square: "SQUARE — čtverec",
};

export default function App() {
  const { metadata, loading, error, probe } = useVideoMetadata();
  const [pickError, setPickError] = useState<string | null>(null);

  async function pickFile() {
    setPickError(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"] }],
      });
      if (typeof selected === "string") {
        await probe(selected);
      }
    } catch (cause) {
      console.error("file dialog failed:", cause);
      setPickError("Nepodařilo se otevřít dialog pro výběr souboru.");
    }
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-16">
      <div className="mx-auto flex max-w-content flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="label">Fáze 2 — ladicí obrazovka</p>
          <h1 className="step-title">Kontrola metadat</h1>
          <p className="text-text-muted">
            Dočasná obrazovka pro ověření orientace a výpočtu rozměrů na
            skutečných souborech.
          </p>
        </header>

        <button
          type="button"
          onClick={pickFile}
          disabled={loading}
          className="focus-ring inline-flex items-center justify-center gap-2 self-start rounded-card bg-accent px-5 py-3 font-medium text-bg transition-colors duration-hover hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileVideo className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? "Načítám…" : "Vybrat video"}
        </button>

        {(error ?? pickError) && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-input border border-border bg-surface-2 p-4"
          >
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
            <p className="text-text-muted">{error ?? pickError}</p>
          </div>
        )}

        {metadata && <Report meta={metadata} />}
      </div>
    </main>
  );
}

function Report({ meta }: { meta: VideoMetadata }) {
  const presets = useMemo(() => resolutionPresets(meta), [meta]);

  const sanity = useMemo(
    () => dimensionsForLongerSide(meta, SANITY_CHECK_TARGET),
    [meta],
  );

  const config = useMemo<EncodeConfig>(
    () => ({
      inputPath: meta.path,
      outputPath: outputPathFor(meta.path),
      width: sanity.width,
      height: sanity.height,
      qualityPercent: DEFAULT_QUALITY_PERCENT,
      speed: "slow",
      audio: meta.hasAudio ? "speech" : "none",
      hasAudio: meta.hasAudio,
    }),
    [meta, sanity],
  );

  const command = useMemo(() => toCommandString(buildArgs(config)), [config]);
  const estimate = useMemo(() => estimateSizeForConfig(config, meta), [config, meta]);

  const swapped = meta.rotation % 180 === 90;

  return (
    <div className="flex flex-col gap-8">
      <OrientationBadge orientation={meta.orientation} />

      <Section title="Metadata">
        <dl className="flex flex-col">
          <Row label="Soubor" value={meta.fileName} />
          <Row label="Velikost" value={formatBytes(meta.fileSizeBytes)} mono />
          <Row
            label="Rozměry na obrazovce"
            value={`${meta.width} × ${meta.height}`}
            mono
            emphasis
          />
          <Row
            label="Rozměry ve streamu"
            value={`${meta.streamWidth} × ${meta.streamHeight}${swapped ? "  (prohozeno)" : ""}`}
            mono
          />
          <Row label="Rotace" value={`${meta.rotation}°`} mono />
          <Row label="Poměr stran" value={meta.aspectRatio.toFixed(4)} mono />
          <Row label="Snímků za sekundu" value={`${meta.fps} fps`} mono />
          <Row label="Délka" value={formatDuration(meta.durationSeconds)} mono />
          <Row label="Obrazový kodek" value={meta.videoCodec ?? "—"} mono />
          <Row
            label="Zvuk"
            value={meta.hasAudio ? (meta.audioCodec ?? "ano") : "žádný zvuk"}
            mono
          />
          <Row label="Cesta" value={meta.path} />
        </dl>
      </Section>

      <Section title="Rozlišení">
        <dl className="flex flex-col">
          {presets.map((preset) => (
            <Row
              key={preset.id}
              label={preset.label}
              value={`${preset.width} × ${preset.height}   (delší strana ${preset.targetLongerSide})`}
              mono
            />
          ))}
        </dl>
      </Section>

      <Section title={`Kontrola — cíl ${SANITY_CHECK_TARGET} na delší straně`}>
        <p className="font-mono text-text">
          scale={sanity.width}:{sanity.height}
        </p>
        <p className="text-text-muted">
          {sanity.width <= meta.width && sanity.height <= meta.height
            ? "Zmenšeno správně — ani jedna strana nepřesahuje zdroj."
            : "CHYBA: výstup je větší než zdroj."}
        </p>
      </Section>

      <Section title="Výchozí nastavení">
        <dl className="flex flex-col">
          <Row
            label="Kvalita"
            value={`${DEFAULT_QUALITY_PERCENT} % — ${qualityBand(DEFAULT_QUALITY_PERCENT).label} (CRF ${crfFromQuality(DEFAULT_QUALITY_PERCENT)})`}
          />
          <Row label="Rychlost" value="slow" mono />
          <Row label="Zvuk" value={config.hasAudio ? "mluvené slovo" : "bez zvuku"} />
          <Row label="Odhad velikosti" value={formatEstimate(estimate)} mono emphasis />
        </dl>
      </Section>

      <Section title="Příkaz">
        <pre className="overflow-x-auto rounded-input border border-border bg-surface-2 p-4 font-mono text-label leading-5 text-text">
          {command}
        </pre>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(command)}
          className="focus-ring self-start rounded-input border border-border px-4 py-2 text-text-muted transition-colors duration-hover hover:bg-surface-2 hover:text-text"
        >
          Kopírovat
        </button>
      </Section>
    </div>
  );
}

function OrientationBadge({ orientation }: { orientation: Orientation }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-6">
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-input border border-accent bg-accent-soft ${
          orientation === "portrait"
            ? "h-16 w-9"
            : orientation === "landscape"
              ? "h-9 w-16"
              : "h-12 w-12"
        }`}
      />
      <p className="font-mono text-title font-semibold tracking-title text-accent">
        {ORIENTATION_LABEL[orientation]}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right ${mono ? "font-mono" : ""} ${
          emphasis ? "text-accent" : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** `clip.mov` → `clip-web.mp4`, next to the original. Placeholder until step 8. */
function outputPathFor(inputPath: string): string {
  const separator = inputPath.includes("\\") ? "\\" : "/";
  const cut = inputPath.lastIndexOf(separator);
  const directory = cut === -1 ? "" : inputPath.slice(0, cut + 1);
  const fileName = cut === -1 ? inputPath : inputPath.slice(cut + 1);
  const dot = fileName.lastIndexOf(".");
  const stem = dot === -1 ? fileName : fileName.slice(0, dot);
  return `${directory}${stem}-web.mp4`;
}

/** `41` → `0:41`, `125` → `2:05`. */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
