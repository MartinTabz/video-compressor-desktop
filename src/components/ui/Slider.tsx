import { useId } from "react";

/**
 * A range input with the track drawn by us.
 *
 * The quality step needs a coloured segment *on the track* to mark the
 * recommended band, which no native range control offers, so the track is a
 * stack of divs and the input rides on top of it, invisible except its thumb.
 */

export interface SliderBand {
  /** Both in the same units as `min`/`max`. */
  from: number;
  to: number;
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Accessible name — the visible label lives outside the component. */
  ariaLabel: string;
  /** Highlighted stretch of track, e.g. the recommended quality band. */
  band?: SliderBand;
  /** Text under the two ends of the track. */
  minLabel?: string;
  maxLabel?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  band,
  minLabel,
  maxLabel,
}: SliderProps) {
  const id = useId();
  const span = Math.max(max - min, 0.0001);
  const percent = ((clamp(value, min, max) - min) / span) * 100;

  const bandLeft = band ? ((clamp(band.from, min, max) - min) / span) * 100 : 0;
  const bandRight = band ? ((clamp(band.to, min, max) - min) / span) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-6">
        {/* Empty track */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2" />

        {band && (
          <div
            className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-soft"
            style={{ left: `${bandLeft}%`, width: `${Math.max(0, bandRight - bandLeft)}%` }}
          />
        )}

        {/* Filled part, up to the thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />

        <input
          id={id}
          type="range"
          className="range-input focus-ring absolute inset-0 w-full cursor-pointer appearance-none bg-transparent"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-label={ariaLabel}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>

      {(minLabel || maxLabel) && (
        <div className="flex justify-between font-mono text-label text-text-muted">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
