import type {
  AudioMode,
  EncodeConfig,
  PosterFormat,
  StepId,
  VideoMetadata,
  WizardState,
} from "../types";
import { clampFrameRate, frameRateCeiling } from "./framerate";
import { defaultOutputName, directoryOf, joinPath } from "./format";
import { clampDimensions, deriveHeight, deriveWidth, toEven } from "./orientation";
import { DEFAULT_QUALITY_PERCENT, clampQualityPercent } from "./quality";
import { DEFAULT_SPEED } from "./speed";

/**
 * The wizard's one reducer, plus the rules that decide what the user may do
 * next. Components read state and dispatch; none of them derive navigation on
 * their own.
 */

export interface StepDefinition {
  id: StepId;
  /** Short word for the stepper. */
  label: string;
  /** Full title above the panel. */
  title: string;
}

/** Every configuration step, in order. The progress screen is not one of them. */
export const STEPS: StepDefinition[] = [
  { id: "source", label: "Video", title: "Výběr videa" },
  { id: "resolution", label: "Rozlišení", title: "Rozlišení" },
  { id: "framerate", label: "FPS", title: "Snímky za vteřinu" },
  { id: "quality", label: "Kvalita", title: "Kvalita" },
  { id: "speed", label: "Rychlost", title: "Rychlost zpracování" },
  { id: "audio", label: "Zvuk", title: "Zvuk" },
  { id: "output", label: "Uložení", title: "Uložení" },
  { id: "summary", label: "Souhrn", title: "Souhrn" },
];

/** Default poster position: one second in, before anyone has started talking. */
const DEFAULT_POSTER_SECONDS = 1;

export const initialState: WizardState = {
  step: "source",
  furthestStep: "source",
  metadata: null,
  width: 0,
  height: 0,
  lockAspect: true,
  fps: 30,
  qualityPercent: DEFAULT_QUALITY_PERCENT,
  speed: DEFAULT_SPEED,
  // Most sources are a talking head, so speech is the answer that is already
  // right when the user arrives on the step.
  audioWanted: true,
  audioMusic: false,
  outputPath: "",
  poster: {
    enabled: false,
    timeSeconds: DEFAULT_POSTER_SECONDS,
    format: "webp",
  },
};

export type WizardAction =
  | { type: "metadataLoaded"; metadata: VideoMetadata }
  | { type: "clearVideo" }
  | { type: "setWidth"; width: number }
  | { type: "setHeight"; height: number }
  | { type: "normalizeDimensions" }
  | { type: "setDimensions"; width: number; height: number }
  | { type: "toggleAspectLock" }
  | { type: "setFps"; fps: number }
  | { type: "setQuality"; percent: number }
  | { type: "setSpeed"; speed: WizardState["speed"] }
  | { type: "setAudioMode"; mode: AudioMode }
  | { type: "setOutputPath"; path: string }
  | { type: "setPosterEnabled"; enabled: boolean }
  | { type: "setPosterTime"; seconds: number }
  | { type: "setPosterFormat"; format: PosterFormat }
  | { type: "goToStep"; step: StepId }
  | { type: "next" }
  | { type: "back" }
  | { type: "reset" };

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "metadataLoaded": {
      const { metadata } = action;
      // A new file resets every choice: the old numbers were computed against
      // a different source and would silently upscale or overshoot.
      return {
        ...initialState,
        metadata,
        width: toEven(metadata.width),
        height: toEven(metadata.height),
        fps: frameRateCeiling(metadata),
        outputPath: joinPath(
          directoryOf(metadata.path),
          defaultOutputName(metadata.fileName),
        ),
        poster: {
          ...initialState.poster,
          timeSeconds: Math.min(
            DEFAULT_POSTER_SECONDS,
            Math.max(0, metadata.durationSeconds - 0.1),
          ),
        },
      };
    }

    case "clearVideo":
    case "reset":
      return initialState;

    case "setWidth": {
      if (!state.metadata) return state;
      const width = Math.max(0, Math.round(action.width));
      return {
        ...state,
        width,
        height: state.lockAspect
          ? deriveHeight(width, state.metadata.aspectRatio)
          : state.height,
      };
    }

    case "setHeight": {
      if (!state.metadata) return state;
      const height = Math.max(0, Math.round(action.height));
      return {
        ...state,
        height,
        width: state.lockAspect
          ? deriveWidth(height, state.metadata.aspectRatio)
          : state.width,
      };
    }

    case "normalizeDimensions": {
      if (!state.metadata) return state;
      // Runs on blur: what the user typed becomes something the encoder can
      // actually accept — even, at least 2px, never above the source.
      const clamped = clampDimensions(
        { width: state.width, height: state.height },
        state.metadata,
      );
      return { ...state, width: clamped.width, height: clamped.height };
    }

    case "setDimensions": {
      if (!state.metadata) return state;
      const clamped = clampDimensions(action, state.metadata);
      return { ...state, width: clamped.width, height: clamped.height };
    }

    case "toggleAspectLock":
      return { ...state, lockAspect: !state.lockAspect };

    case "setFps":
      if (!state.metadata) return state;
      return { ...state, fps: clampFrameRate(action.fps, state.metadata) };

    case "setQuality":
      return { ...state, qualityPercent: clampQualityPercent(action.percent) };

    case "setSpeed":
      return { ...state, speed: action.speed };

    case "setAudioMode":
      // The step asks one question with three answers; the two stored flags are
      // just how that answer is spelled for `audioModeOf`.
      return {
        ...state,
        audioWanted: action.mode !== "none",
        audioMusic: action.mode === "none" ? null : action.mode === "music",
      };

    case "setOutputPath":
      return { ...state, outputPath: action.path };

    case "setPosterEnabled":
      return { ...state, poster: { ...state.poster, enabled: action.enabled } };

    case "setPosterTime": {
      const duration = state.metadata?.durationSeconds ?? 0;
      const seconds = Number.isFinite(action.seconds) ? action.seconds : 0;
      return {
        ...state,
        poster: {
          ...state.poster,
          // Never past the last frame, never before the first.
          timeSeconds: Math.min(Math.max(0, seconds), Math.max(0, duration - 0.05)),
        },
      };
    }

    case "setPosterFormat":
      return { ...state, poster: { ...state.poster, format: action.format } };

    case "goToStep":
      return withStep(state, action.step);

    case "next": {
      const target = adjacentStep(state, state.step, 1);
      return target ? withStep(state, target) : state;
    }

    case "back": {
      const target = adjacentStep(state, state.step, -1);
      return target ? withStep(state, target) : state;
    }
  }
}

