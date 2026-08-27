import type { VideoMetadata, WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { Slider } from "../ui/Slider";
import { formatFps } from "../../lib/format";
import {
  MIN_FPS,
  frameRateCeiling,
  frameRateDescription,
  frameRatePresets,
} from "../../lib/framerate";

/**
 * Frame rate, capped at whatever the camera recorded. Asking for more frames
 * than exist only duplicates them and grows the file.
 */
interface FrameRateStepProps {
  state: WizardState;
  meta: VideoMetadata;
  dispatch: (action: WizardAction) => void;
}

export function FrameRateStep({ state, meta, dispatch }: FrameRateStepProps) {
  const ceiling = frameRateCeiling(meta);
  const presets = frameRatePresets(meta);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="label">Snímků za sekundu</span>
          <span className="font-mono text-title text-accent">
            {formatFps(state.fps)}
          </span>
        </div>

        <Slider
          value={state.fps}
          min={MIN_FPS}
          max={ceiling}
          step={0.1}
          onChange={(fps) => dispatch({ type: "setFps", fps })}
          ariaLabel="Snímků za sekundu"
          minLabel={String(MIN_FPS)}
          maxLabel={String(ceiling)}
        />

        <p className="text-text-muted">{frameRateDescription(state.fps)}</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="label">Rychlá volba</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const selected = Math.abs(state.fps - preset.value) < 0.05;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => dispatch({ type: "setFps", fps: preset.value })}
                className={[
                  "focus-ring flex flex-col items-start gap-1 rounded-input border px-4 py-2",
                  "transition-colors duration-hover",
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface text-text hover:bg-surface-2",
                ].join(" ")}
              >
                <span>{preset.label}</span>
                <span className="font-mono text-label text-text-muted">
                  {formatFps(preset.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-text-muted">
        Víc snímků, než má původní video, nemá smysl – proto je {formatFps(ceiling)} strop.
      </p>
    </div>
  );
}
