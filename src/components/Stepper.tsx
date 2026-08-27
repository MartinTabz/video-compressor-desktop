import { Check, Minus } from "lucide-react";

import type { StepId, WizardState } from "../types";
import { STEPS, canJumpTo, isStepSkipped, stepIndex } from "../lib/wizard";

/**
 * The row of numbered steps across the top.
 *
 * Anything already reached is a link back to itself; a step the file made
 * irrelevant — the audio question on a silent clip — shows as skipped rather
 * than disappearing, so the count never changes under the user.
 */
interface StepperProps {
  state: WizardState;
  onJump: (step: StepId) => void;
}

export function Stepper({ state, onJump }: StepperProps) {
  const current = stepIndex(state.step);

  return (
    <nav aria-label="Kroky" className="flex items-start">
      {STEPS.map((step, index) => {
        const skipped = isStepSkipped(state, step.id);
        const done = index < current && !skipped;
        const active = index === current;
        const reachable = canJumpTo(state, step.id) && !active;

        return (
          <div key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <Connector visible={index > 0} filled={index <= current} />

              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                onClick={() => onJump(step.id)}
                className={[
                  "focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-label",
                  "transition-colors duration-hover",
                  active
                    ? "border-accent bg-accent text-bg"
                    : done
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface text-text-muted",
                  skipped ? "opacity-50" : "",
                  reachable ? "cursor-pointer hover:bg-surface-2" : "cursor-default",
                ].join(" ")}
              >
                {skipped ? (
                  <Minus className="h-3 w-3" aria-hidden="true" />
                ) : done ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </button>

              <Connector visible={index < STEPS.length - 1} filled={index < current} />
            </div>

            <span
              className={[
                "max-w-full truncate text-label",
                active ? "text-accent" : "text-text-muted",
                skipped ? "line-through opacity-60" : "",
              ].join(" ")}
              title={skipped ? `${step.label} — přeskočeno` : step.label}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/** The hairline between two step markers. Invisible at both ends of the row. */
function Connector({ visible, filled }: { visible: boolean; filled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "h-px flex-1 transition-colors duration-hover",
        !visible ? "bg-transparent" : filled ? "bg-accent" : "bg-border",
      ].join(" ")}
    />
  );
}
