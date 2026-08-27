import { describe, expect, it } from "vitest";

import type { EncodeConfig } from "../../types";
import { buildArgs, toCommandString } from "../ffmpegArgs";
import { crfFromQuality, qualityBand } from "../quality";

function config(overrides: Partial<EncodeConfig> = {}): EncodeConfig {
  return {
    inputPath: "/Users/me/Movies/clip.mov",
    outputPath: "/Users/me/Movies/clip-web.mp4",
    width: 540,
    height: 960,
    fps: null,
    qualityPercent: 40,
    speed: "slow",
    audio: "speech",
    hasAudio: true,
    ...overrides,
  };
}

describe("buildArgs", () => {
  it("emits two concrete even integers in the scale filter", () => {
    const args = buildArgs(config());
    const scale = args[args.indexOf("-vf") + 1];
    expect(scale).toBe("scale=540:960");
    expect(scale).not.toContain("-2");
  });

  it("omits -r when the user kept the source frame rate", () => {
    expect(buildArgs(config({ fps: null }))).not.toContain("-r");
  });

  it("emits -r when the frame rate was lowered", () => {
    const args = buildArgs(config({ fps: 24 }));
    expect(args[args.indexOf("-r") + 1]).toBe("24");
  });

  it("keeps two decimals of an NTSC rate", () => {
    const args = buildArgs(config({ fps: 29.97 }));
    expect(args[args.indexOf("-r") + 1]).toBe("29.97");
  });

  it("carries every non-negotiable flag", () => {
    const args = buildArgs(config());
    const pairs = [
      ["-c:v", "libx264"],
      ["-profile:v", "main"],
      ["-pix_fmt", "yuv420p"],
      ["-movflags", "+faststart"],
      ["-progress", "pipe:1"],
    ];
    for (const [flag, value] of pairs) {
      expect(args[args.indexOf(flag) + 1]).toBe(value);
    }
    expect(args).toContain("-nostats");
    expect(args).toContain("-y");
  });

  it("puts the output path last and the input behind -i", () => {
    const args = buildArgs(config());
    expect(args[args.length - 1]).toBe("/Users/me/Movies/clip-web.mp4");
    expect(args[args.indexOf("-i") + 1]).toBe("/Users/me/Movies/clip.mov");
  });

  it("maps the default 40% to CRF 30", () => {
    const args = buildArgs(config());
    expect(args[args.indexOf("-crf") + 1]).toBe("30");
  });

  it("uses mono 64k for speech", () => {
    const args = buildArgs(config({ audio: "speech" }));
    expect(args).toEqual(expect.arrayContaining(["-c:a", "aac", "-b:a", "64k", "-ac", "1"]));
  });

  it("uses 128k for music", () => {
    const args = buildArgs(config({ audio: "music" }));
    expect(args[args.indexOf("-b:a") + 1]).toBe("128k");
    expect(args).not.toContain("-ac");
  });

  it("strips audio when the user does not want it", () => {
    expect(buildArgs(config({ audio: "none" }))).toContain("-an");
  });

  it("strips audio when the source is silent, whatever was picked", () => {
    const args = buildArgs(config({ hasAudio: false, audio: "music" }));
    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
  });
});

describe("toCommandString", () => {
  it("quotes only the paths that need it", () => {
    const command = toCommandString(
      buildArgs(config({ inputPath: "/Users/me/My Videos/a b.mov" })),
    );
    expect(command).toContain("'/Users/me/My Videos/a b.mov'");
    expect(command).toContain("scale=540:960");
    expect(command.startsWith("ffmpeg ")).toBe(true);
  });
});

describe("quality mapping", () => {
  it("matches the specified anchor points", () => {
    expect(crfFromQuality(100)).toBe(18);
    expect(crfFromQuality(75)).toBe(23);
    expect(crfFromQuality(50)).toBe(28);
    expect(crfFromQuality(40)).toBe(30);
    expect(crfFromQuality(30)).toBe(32);
    expect(crfFromQuality(0)).toBe(38);
  });

  it("clamps out-of-range input", () => {
    expect(crfFromQuality(-10)).toBe(38);
    expect(crfFromQuality(400)).toBe(18);
  });

  it("puts the default in the recommended band", () => {
    const band = qualityBand(40);
    expect(band.id).toBe("recommended");
    expect(band.recommended).toBe(true);
    expect(band.label).toBe("Doporučeno pro web");
  });

  it("covers every percentage with exactly one band", () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      expect(qualityBand(percent)).toBeDefined();
    }
    expect(qualityBand(24).id).toBe("low");
    expect(qualityBand(25).id).toBe("recommended");
    expect(qualityBand(44).id).toBe("recommended");
    expect(qualityBand(45).id).toBe("balanced");
    expect(qualityBand(85).id).toBe("maximum");
  });
});
