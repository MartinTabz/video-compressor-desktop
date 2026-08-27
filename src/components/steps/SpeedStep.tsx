import type { WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { SelectCard } from "../ui/SelectCard";
import { SPEED_NOTE, SPEED_OPTIONS } from "../../lib/speed";

/**
 * How long the encoder may spend looking for savings. Cards rather than a
 * dropdown, because the description is the part that decides it.
 */
interface SpeedStepProps {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}

export function SpeedStep({ state, dispatch }: SpeedStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Rychlost zpracování" className="flex flex-col gap-3">
        {SPEED_OPTIONS.map((option) => (
          <SelectCard
            key={option.value}
            selected={state.speed === option.value}
            onSelect={() => dispatch({ type: "setSpeed", speed: option.value })}
            title={option.label}
            description={option.description}
            badge={
              option.recommended ? (
                <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-label text-accent">
                  Výchozí
                </span>
              ) : undefined
            }
          />
        ))}
      </div>

      <p className="text-text-muted">{SPEED_NOTE}</p>
    </div>
  );
}
