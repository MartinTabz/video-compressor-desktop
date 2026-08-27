import { save } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ImageIcon } from "lucide-react";

import type { VideoMetadata, WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Segmented } from "../ui/Segmented";
import { Slider } from "../ui/Slider";
import { POSTER_FORMATS } from "../../lib/poster";
import {
  baseName,
  defaultOutputName,
  directoryOf,
  formatDuration,
} from "../../lib/format";
import { useFrame } from "../../hooks/useFrame";

/**
 * Where the file lands, plus the optional poster image.
 *
 * The poster picker extracts a real frame on a debounce, so what the user sees
 * is the frame that will actually be written — not an approximation.
 */
interface OutputStepProps {
  state: WizardState;
  meta: VideoMetadata;
  dispatch: (action: WizardAction) => void;
  onError: (message: string) => void;
}

export function OutputStep({ state, meta, dispatch, onError }: OutputStepProps) {
  async function chooseLocation() {
    try {
      const selected = await save({
        defaultPath: state.outputPath || defaultOutputName(meta.fileName),
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });
      if (typeof selected === "string") {
        dispatch({ type: "setOutputPath", path: selected });
      }
    } catch (cause) {
      console.error("save dialog failed:", cause);
      onError("Dialog pro uložení se nepodařilo otevřít.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="label">Kam soubor uložit</p>

        <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
          <FolderOpen className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-text" title={state.outputPath}>
              {baseName(state.outputPath)}
            </span>
            <span
              className="truncate text-label text-text-muted"
              title={directoryOf(state.outputPath)}
            >
              {directoryOf(state.outputPath)}
            </span>
          </div>
          <Button onClick={chooseLocation}>
            {state.outputPath ? "Změnit" : "Vybrat, kam uložit"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Checkbox
          checked={state.poster.enabled}
          onChange={(enabled) => dispatch({ type: "setPosterEnabled", enabled })}
          label="Uložit i náhledový obrázek"
        >
          {state.poster.enabled && (
            <div className="animate-step rounded-card border border-border bg-surface p-4">
              <PosterPicker state={state} meta={meta} dispatch={dispatch} />
            </div>
          )}
        </Checkbox>
      </div>
    </div>
  );
}

/** Scrub the video, see the frame. Debounced so ffmpeg is not run per pixel. */
function PosterPicker({
  state,
  meta,
  dispatch,
}: {
  state: WizardState;
  meta: VideoMetadata;
  dispatch: (action: WizardAction) => void;
}) {
  const { src, loading } = useFrame(meta, state.poster.timeSeconds);

  // A very short clip still gets a working slider; it just has less to cover.
  const max = Math.max(0.1, meta.durationSeconds - 0.05);

  return (
    <div className="flex items-stretch gap-6">
      {/* Stretches to whatever the controls need, so the card has no dead space. */}
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-input border border-border bg-surface-2"
        style={{ aspectRatio: meta.width / meta.height, minHeight: 176, maxWidth: 116 }}
      >
        {src ? (
          <img
            src={src}
            alt="Náhled vybraného snímku"
            className={`h-full w-full object-contain transition-opacity duration-hover ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          />
        ) : (
          <ImageIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="label">Snímek z času</span>
            <span className="font-mono text-text">
              {formatDuration(state.poster.timeSeconds)}
            </span>
          </div>

          <Slider
            value={state.poster.timeSeconds}
            min={0}
            max={max}
            step={0.1}
            onChange={(seconds) => dispatch({ type: "setPosterTime", seconds })}
            ariaLabel="Čas náhledového snímku"
            minLabel="0:00"
            maxLabel={formatDuration(meta.durationSeconds)}
            compactLabels
          />
        </div>

        <div className="flex flex-col">
          <Segmented
            value={state.poster.format}
            options={POSTER_FORMATS}
            onChange={(format) => dispatch({ type: "setPosterFormat", format })}
            ariaLabel="Formát náhledového obrázku"
          />
        </div>
      </div>
    </div>
  );
}
