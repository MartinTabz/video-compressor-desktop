import { describe, expect, it } from "vitest";

import type { Orientation, VideoMetadata } from "../../types";
import {
  clampDimensions,
  deriveHeight,
  deriveWidth,
  dimensionsForLongerSide,
  longerSide,
  resolutionPresets,
  toEven,
} from "../orientation";

/**
 * Builds a metadata object the way `probe_video` would: `width` / `height` are
 * display dimensions with rotation already applied.
 */
function meta(
  streamWidth: number,
  streamHeight: number,
  rotation = 0,
): VideoMetadata {
  const swapped = rotation % 180 === 90 || rotation % 180 === -90;
  const width = swapped ? streamHeight : streamWidth;
  const height = swapped ? streamWidth : streamHeight;

  const orientation: Orientation =
    height > width ? "portrait" : width > height ? "landscape" : "square";

  return {
    path: "/tmp/clip.mp4",
    fileName: "clip.mp4",
    fileSizeBytes: 12_000_000,
    width,
    height,
    orientation,
    aspectRatio: width / height,
    rotation,
    streamWidth,
    streamHeight,
    fps: 30,
    durationSeconds: 41,
    hasAudio: true,
    audioCodec: "aac",
    videoCodec: "h264",
  };
}

describe("toEven", () => {
  it("rounds down to the nearest even integer", () => {
    expect(toEven(1707)).toBe(1706);
    expect(toEven(541)).toBe(540);
    expect(toEven(540)).toBe(540);
    expect(toEven(540.9)).toBe(540);
  });

  it("never goes below 2", () => {
    expect(toEven(1)).toBe(2);
    expect(toEven(0)).toBe(2);
    expect(toEven(-100)).toBe(2);
    expect(toEven(Number.NaN)).toBe(2);
  });
});

