/**
 * Quality is a percentage everywhere the user can see it. CRF exists only
 * inside the argument builder.
 */

/** What the app starts on: small file, difference is barely visible. */
export const DEFAULT_QUALITY_PERCENT = 40;

/** The band the slider highlights on its track. */
export const RECOMMENDED_RANGE = { min: 25, max: 44 } as const;

export type QualityBandId =
  | "maximum"
  | "high"
  | "balanced"
  | "recommended"
  | "low";

export interface QualityBand {
  id: QualityBandId;
  /** Lowest percentage that still falls in this band. */
  min: number;
  /** Highest percentage in this band. */
  max: number;
  label: string;
  description: string;
  /** Only one band is the recommendation, and the slider marks it. */
  recommended: boolean;
}

/** Ordered low to high so a lookup can take the first match. */
export const QUALITY_BANDS: QualityBand[] = [
  {
    id: "low",
    min: 0,
    max: 24,
    label: "Nízká kvalita",
    description: "Viditelné čtverečkování. Použij jen když opravdu musíš.",
    recommended: false,
  },
  {
    id: "recommended",
    min: 25,
    max: 44,
    label: "Doporučeno pro web",
    description:
      "Rozdíl je okem téměř nepostřehnutelný. Malý soubor, rychlé načtení.",
    recommended: true,
  },
  {
    id: "balanced",
    min: 45,
    max: 64,
    label: "Vyvážená",
    description: "Dobrý poměr kvality a velikosti. Bezpečná volba.",
    recommended: false,
  },
  {
    id: "high",
    min: 65,
    max: 84,
    label: "Vysoká kvalita",
    description: "Ostrý obraz, střední velikost. Pro důležitá videa.",
    recommended: false,
  },
  {
    id: "maximum",
    min: 85,
    max: 100,
    label: "Maximální kvalita",
    description: "Prakticky bez ztráty. Velký soubor – pro web zbytečné.",
    recommended: false,
  },
];

/** Keeps a percentage inside 0–100 and integral. */
export function clampQualityPercent(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_QUALITY_PERCENT;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/**
 * Percentage to CRF: 100% → 18, 40% → 30, 0% → 38.
 *
 * The user never sees the right-hand side of this function.
 */
export function crfFromQuality(percent: number): number {
  const clamped = clampQualityPercent(percent);
  return Math.round(38 - (clamped / 100) * 20);
}

/** The band a percentage falls into. Never returns undefined. */
export function qualityBand(percent: number): QualityBand {
  const clamped = clampQualityPercent(percent);
  const band = QUALITY_BANDS.find(
    (candidate) => clamped >= candidate.min && clamped <= candidate.max,
  );
  // The bands tile 0–100 with no gaps, so this is belt-and-braces.
  return band ?? QUALITY_BANDS[QUALITY_BANDS.length - 1];
}
