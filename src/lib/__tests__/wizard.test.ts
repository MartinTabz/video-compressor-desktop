import { describe, expect, it } from "vitest";

import type { VideoMetadata, WizardState } from "../../types";
import { buildArgs } from "../ffmpegArgs";
import { resolutionPresets } from "../orientation";
import {
  audioModeOf,
  configFromState,
  initialState,
  isStepSkipped,
  isStepValid,
  wizardReducer,
} from "../wizard";

/** A rotated phone clip: the case the whole app is built around. */
function verticalMeta(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    path: "/Users/me/Movies/testimonial.mov",
    fileName: "testimonial.mov",
    fileSizeBytes: 48_200_000,
    width: 1080,
    height: 1920,
    orientation: "portrait",
    aspectRatio: 1080 / 1920,
    rotation: 270,
    streamWidth: 1920,
    streamHeight: 1080,
    fps: 59.9,
    durationSeconds: 41,
    hasAudio: true,
    audioCodec: "aac",
    videoCodec: "h264",
    ...overrides,
  };
}

function loaded(meta = verticalMeta()): WizardState {
  return wizardReducer(initialState, { type: "metadataLoaded", metadata: meta });
}

describe("loading a video", () => {
  it("starts at the source dimensions, source frame rate and a default name", () => {
    const state = loaded();

    expect([state.width, state.height]).toEqual([1080, 1920]);
    expect(state.fps).toBe(59.9);
    expect(state.outputPath).toBe("/Users/me/Movies/testimonial-web.mp4");
  });

  it("forgets every choice made about the previous file", () => {
    const first = wizardReducer(loaded(), { type: "setQuality", percent: 90 });
    const second = wizardReducer(first, {
      type: "metadataLoaded",
      metadata: verticalMeta({ path: "/tmp/other.mp4", fileName: "other.mp4" }),
    });

    expect(second.qualityPercent).toBe(initialState.qualityPercent);
  });
});

describe("resolution", () => {
  it("produces scale=540:960 for the 540p preset on a 1080×1920 source", () => {
    const preset = resolutionPresets(verticalMeta()).find((p) => p.id === "540p");
    expect(preset).toBeDefined();

    const state = wizardReducer(loaded(), {
      type: "setDimensions",
      width: preset!.width,
      height: preset!.height,
    });

    const args = buildArgs(configFromState(state)!);
    expect(args[args.indexOf("-vf") + 1]).toBe("scale=540:960");
  });

  it("derives the other side while the aspect lock is on", () => {
    const state = wizardReducer(loaded(), { type: "setWidth", width: 540 });
    expect(state.height).toBe(960);
  });

  it("leaves the other side alone once the lock is off", () => {
    const unlocked = wizardReducer(loaded(), { type: "toggleAspectLock" });
    const state = wizardReducer(unlocked, { type: "setWidth", width: 540 });
    expect(state.height).toBe(1920);
  });

  it("refuses to upscale, whatever is typed", () => {
    const typed = wizardReducer(loaded(), { type: "setWidth", width: 4000 });
    const state = wizardReducer(typed, { type: "normalizeDimensions" });

    expect(state.width).toBeLessThanOrEqual(1080);
    expect(state.height).toBeLessThanOrEqual(1920);
    expect(isStepValid(state, "resolution")).toBe(true);
  });

  it("snaps odd numbers down to even ones", () => {
    const unlocked = wizardReducer(loaded(), { type: "toggleAspectLock" });
    const typed = wizardReducer(unlocked, { type: "setWidth", width: 541 });
    expect(wizardReducer(typed, { type: "normalizeDimensions" }).width).toBe(540);
  });
});

describe("frame rate", () => {
  it("omits -r while the slider sits at the source rate", () => {
    expect(configFromState(loaded())!.fps).toBeNull();
  });

  it("passes a lowered rate through to the config", () => {
    const state = wizardReducer(loaded(), { type: "setFps", fps: 24 });
    expect(configFromState(state)!.fps).toBe(24);
  });

  it("caps the slider at the source rate", () => {
    const state = wizardReducer(loaded(), { type: "setFps", fps: 120 });
    expect(state.fps).toBe(59.9);
  });
});

