import type { ReactNode } from "react";

/**
 * One choice in a group of cards. Used for the speed presets, where a dropdown
 * would hide the descriptions that make the choice make sense.
 */
interface SelectCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  /** Small amber note in the corner, e.g. „Výchozí". */
  badge?: ReactNode;
}

export function SelectCard({
  selected,
  onSelect,
  title,
  description,
  badge,
}: SelectCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "focus-ring flex w-full flex-col gap-1 rounded-card border p-4 text-left",
        "transition-colors duration-hover",
        selected
          ? "border-accent bg-accent-soft"
          : "border-border bg-surface hover:bg-surface-2",
      ].join(" ")}
    >
      <span className="flex items-center justify-between gap-3">
        <span className={selected ? "font-medium text-accent" : "font-medium text-text"}>
          {title}
        </span>
        {badge}
      </span>
      <span className="text-text-muted">{description}</span>
    </button>
  );
}
