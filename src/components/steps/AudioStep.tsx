import type { AudioMode, WizardState } from "../../types";
import type { WizardAction } from "../../lib/wizard";
import { audioModeOf } from "../../lib/wizard";

/**
 * One question with three answers, because the encoder only has three outcomes:
 * keep speech in mono, keep music in stereo, or strip the track. The earlier
 * „Ano / Ne" pair asked the user to arrive at the same answer in two hops.
 *
 * The two answers that keep the audio sit together up top — speech first, since
 * a talking head is what this app mostly compresses and what the step defaults
 * to. Dropping the track is a different kind of decision, so it lives below a
 * rule rather than competing as a third equal option.
 *
 * Each card carries a waveform drawn in the shape of what it describes — bursts
 * and pauses for speech, a dense block for music, a flat line for silence — so
 * the choice is legible before the labels are read.
 */
interface AudioStepProps {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}

interface AudioOption {
  mode: AudioMode;
  label: string;
  description: string;
  /** Bar heights, 0–1, sampled left to right. */
  wave: number[];
}

/** Bursts with the pauses a sentence leaves between them. */
const SPEECH_WAVE = [
  0.1, 0.28, 0.62, 0.4, 0.86, 0.55, 0.3, 0.12, 0.08, 0.08, 0.08, 0.2, 0.52,
  0.78, 0.94, 0.6, 0.36, 0.7, 0.44, 0.18, 0.08, 0.08, 0.24, 0.58, 0.88, 0.5,
  0.72, 0.34, 0.14, 0.08, 0.08, 0.3, 0.66, 0.42, 0.16,
];

/** Continuous and loud, the way a mixed track sits against the meter. */
const MUSIC_WAVE = [
  0.5, 0.74, 0.6, 0.92, 0.68, 0.84, 0.56, 0.88, 0.64, 1, 0.72, 0.86, 0.6, 0.94,
  0.66, 0.8, 0.54, 0.9, 0.62, 0.78, 0.5, 0.86, 0.66, 0.96, 0.7, 0.82, 0.58,
  0.9, 0.64, 0.76, 0.52, 0.88, 0.68, 0.8, 0.56,
];

const SILENT_WAVE = Array.from({ length: 35 }, () => 0.06);

const KEEP_OPTIONS: AudioOption[] = [
  {
    mode: "speech",
    label: "Mluvené slovo",
    description: "Rozhovor nebo komentář. Uložíme v mono – zní stejně a zabere méně místa.",
    wave: SPEECH_WAVE,
  },
  {
    mode: "music",
    label: "Hudba a ruchy",
    description: "Písnička na pozadí nebo zvuky prostředí. Zůstane stereo ve vyšší kvalitě.",
    wave: MUSIC_WAVE,
  },
];

const DROP_OPTION: AudioOption = {
  mode: "none",
  label: "Bez zvuku",
  description: "Zvuk se odstraní. Nejmenší soubor – pro video na pozadí.",
  wave: SILENT_WAVE,
};

export function AudioStep({ state, dispatch }: AudioStepProps) {
  const selected = audioModeOf(state);
  const select = (mode: AudioMode) => dispatch({ type: "setAudioMode", mode });

  return (
    <div role="radiogroup" aria-label="Co je ve zvukové stopě" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        {KEEP_OPTIONS.map((option) => (
          <OptionCard
            key={option.mode}
            option={option}
            selected={selected === option.mode}
            onSelect={() => select(option.mode)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="label">nebo</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <OptionCard
        option={DROP_OPTION}
        selected={selected === DROP_OPTION.mode}
        onSelect={() => select(DROP_OPTION.mode)}
        horizontal
      />
    </div>
  );
}

interface OptionCardProps {
  option: AudioOption;
  selected: boolean;
  onSelect: () => void;
  /** Waveform beside the text instead of above it, for the full-width card. */
  horizontal?: boolean;
}

function OptionCard({ option, selected, onSelect, horizontal }: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "focus-ring group rounded-card border p-4 text-left transition-colors duration-hover",
        horizontal
          ? "flex w-full items-center gap-5"
          : "flex flex-col gap-4",
        selected
          ? "border-accent bg-accent-soft"
          : "border-border bg-surface hover:bg-surface-2",
      ].join(" ")}
    >
      <Waveform
        bars={option.wave}
        active={selected}
        className={horizontal ? "w-24 shrink-0" : "w-full"}
      />
      <span className={horizontal ? "flex flex-col gap-1" : "flex flex-col gap-2"}>
        <span
          className={[
            "font-display text-subtitle font-medium",
            selected ? "text-accent" : "text-text",
          ].join(" ")}
        >
          {option.label}
        </span>
        <span className="text-text-muted">{option.description}</span>
      </span>
    </button>
  );
}

/**
 * The signature glyph. Bars are drawn from the centre line out, so silence
 * collapses to a hairline rather than sitting on the floor of the box.
 */
function Waveform({
  bars,
  active,
  className,
}: {
  bars: number[];
  active: boolean;
  className: string;
}) {
  const gap = 2;
  const width = 1;
  const height = 40;

  return (
    <svg
      viewBox={`0 0 ${bars.length * (width + gap) - gap} ${height}`}
      className={[
        "h-10 transition-colors duration-hover",
        active ? "text-accent" : "text-border group-hover:text-text-muted",
        className,
      ].join(" ")}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((value, index) => {
        const barHeight = Math.max(2, value * height);
        return (
          <rect
            key={index}
            x={index * (width + gap)}
            y={(height - barHeight) / 2}
            width={width}
            height={barHeight}
            rx={0.5}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
