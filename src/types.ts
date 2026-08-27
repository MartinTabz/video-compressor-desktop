/** How the video reads on screen — derived from display dimensions. */
export type Orientation = "portrait" | "landscape" | "square";

/**
 * Everything the app knows about an input file.
 *
 * `width` / `height` are **display** dimensions: rotation has already been
 * applied on the Rust side. They are the only pair allowed to reach the scale
 * filter. `streamWidth` / `streamHeight` exist for the debug view and nothing
 * else.
 */
export interface VideoMetadata {
  path: string;
  fileName: string;
  fileSizeBytes: number;
  // display dimensions — rotation already applied
  width: number;
  height: number;
  orientation: Orientation;
  aspectRatio: number; // width / height
  rotation: number; // normalized to 0 / 90 / 180 / 270, debugging only
  streamWidth: number; // pre-rotation, debugging only
  streamHeight: number;
  fps: number;
  durationSeconds: number;
  hasAudio: boolean;
  audioCodec: string | null;
  videoCodec: string | null;
}

/** A resolution offered in the wizard, already resolved to concrete pixels. */
export interface ResolutionPreset {
  id: ResolutionPresetId;
  /** Czech label shown to the user. */
  label: string;
  /**
   * Target for the **longer** side. Presets are expressed this way so a 9:16
   * clip and a 16:9 clip of the same class produce the same numbers.
   */
  targetLongerSide: number;
  width: number;
  height: number;
}

export type ResolutionPresetId =
  | "original"
  | "1080p"
  | "720p"
  | "540p"
  | "480p";

/** What the user wants done with the sound. */
export type AudioMode = "none" | "speech" | "music";

/** How long the encoder is allowed to look for savings. */
export type SpeedPreset = "veryfast" | "medium" | "slow" | "veryslow";

/** The complete description of one encode. `buildArgs` turns it into flags. */
export interface EncodeConfig {
  inputPath: string;
  outputPath: string;
  /** Both must already be even and within the source bounds. */
  width: number;
  height: number;
  /**
   * Target frame rate, or `null` to leave the source rate alone. The wizard
   * nulls it whenever the slider sits at the source ceiling, so an untouched
   * setting never emits `-r`.
   */
  fps: number | null;
  /** 0–100, never a CRF number. */
  qualityPercent: number;
  speed: SpeedPreset;
  audio: AudioMode;
  /** When the source is silent the audio step is skipped entirely. */
  hasAudio: boolean;
}

/** The optional still image saved alongside the video. */
export interface PosterConfig {
  enabled: boolean;
  /** Where in the video the frame is taken from. */
  timeSeconds: number;
  /** A second copy in WebP, roughly half the size. */
  alsoWebp: boolean;
}

/** The steps of the wizard, in order. */
export type StepId =
  | "source"
  | "resolution"
  | "framerate"
  | "quality"
  | "speed"
  | "audio"
  | "output"
  | "summary"
  | "progress";

/**
 * Everything the wizard holds. Distinct from `EncodeConfig` because the UI
 * needs a few things the encoder does not: which question is on screen, the
 * aspect lock, and the two halves of the audio question before they collapse
 * into an `AudioMode`.
 */
export interface WizardState {
  step: StepId;
  /** How far the user has got — earlier steps stay clickable in the stepper. */
  furthestStep: StepId;
  metadata: VideoMetadata | null;
  width: number;
  height: number;
  lockAspect: boolean;
  /** Always concrete; `configFromState` decides whether it reaches ffmpeg. */
  fps: number;
  qualityPercent: number;
  speed: SpeedPreset;
  /** „Potřebuje video zvuk?" — null until answered. */
  audioWanted: boolean | null;
  /** „Je ve videu hudba?" — null until answered. */
  audioMusic: boolean | null;
  outputPath: string;
  poster: PosterConfig;
}
