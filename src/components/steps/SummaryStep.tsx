import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Zap } from "lucide-react";

import type { StepId, VideoMetadata, WizardState } from "../../types";
import { Button } from "../ui/Button";
import { buildArgs, toCommandString } from "../../lib/ffmpegArgs";
import {
  formatDimensions,
  formatDuration,
  formatFps,
  formatNumber,
  savingsPercent,
} from "../../lib/format";
import { qualityBand } from "../../lib/quality";
import { estimateSizeForConfig, formatBytes, formatEstimate } from "../../lib/size";
import { audioSummary, speedLabel } from "../../lib/speed";
import { audioModeOf, configFromState } from "../../lib/wizard";

/**
 * The recap, in the user's language. Not one ffmpeg parameter appears above
 * the fold — the real command lives inside a disclosure for whoever wants it.
 */
interface SummaryStepProps {
  state: WizardState;
  meta: VideoMetadata;
  onEdit: (step: StepId) => void;
  onStart: () => void;
}

export function SummaryStep({ state, meta, onEdit, onStart }: SummaryStepProps) {
  const config = useMemo(() => configFromState(state), [state]);

  const estimate = useMemo(
    () =>
      config
        ? estimateSizeForConfig(config, {
            width: meta.width,
            height: meta.height,
            fps: state.fps,
            durationSeconds: meta.durationSeconds,
          })
        : 0,
    [config, state.fps, meta.width, meta.height, meta.durationSeconds],
  );

  const savings = savingsPercent(meta.fileSizeBytes, estimate);
  const audio = audioModeOf(state) ?? "none";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
        <span className="label">Vstup</span>
        <span className="truncate text-text" title={meta.fileName}>
          {meta.fileName}
        </span>
        <span className="font-mono text-label text-text-muted">
          {formatBytes(meta.fileSizeBytes)} · {formatDimensions(meta.width, meta.height)}{" "}
          · {formatFps(meta.fps)} · {formatDuration(meta.durationSeconds)}
        </span>
      </div>

      <dl className="flex flex-col">
        <Row
          label="Rozlišení"
          value={formatDimensions(state.width, state.height)}
          mono
          onEdit={() => onEdit("resolution")}
        />
        <Row
          label="Plynulost"
          value={`${formatNumber(state.fps)} snímků za sekundu`}
          onEdit={() => onEdit("framerate")}
        />
        <Row
          label="Kvalita"
          value={`${state.qualityPercent} % – ${qualityBand(state.qualityPercent).label}`}
          onEdit={() => onEdit("quality")}
        />
        <Row
          label="Zpracování"
          value={speedLabel(state.speed)}
          onEdit={() => onEdit("speed")}
        />
        <Row
          label="Zvuk"
          value={
            meta.hasAudio ? audioSummary(audio) : "Zdroj nemá zvuk – krok přeskočen"
          }
          onEdit={meta.hasAudio ? () => onEdit("audio") : undefined}
        />
        <Row
          label="Uložit do"
          value={state.outputPath}
          truncate
          onEdit={() => onEdit("output")}
        />
        <Row
          label="Poster"
          value={
            state.poster.enabled
              ? `Ano, z času ${formatDuration(state.poster.timeSeconds)}${
                  state.poster.alsoWebp ? " · včetně WebP" : ""
                }`
              : "Ne"
          }
          onEdit={() => onEdit("output")}
        />
      </dl>

      <div className="flex items-baseline justify-between rounded-card border border-border bg-surface p-4">
        <span className="label">Odhadovaná velikost</span>
        <span className="figure text-accent">
          {formatEstimate(estimate)}
          <span className="ml-3 font-sans text-body font-normal tracking-normal text-text-muted">
            (úspora {savings} %)
          </span>
        </span>
      </div>

      {config && <TechnicalDetails command={toCommandString(buildArgs(config))} />}

      <Button variant="primary" block onClick={onStart}>
        <Zap className="h-4 w-4" aria-hidden="true" />
        Zkomprimovat video
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  truncate = false,
  onEdit,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="w-24 shrink-0 text-text-muted">{label}</dt>
      <dd
        className={[
          "min-w-0 flex-1 text-text",
          mono ? "font-mono" : "",
          truncate ? "truncate" : "break-words",
        ].join(" ")}
        title={value}
      >
        {value}
      </dd>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="focus-ring shrink-0 rounded-input px-2 py-1 text-label text-text-muted transition-colors duration-hover hover:text-accent"
        >
          upravit
        </button>
      )}
    </div>
  );
}

/** Collapsed by default: this is for the one person who wants to check. */
function TechnicalDetails({ command }: { command: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (cause) {
      console.error("clipboard write failed:", cause);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex items-center gap-2 self-start rounded-input text-text-muted transition-colors duration-hover hover:text-text"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-hover ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        Zobrazit technické detaily
      </button>

      {open && (
        <div className="flex animate-step flex-col gap-3">
          <pre className="overflow-x-auto rounded-input border border-border bg-surface-2 p-4 font-mono text-label leading-5 text-text">
            {command}
          </pre>
          <Button onClick={copy} className="self-start">
            {copied ? (
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Zkopírováno" : "Kopírovat"}
          </Button>
        </div>
      )}
    </div>
  );
}
