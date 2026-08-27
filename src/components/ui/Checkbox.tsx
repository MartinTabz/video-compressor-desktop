import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** A checkbox with room for the sentence that explains what it does. */
interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  children?: ReactNode;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  children,
}: CheckboxProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-input border border-border bg-surface-2 checked:border-accent checked:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
          {checked && (
            <Check
              className="pointer-events-none relative h-3 w-3 text-accent"
              strokeWidth={3}
              aria-hidden="true"
            />
          )}
        </span>

        <span className="flex flex-col gap-1">
          <span className="text-text">{label}</span>
          {description && <span className="text-text-muted">{description}</span>}
        </span>
      </label>

      {children}
    </div>
  );
}
