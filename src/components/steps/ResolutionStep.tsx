import { Link, Unlink } from "lucide-react";

import type { VideoMetadata, WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { ShapeProxy } from "../ui/ShapeProxy";
import { formatDimensions } from "../../lib/format";
import { resolutionPresets, toEven } from "../../lib/orientation";

/**
 * Width and height, with the source resolution as a ceiling in every
 * direction. There is no path through this step that produces a bigger frame
 * than the one that came in.
 */
interface ResolutionStepProps {
  state: WizardState;
  meta: VideoMetadata;
  dispatch: (action: WizardAction) => void;
}

export function ResolutionStep({ state, meta, dispatch }: ResolutionStepProps) {
  const presets = resolutionPresets(meta);
  const maxWidth = toEven(meta.width);
  const maxHeight = toEven(meta.height);

  return (
    <div className="flex items-start gap-8">
      <div className="flex flex-1 flex-col gap-10">
        <div className="flex items-end gap-3">
          <DimensionField
            label="Šířka"
            value={state.width}
            max={maxWidth}
            onChange={(width) => dispatch({ type: "setWidth", width })}
            onBlur={() => dispatch({ type: "normalizeDimensions" })}
          />

          <button
            type="button"
            onClick={() => dispatch({ type: "toggleAspectLock" })}
            aria-pressed={state.lockAspect}
            aria-label={
              state.lockAspect
                ? "Zámek poměru stran je zapnutý"
                : "Zámek poměru stran je vypnutý"
            }
            className={[
              "focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-input border",
              "transition-colors duration-hover",
              state.lockAspect
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
            ].join(" ")}
          >
            {state.lockAspect ? (
              <Link className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Unlink className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <DimensionField
            label="Výška"
            value={state.height}
            max={maxHeight}
            onChange={(height) => dispatch({ type: "setHeight", height })}
            onBlur={() => dispatch({ type: "normalizeDimensions" })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="label">Rychlá volba</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => {
              const selected =
                preset.width === state.width && preset.height === state.height;

              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    dispatch({
                      type: "setDimensions",
                      width: preset.width,
                      height: preset.height,
                    })
                  }
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
                    {formatDimensions(preset.width, preset.height)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ShapeProxy width={state.width} height={state.height} />
    </div>
  );
}

/** A number input that cannot be typed above the source resolution. */
function DimensionField({
  label,
  value,
  max,
  onChange,
  onBlur,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-3">
      <span className="label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={2}
        max={max}
        step={2}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={onBlur}
        className="focus-ring h-10 w-full rounded-input border border-border bg-surface-2 px-4 font-mono text-text"
      />
    </label>
  );
}
