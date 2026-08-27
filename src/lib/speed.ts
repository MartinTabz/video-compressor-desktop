import type { AudioMode, SpeedPreset } from "../types";

/**
 * The encoding-speed cards and the audio wording. Both are pure copy tables,
 * kept out of the components so the summary step and the step itself cannot
 * drift apart.
 */

export interface SpeedOption {
  value: SpeedPreset;
  label: string;
  description: string;
  /** The one the app starts on, marked in the card. */
  recommended: boolean;
}

export const SPEED_OPTIONS: SpeedOption[] = [
  {
    value: "veryfast",
    label: "Rychlé",
    description: "Hotovo za pár sekund. Soubor bude o něco větší.",
    recommended: false,
  },
  {
    value: "medium",
    label: "Vyvážené",
    description: "Rozumný kompromis mezi časem a velikostí.",
    recommended: false,
  },
  {
    value: "slow",
    label: "Doporučeno",
    description: "Trvá déle, ale soubor bude nejmenší při stejné kvalitě.",
    recommended: true,
  },
  {
    value: "veryslow",
    label: "Nejmenší soubor",
    description: "Může trvat i několik minut. Rozdíl oproti „Doporučeno“ je malý.",
    recommended: false,
  },
];

/** Reassurance that this setting is not the quality setting. Shown as the step hint. */
export const SPEED_NOTE =
  "Tohle nastavení neovlivňuje kvalitu obrazu, jen jak dlouho aplikace hledá způsoby, jak soubor zmenšit.";

export const DEFAULT_SPEED: SpeedPreset = "slow";

/** The card label for a value, for the summary row. */
export function speedLabel(speed: SpeedPreset): string {
  return SPEED_OPTIONS.find((option) => option.value === speed)?.label ?? speed;
}

/** How the audio choice reads in the summary. */
export function audioSummary(mode: AudioMode): string {
  switch (mode) {
    case "none":
      return "Bez zvuku";
    case "speech":
      return "Zachovat – jen mluvené slovo";
    case "music":
      return "Zachovat – hudba nebo ruchy";
  }
}
