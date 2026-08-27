import { save } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ImageIcon } from "lucide-react";

import type { VideoMetadata, WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Slider } from "../ui/Slider";
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
          label="Uložit i náhledový obrázek (poster)"
          description="Obrázek, který se na webu zobrazí, než uživatel spustí video."
        >
          {state.poster.enabled && (
            <div className="flex animate-step flex-col gap-6 rounded-card border border-border bg-surface p-4">
              <PosterPicker state={state} meta={meta} dispatch={dispatch} />

              <Checkbox
                checked={state.poster.alsoWebp}
                onChange={(enabled) => dispatch({ type: "setPosterWebp", enabled })}
                label="Uložit poster i jako WebP"
                description="Moderní formát, který je o polovinu menší. Podporují ho všechny současné prohlížeče."
              />
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
    <div className="flex items-start gap-6">
      {/* Height-constrained: a 9:16 poster must not stretch the panel. */}
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-input border border-border bg-surface-2"
        style={{ width: 120, height: 180 }}
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

      <div className="flex flex-1 flex-col gap-3">
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
        />

        <p className="text-text-muted">
          Vyber snímek, na kterém je člověk dobře vidět a dívá se do kamery.
        </p>
      </div>
    </div>
  );
}