describe("audio", () => {
  it("starts on speech, so the step is valid on arrival", () => {
    const state = loaded();
    expect(audioModeOf(state)).toBe("speech");
    expect(isStepValid(state, "audio")).toBe(true);
  });

  it("round-trips every mode", () => {
    for (const mode of ["none", "speech", "music"] as const) {
      const state = wizardReducer(loaded(), { type: "setAudioMode", mode });
      expect(audioModeOf(state)).toBe(mode);
      expect(isStepValid(state, "audio")).toBe(true);
    }
  });

  it("retracts the music answer when the user picks „Bez zvuku“", () => {
    const music = wizardReducer(loaded(), { type: "setAudioMode", mode: "music" });
    const none = wizardReducer(music, { type: "setAudioMode", mode: "none" });

    expect(none.audioMusic).toBeNull();
    expect(audioModeOf(none)).toBe("none");
  });

  it("skips the step entirely on a silent source", () => {
    const state = loaded(verticalMeta({ hasAudio: false, audioCodec: null }));

    expect(isStepSkipped(state, "audio")).toBe(true);
    expect(audioModeOf(state)).toBe("none");
    expect(buildArgs(configFromState(state)!)).toContain("-an");
  });

  it("steps over the audio question in both directions", () => {
    const silent = loaded(verticalMeta({ hasAudio: false }));
    const atSpeed = wizardReducer(silent, { type: "goToStep", step: "speed" });

    expect(wizardReducer(atSpeed, { type: "next" }).step).toBe("output");

    const atOutput = wizardReducer(silent, { type: "goToStep", step: "output" });
    expect(wizardReducer(atOutput, { type: "back" }).step).toBe("speed");
  });
});

describe("poster", () => {
  it("never points past the end of a very short clip", () => {
    const short = loaded(verticalMeta({ durationSeconds: 2 }));
    const state = wizardReducer(short, { type: "setPosterTime", seconds: 30 });

    expect(state.poster.timeSeconds).toBeLessThan(2);
  });

  it("keeps the chosen format when the poster is turned off and on again", () => {
    const on = wizardReducer(loaded(), { type: "setPosterEnabled", enabled: true });
    const png = wizardReducer(on, { type: "setPosterFormat", format: "png" });
    const off = wizardReducer(png, { type: "setPosterEnabled", enabled: false });

    expect(off.poster.format).toBe("png");
  });
});

describe("navigation", () => {
  it("ends up at the progress screen after the summary", () => {
    const summary = wizardReducer(loaded(), { type: "goToStep", step: "summary" });
    expect(wizardReducer(summary, { type: "next" }).step).toBe("progress");
  });

  it("remembers the furthest step so the stepper stays clickable", () => {
    const forward = wizardReducer(loaded(), { type: "goToStep", step: "quality" });
    const back = wizardReducer(forward, { type: "goToStep", step: "resolution" });

    expect(back.furthestStep).toBe("quality");
  });

  it("marks a step reached with „upravit“ as an edit round trip", () => {
    const summary = wizardReducer(loaded(), { type: "goToStep", step: "summary" });
    const editing = wizardReducer(summary, {
      type: "editFromSummary",
      step: "resolution",
    });

    expect(editing.step).toBe("resolution");
    expect(editing.editingFromSummary).toBe(true);
    expect(editing.furthestStep).toBe("summary");
  });

  it("closes the round trip on the way back to the summary", () => {
    const editing = wizardReducer(loaded(), {
      type: "editFromSummary",
      step: "resolution",
    });

    expect(
      wizardReducer(editing, { type: "goToStep", step: "summary" }).editingFromSummary,
    ).toBe(false);
  });

  it("leaves edit mode as soon as the user navigates anywhere else", () => {
    const editing = wizardReducer(loaded(), {
      type: "editFromSummary",
      step: "resolution",
    });

    expect(wizardReducer(editing, { type: "next" }).editingFromSummary).toBe(false);
    expect(wizardReducer(editing, { type: "back" }).editingFromSummary).toBe(false);
  });
});