describe("dimensionsForLongerSide", () => {
  it("scales a 9:16 phone clip down, not up", () => {
    const source = meta(1080, 1920);
    expect(source.orientation).toBe("portrait");
    expect(dimensionsForLongerSide(source, 960)).toEqual({
      width: 540,
      height: 960,
    });
  });

  it("handles a rotated clip stored as 1920x1080 with rotation -90", () => {
    // The exact shape phones produce: landscape stream, portrait on screen.
    const source = meta(1920, 1080, -90);
    expect(source.orientation).toBe("portrait");
    expect(source.width).toBe(1080);
    expect(source.height).toBe(1920);
    expect(dimensionsForLongerSide(source, 960)).toEqual({
      width: 540,
      height: 960,
    });
  });

  it("treats rotation 270 the same as -90", () => {
    // The Rust side normalizes -90 to 270; both must swap.
    const source = meta(1920, 1080, 270);
    expect(source.width).toBe(1080);
    expect(source.height).toBe(1920);
    expect(dimensionsForLongerSide(source, 960)).toEqual({
      width: 540,
      height: 960,
    });
  });

  it("leaves a 180-rotated clip in landscape", () => {
    const source = meta(1920, 1080, 180);
    expect(source.orientation).toBe("landscape");
    expect(dimensionsForLongerSide(source, 960)).toEqual({
      width: 960,
      height: 540,
    });
  });

  it("scales landscape against the same longer side", () => {
    const source = meta(1920, 1080);
    expect(source.orientation).toBe("landscape");
    expect(dimensionsForLongerSide(source, 960)).toEqual({
      width: 960,
      height: 540,
    });
  });

  it("keeps square square", () => {
    const source = meta(1080, 1080);
    expect(source.orientation).toBe("square");
    expect(dimensionsForLongerSide(source, 720)).toEqual({
      width: 720,
      height: 720,
    });
  });

  it("returns the source when the target is larger or equal", () => {
    const source = meta(1080, 1920);
    expect(dimensionsForLongerSide(source, 1920)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(dimensionsForLongerSide(source, 3840)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("always produces even numbers", () => {
    // 1439x2559 at target 961 is odd on every axis before rounding.
    const source = meta(1439, 2559);
    const result = dimensionsForLongerSide(source, 961);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
    expect(result.height).toBe(960);
  });

  it("ignores a nonsense target instead of collapsing the frame", () => {
    const source = meta(1080, 1920);
    expect(dimensionsForLongerSide(source, 0)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(dimensionsForLongerSide(source, Number.NaN)).toEqual({
      width: 1080,
      height: 1920,
    });
  });
});

describe("longerSide", () => {
  it("reads the display dimensions, not the stream dimensions", () => {
    expect(longerSide(meta(1920, 1080, -90))).toBe(1920);
    expect(longerSide(meta(1080, 1920))).toBe(1920);
    expect(longerSide(meta(640, 480))).toBe(640);
  });
});

describe("aspect ratio derivation", () => {
  it("round-trips within 1px on a 9:16 clip", () => {
    const source = meta(1080, 1920);
    const height = 960;
    const width = deriveWidth(height, source.aspectRatio);
    expect(width).toBe(540);
    expect(Math.abs(deriveHeight(width, source.aspectRatio) - height)).toBeLessThanOrEqual(1);
  });

  it("round-trips within 1px on a 16:9 clip", () => {
    const source = meta(1920, 1080);
    const width = 1280;
    const height = deriveHeight(width, source.aspectRatio);
    expect(height).toBe(720);
    expect(Math.abs(deriveWidth(height, source.aspectRatio) - width)).toBeLessThanOrEqual(1);
  });

  it("round-trips onto the even grid on an awkward ratio", () => {
    // Both directions floor to even, so a round trip can only ever land on the
    // same 2px cell or the one below it. Floor is deliberate: rounding up would
    // let a derived dimension exceed the source by a pixel.
    const source = meta(1440, 1082);
    const width = 720;
    const height = deriveHeight(width, source.aspectRatio);
    const back = deriveWidth(height, source.aspectRatio);
    expect(back).toBeLessThanOrEqual(width);
    expect(Math.abs(back - width)).toBeLessThanOrEqual(2);
  });
});

describe("resolutionPresets", () => {
  it("offers everything below a 4K portrait source", () => {
    const presets = resolutionPresets(meta(2160, 3840));
    expect(presets.map((preset) => preset.id)).toEqual([
      "original",
      "1080p",
      "720p",
      "540p",
      "480p",
    ]);
    expect(presets[0].label).toBe("Původní");
    expect(presets[1]).toMatchObject({ width: 1080, height: 1920 });
    expect(presets[3]).toMatchObject({ width: 540, height: 960 });
  });

  it("drops presets that would meet or exceed the source", () => {
    // A 1080p portrait source: "1080p" would just duplicate "Původní".
    const presets = resolutionPresets(meta(1080, 1920));
    expect(presets.map((preset) => preset.id)).toEqual([
      "original",
      "720p",
      "540p",
      "480p",
    ]);
  });

  it("never upscales a small source", () => {
    const source = meta(480, 854);
    const presets = resolutionPresets(source);
    expect(presets.map((preset) => preset.id)).toEqual(["original"]);
    for (const preset of presets) {
      expect(preset.width).toBeLessThanOrEqual(source.width);
      expect(preset.height).toBeLessThanOrEqual(source.height);
    }
  });

  it("produces even dimensions for every preset", () => {
    for (const preset of resolutionPresets(meta(1920, 1080, -90))) {
      expect(preset.width % 2).toBe(0);
      expect(preset.height % 2).toBe(0);
    }
  });
});

describe("clampDimensions", () => {
  it("caps at the source resolution", () => {
    const source = meta(1080, 1920);
    expect(clampDimensions({ width: 4000, height: 8000 }, source)).toEqual({
      width: 1080,
      height: 1920,
      wasClamped: true,
    });
  });

  it("leaves a valid pair alone", () => {
    const source = meta(1080, 1920);
    expect(clampDimensions({ width: 540, height: 960 }, source)).toEqual({
      width: 540,
      height: 960,
      wasClamped: false,
    });
  });

  it("rounds odd input down to even without calling it clamped", () => {
    const source = meta(1080, 1920);
    expect(clampDimensions({ width: 541, height: 961 }, source)).toEqual({
      width: 540,
      height: 960,
      wasClamped: false,
    });
  });

  it("floors a zero or negative request at 2", () => {
    const source = meta(1080, 1920);
    expect(clampDimensions({ width: 0, height: -5 }, source)).toEqual({
      width: 2,
      height: 2,
      wasClamped: true,
    });
  });
});
