import { useId } from "react";

import { formatDimensions } from "../../lib/format";

/**
 * The signature element: a rectangle at the real output aspect ratio.
 *
 * Because the app is built for vertical video, a tall rectangle is the motif.
 * It follows the user from the resolution step onward and does three jobs:
 *
 * - `plain`    — morphs as the dimensions change, labelled in mono
 * - `quality`  — its interior gets noisier as quality drops
 * - `progress` — amber fills it bottom to top, like a container filling
 */

type Mode = "plain" | "quality" | "progress";

interface ShapeProxyProps {
  width: number;
  height: number;
  mode?: Mode;
  /** 0–100. Only read in `quality` mode. */
  quality?: number;
  /** 0–100. Only read in `progress` mode. */
  progress?: number;
  /** The box the rectangle is fitted into. */
  maxHeight?: number;
  maxWidth?: number;
  /** Pixel dimensions along the edges. Off during progress, where the number
   *  in the middle is the thing being read. */
  showLabels?: boolean;
}

export function ShapeProxy({
  width,
  height,
  mode = "plain",
  quality = 100,
  progress = 0,
  maxHeight = 260,
  maxWidth = 200,
  showLabels = true,
}: ShapeProxyProps) {
  const filterId = useId();

  const safeWidth = width > 0 ? width : 16;
  const safeHeight = height > 0 ? height : 9;

  // Fit inside the box without ever exceeding it — a 9:16 clip is bound by
  // height, a 16:9 clip by width, and the same code covers both.
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight);
  const renderedWidth = Math.round(safeWidth * scale);
  const renderedHeight = Math.round(safeHeight * scale);

  const noise = mode === "quality" ? noiseFor(quality) : null;
  const fill = mode === "progress" ? clampPercent(progress) : 0;

  return (
    <div
      className="flex flex-col items-center gap-3"
      style={{ minHeight: maxHeight }}
      role="img"
      aria-label={`Tvar výstupu ${formatDimensions(width, height)}`}
    >
      <div className="flex flex-1 items-center gap-3">
        <div
          className="relative overflow-hidden rounded-input border border-accent bg-surface-2 transition-all duration-shape ease-out"
          style={{ width: renderedWidth, height: renderedHeight }}
        >
          {/* A faint amber wash so the shape reads as "the output", not a hole. */}
          <div className="absolute inset-0 bg-accent-soft" aria-hidden="true" />

          {noise !== null && (
            <svg
              className="absolute inset-0 h-full w-full transition-opacity duration-shape ease-out"
              style={{ opacity: noise.opacity }}
              aria-hidden="true"
            >
              <filter id={filterId}>
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency={noise.frequency}
                  numOctaves={2}
                />
              </filter>
              <rect width="100%" height="100%" filter={`url(#${filterId})`} />
            </svg>
          )}

          {mode === "progress" && (
            <>
              {/* The unfilled reading of the number… */}
              <span className="absolute inset-0 flex items-center justify-center font-mono text-title font-semibold text-text">
                {Math.round(fill)} %
              </span>

              <div
                className="absolute inset-x-0 bottom-0 overflow-hidden bg-accent transition-all duration-shape ease-out"
                style={{ height: `${fill}%` }}
                aria-hidden="true"
              >
                {/* …and the same number in the dark ink, clipped to the fill,
                    so it stays readable as the amber rises past it. */}
                <div
                  className="absolute inset-x-0 bottom-0 flex items-center justify-center font-mono text-title font-semibold text-bg"
                  style={{ height: renderedHeight }}
                >
                  {Math.round(fill)} %
                </div>
              </div>
            </>
          )}
        </div>

        {showLabels && (
          <span
            className="font-mono text-label text-text-muted"
            style={{ writingMode: "vertical-rl" }}
          >
            {height}
          </span>
        )}
      </div>

      {showLabels && (
        <span className="font-mono text-label text-text-muted">{width}</span>
      )}
    </div>
  );
}

/**
 * Quality as visible grain: transparent at 100 %, coarse and obvious at 0 %.
 *
 * The frequency drops as well as the opacity rising, so low quality reads as
 * blocks rather than as film grain — which is what x264 actually does.
 */
function noiseFor(quality: number): { opacity: number; frequency: number } {
  const q = clampPercent(quality) / 100;
  return {
    opacity: 0.42 * Math.pow(1 - q, 1.6),
    frequency: 0.12 + q * 0.68,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
