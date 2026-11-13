import { describe, expect, it } from "vitest";
import { applyColor, blitWrapX, createImage, fillRect, hexToRgb, recolorRgba, tintRgba } from "../src/shared/raster.js";

const px = (img: { width: number; data: ArrayLike<number> }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

describe("blitWrapX", () => {
  it("tiles a strip every period px from any offset, so shifting by one period is identical", () => {
    const src = createImage(4, 1);
    for (let x = 0; x < 4; x++) fillRect(src, x, 0, 1, 1, [x * 60, 0, 0, 255]);
    const a = createImage(10, 1);
    const b = createImage(10, 1);
    blitWrapX(a, src, -3, 0);
    blitWrapX(b, src, -3 - 4 * 5, 0);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(px(a, 0, 0)[0]).toBe(180); // offset -3 → first visible source column is 3
    expect(px(a, 1, 0)[0]).toBe(0);
  });
});

describe("recolor + tint", () => {
  it("remaps the base hue and keeps unrelated colours", () => {
    const img = createImage(2, 1);
    fillRect(img, 0, 0, 1, 1, [...hexToRgb("#3f7d52"), 255]); // forest green (base)
    fillRect(img, 1, 0, 1, 1, [...hexToRgb("#c45c26"), 255]); // orange roof
    recolorRgba(img.data, "#3f7d52", "#7d3f6a");
    const [r, g, b] = px(img, 0, 0);
    expect(r! > g!).toBe(true); // now purple-ish
    expect(b! > g!).toBe(true);
    expect(px(img, 1, 0).slice(0, 3)).toEqual(hexToRgb("#c45c26"));
  });

  it("tint multiplies toward the colour by amount and skips transparent pixels", () => {
    const img = createImage(2, 1);
    fillRect(img, 0, 0, 1, 1, [200, 200, 200, 255]);
    tintRgba(img.data, "#ff0000", 1);
    expect(px(img, 0, 0)).toEqual([200, 0, 0, 255]);
    expect(px(img, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it("applyColor returns the same image when there is nothing to do, a copy otherwise", () => {
    const img = createImage(1, 1);
    fillRect(img, 0, 0, 1, 1, [100, 100, 100, 255]);
    expect(applyColor(img, {})).toBe(img);
    const out = applyColor(img, { tint: "#000000", tintAmount: 0.5 });
    expect(out).not.toBe(img);
    expect(px(out, 0, 0)).toEqual([50, 50, 50, 255]);
    expect(px(img, 0, 0)).toEqual([100, 100, 100, 255]);
  });
});