/** Moves to a step and remembers the high-water mark for the stepper. */
function withStep(state: WizardState, step: StepId): WizardState {
  const furthest =
    stepIndex(step) > stepIndex(state.furthestStep) ? step : state.furthestStep;
  return { ...state, step, furthestStep: furthest };
}

/** Position in `STEPS`; the progress screen sorts after everything. */
export function stepIndex(step: StepId): number {
  if (step === "progress") return STEPS.length;
  return STEPS.findIndex((definition) => definition.id === step);
}

/**
 * A silent source has nothing to decide about, so the audio step is shown as
 * skipped and stepped over in both directions.
 */
export function isStepSkipped(state: WizardState, step: StepId): boolean {
  return step === "audio" && state.metadata !== null && !state.metadata.hasAudio;
}

/** The next or previous step the user can actually land on. */
function adjacentStep(
  state: WizardState,
  from: StepId,
  direction: 1 | -1,
): StepId | null {
  let index = stepIndex(from) + direction;

  while (index >= 0 && index < STEPS.length) {
    const candidate = STEPS[index].id;
    if (!isStepSkipped(state, candidate)) return candidate;
    index += direction;
  }

  // Past the last step is the encode itself; before the first is nowhere.
  if (direction === 1 && index >= STEPS.length) return "progress";
  return null;
}

/** Whether „Pokračovat" is allowed to be enabled on this step. */
export function isStepValid(state: WizardState, step: StepId): boolean {
  const meta = state.metadata;
  if (!meta) return false;

  switch (step) {
    case "source":
      return true;

    case "resolution":
      return (
        state.width >= 2 &&
        state.height >= 2 &&
        state.width % 2 === 0 &&
        state.height % 2 === 0 &&
        state.width <= toEven(meta.width) &&
        state.height <= toEven(meta.height)
      );

    case "framerate":
      return state.fps >= 12 && state.fps <= frameRateCeiling(meta);

    case "quality":
    case "speed":
      return true;

    case "audio":
      return audioModeOf(state) !== null;

    case "output":
      return state.outputPath.trim().length > 0;

    case "summary":
    case "progress":
      return true;
  }
}

/** Everything up to and including `step` answered. Gates the stepper links. */
export function canJumpTo(state: WizardState, step: StepId): boolean {
  if (!state.metadata) return false;
  if (isStepSkipped(state, step)) return false;
  return stepIndex(step) <= stepIndex(state.furthestStep);
}

/**
 * The two audio questions collapsed into one mode, or `null` while the user
 * still owes an answer. A silent source is always „none".
 */
export function audioModeOf(state: WizardState): AudioMode | null {
  if (state.metadata && !state.metadata.hasAudio) return "none";
  if (state.audioWanted === null) return null;
  if (!state.audioWanted) return "none";
  if (state.audioMusic === null) return null;
  return state.audioMusic ? "music" : "speech";
}

/**
 * Wizard state as the encoder sees it.
 *
 * The frame rate is nulled when it still sits at the source ceiling, so an
 * untouched slider never adds `-r` to the command.
 */
export function configFromState(state: WizardState): EncodeConfig | null {
  const meta = state.metadata;
  if (!meta) return null;

  const ceiling = frameRateCeiling(meta);

  return {
    inputPath: meta.path,
    outputPath: state.outputPath,
    width: state.width,
    height: state.height,
    fps: state.fps >= ceiling ? null : state.fps,
    qualityPercent: state.qualityPercent,
    speed: state.speed,
    audio: audioModeOf(state) ?? "none",
    hasAudio: meta.hasAudio,
  };
}
