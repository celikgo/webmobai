import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Pixel-by-pixel image diff. Returns the number of differing pixels, the
 * total pixel count, and a diff PNG buffer where mismatches are highlighted
 * in red on top of a faded version of the actual image.
 *
 * Wraps `pixelmatch` (the same library Playwright uses under the hood) so
 * results match what `expect(page).toHaveScreenshot()` would report.
 *
 * `threshold` is pixelmatch's color sensitivity: 0 is exact match, 1 is no
 * sensitivity. Default 0.2 mirrors Playwright's default and ignores
 * imperceptible anti-aliasing differences.
 */
export interface DiffStats {
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  diffImage: Buffer;
  width: number;
  height: number;
  sizeMatched: boolean;
}

export interface CompareOptions {
  threshold?: number;
}

export function compareImages(
  actualPng: Buffer,
  baselinePng: Buffer,
  options: CompareOptions = {},
): DiffStats {
  const actual = PNG.sync.read(actualPng);
  const baseline = PNG.sync.read(baselinePng);

  // Dimension mismatch is an immediate failure — pixelmatch requires same
  // dimensions and would throw. Report as 100% diff and return a synthetic
  // diff image that's just the actual image annotated.
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      diffPixels: actual.width * actual.height,
      totalPixels: actual.width * actual.height,
      diffRatio: 1,
      diffImage: actualPng,
      width: actual.width,
      height: actual.height,
      sizeMatched: false,
    };
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(
    actual.data,
    baseline.data,
    diff.data,
    actual.width,
    actual.height,
    {
      threshold: options.threshold ?? 0.2,
      includeAA: false,
    },
  );

  return {
    diffPixels,
    totalPixels: actual.width * actual.height,
    diffRatio: diffPixels / (actual.width * actual.height),
    diffImage: PNG.sync.write(diff),
    width: actual.width,
    height: actual.height,
    sizeMatched: true,
  };
}

/**
 * Decide whether a diff passes or fails given tolerance options. Either
 * `maxDiffPixels` or `maxDiffPixelRatio` (or both) can be set; the check
 * fails if EITHER limit is exceeded.
 *
 * Default: maxDiffPixelRatio 0.01 (1% of pixels may differ).
 */
export interface ToleranceOptions {
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
}

export function withinTolerance(
  stats: DiffStats,
  tolerance: ToleranceOptions = {},
): boolean {
  if (!stats.sizeMatched) return false;
  const { maxDiffPixels, maxDiffPixelRatio = 0.01 } = tolerance;
  if (maxDiffPixels != null && stats.diffPixels > maxDiffPixels) return false;
  if (stats.diffRatio > maxDiffPixelRatio) return false;
  return true;
}
