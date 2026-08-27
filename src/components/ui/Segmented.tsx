/**
 * A small row of mutually exclusive choices, all visible at once.
 *
 * Used where the options are one word each — a dropdown would hide two of
 * three answers behind a click for no gain.
 */
interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the group — the visible label sits above it. */
  ariaLabel: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid grid-cols-3 gap-2"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={[
              "focus-ring rounded-input border px-3 py-4 text-center text-subtitle",
              "transition-colors duration-hover",
              selected
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface-2 text-text-muted hover:text-text",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
