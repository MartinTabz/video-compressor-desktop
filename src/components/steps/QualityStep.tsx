import type { VideoMetadata, WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { ShapeProxy } from "../ui/ShapeProxy";
import { Slider } from "../ui/Slider";
import { RECOMMENDED_RANGE, qualityBand } from "../../lib/quality";
import { estimateSizeForConfig, formatEstimate } from "../../lib/size";
import { configFromState } from "../../lib/wizard";

/**
 * Quality as a percentage. The CRF number this maps to never appears anywhere
 * the user can see — it lives in `buildArgs` and in the technical details
 * panel of the summary, which is opt-in.
 */
interface QualityStepProps {
  state: WizardState;
  meta: VideoMetadata;
  dispatch: (action: WizardAction) => void;
}

export function QualityStep({ state, meta, dispatch }: QualityStepProps) {
  const band = qualityBand(state.qualityPercent);
  const config = configFromState(state);
  const estimate = config
    ? estimateSizeForConfig(config, {
        width: meta.width,
        height: meta.height,
        fps: state.fps,
        durationSeconds: meta.durationSeconds,
      })
    : 0;

  return (
    <div className="flex items-start gap-8">
      <div className="flex flex-1 flex-col gap-8">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-end">
              <span className="font-mono text-title text-accent">
                {state.qualityPercent} %
              </span>
            </div>

            <Slider
              value={state.qualityPercent}
              min={0}
              max={100}
              onChange={(percent) => dispatch({ type: "setQuality", percent })}
              ariaLabel="Kvalita v procentech"
              band={{ from: RECOMMENDED_RANGE.min, to: RECOMMENDED_RANGE.max }}
              minLabel="0 %"
              maxLabel="100 %"
              compactLabels
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <p className={band.recommended ? "text-accent" : "text-text"}>
              {band.label}
            </p>
            <p className="text-text-muted">{band.description}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
          <p className="label">Odhad velikosti</p>
          <p className="font-mono text-title text-text">{formatEstimate(estimate)}</p>
          <p className="text-label text-text-muted">
            Pouze odhad, výsledek záleží na pohybu ve videu
          </p>
        </div>
      </div>

      <ShapeProxy
        width={state.width}
        height={state.height}
        mode="quality"
        quality={state.qualityPercent}
      />
    </div>
  );
}
