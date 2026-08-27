/**
 * A two-option question rendered as a pair of pills — „Ano / Ne" and friends.
 *
 * Unanswered is a real state: both pills sit quiet until the user picks, which
 * is what makes the progressive reveal in the audio step legible.
 */
interface ChoiceProps<T extends string | boolean> {
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  ariaLabel: string;
}

export function Choice<T extends string | boolean>({
  value,
  options,
  onChange,
  ariaLabel,
}: ChoiceProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={[
              "focus-ring rounded-input border px-5 py-2 transition-colors duration-hover",
              selected
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
