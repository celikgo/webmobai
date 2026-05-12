import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { compareImages, withinTolerance } from "../src/visual/comparator.js";

/**
 * Build a synthetic PNG at a given size where every pixel is the same RGBA
 * color. Pure-unit fixture — no browser required, no flakiness.
 */
function solidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = rgba[0];
      png.data[idx + 1] = rgba[1];
      png.data[idx + 2] = rgba[2];
      png.data[idx + 3] = rgba[3];
    }
  }
  return PNG.sync.write(png);
}

/**
 * Build a PNG with `n` pixels colored differently from the rest (used to
 * test partial diffs with known sizes).
 */
function pngWithRedPixels(
  width: number,
  height: number,
  reds: number,
): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (i < reds) {
      png.data[idx] = 255;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 255;
    } else {
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe("compareImages", () => {
  it("returns 0 diff pixels for identical images", () => {
    const a = solidPng(50, 50, [255, 255, 255, 255]);
    const stats = compareImages(a, a);
    expect(stats.diffPixels).toBe(0);
    expect(stats.totalPixels).toBe(2500);
    expect(stats.diffRatio).toBe(0);
    expect(stats.sizeMatched).toBe(true);
  });

  it("counts every pixel as different for solid black vs solid white", () => {
    const black = solidPng(20, 20, [0, 0, 0, 255]);
    const white = solidPng(20, 20, [255, 255, 255, 255]);
    const stats = compareImages(black, white);
    expect(stats.diffPixels).toBe(400);
    expect(stats.diffRatio).toBe(1);
  });

  it("counts exactly the right partial diff", () => {
    const a = pngWithRedPixels(20, 20, 0); // all white
    const b = pngWithRedPixels(20, 20, 10); // 10 red pixels
    const stats = compareImages(a, b);
    expect(stats.diffPixels).toBe(10);
    expect(stats.totalPixels).toBe(400);
  });

  it("flags dimension mismatch without throwing", () => {
    const a = solidPng(10, 10, [255, 255, 255, 255]);
    const b = solidPng(20, 20, [255, 255, 255, 255]);
    const stats = compareImages(a, b);
    expect(stats.sizeMatched).toBe(false);
    expect(stats.diffRatio).toBe(1);
  });

  it("returns a diff PNG buffer that's a valid PNG", () => {
    const a = solidPng(10, 10, [255, 255, 255, 255]);
    const b = solidPng(10, 10, [0, 0, 0, 255]);
    const stats = compareImages(a, b);
    const decoded = PNG.sync.read(stats.diffImage);
    expect(decoded.width).toBe(10);
    expect(decoded.height).toBe(10);
  });
});

describe("withinTolerance", () => {
  it("passes when diff is below the default ratio (1%)", () => {
    const stats = {
      diffPixels: 5,
      totalPixels: 10000,
      diffRatio: 0.0005,
      diffImage: Buffer.alloc(0),
      width: 100,
      height: 100,
      sizeMatched: true,
    };
    expect(withinTolerance(stats)).toBe(true);
  });

  it("fails when diff ratio exceeds threshold", () => {
    const stats = {
      diffPixels: 200,
      totalPixels: 10000,
      diffRatio: 0.02,
      diffImage: Buffer.alloc(0),
      width: 100,
      height: 100,
      sizeMatched: true,
    };
    expect(withinTolerance(stats, { maxDiffPixelRatio: 0.01 })).toBe(false);
  });

  it("fails when absolute diff exceeds maxDiffPixels", () => {
    const stats = {
      diffPixels: 150,
      totalPixels: 100000,
      diffRatio: 0.0015,
      diffImage: Buffer.alloc(0),
      width: 1000,
      height: 100,
      sizeMatched: true,
    };
    expect(
      withinTolerance(stats, { maxDiffPixels: 100, maxDiffPixelRatio: 0.05 }),
    ).toBe(false);
  });

  it("always fails on dimension mismatch", () => {
    const stats = {
      diffPixels: 0,
      totalPixels: 0,
      diffRatio: 0,
      diffImage: Buffer.alloc(0),
      width: 0,
      height: 0,
      sizeMatched: false,
    };
    expect(withinTolerance(stats)).toBe(false);
  });
});
