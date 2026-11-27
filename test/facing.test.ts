/** DSK-6: vehicles carry the nose direction they are drawn with, so runtimes never move them backwards. */
import { describe, expect, it } from "vitest";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { noseScaleX, type PropPart } from "../src/shared/types.js";

const defs = () => new Map(sampleDefs().map((d) => [d.meta.id, d]));

/** Mean x of the orange tail-fin pixels (planes): the nose is on the other side. */
function tailX(id: string): number {
  const img = defs().get(id)!.draw();
  let sx = 0, n = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4;
    const [r, g, b, a] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
    if (a > 0 && r > 200 && g > 80 && g < 170 && b < 90) { sx += x; n++; }
  }
  expect(n, `${id} has an orange tail`).toBeGreaterThan(0);
  return sx / n;
}

describe("vehicle facing", () => {
  it("noseScaleX mirrors the sprite only when travel is opposite the drawn nose", () => {
    expect(noseScaleX("left", -30)).toBe(1);
    expect(noseScaleX("left", 30)).toBe(-1);
    expect(noseScaleX("right", 30)).toBe(1);
    expect(noseScaleX("right", -30)).toBe(-1);
    expect(noseScaleX(undefined, 30)).toBe(1);
    expect(noseScaleX("left", 0)).toBe(1);
  });

  it("every vehicle part declares its facing", () => {
    for (const d of sampleDefs()) {
      const m = d.meta as PropPart;
      if (m.kind === "prop" && m.tags?.includes("vehicle")) expect(m.facing, m.id).toMatch(/^(left|right)$/);
    }
  });

  it("plane art matches the declared facing (tail opposite the nose)", () => {
    for (const id of ["prop_plane_side", "prop_plane_sky"]) {
      const m = defs().get(id)!.meta as PropPart;
      const w = m.width;
      const nose = tailX(id) > w / 2 ? "left" : "right";
      expect(m.facing, id).toBe(nose);
      // moving right, the sprite must be mirrored so the nose leads
      expect(noseScaleX(m.facing, +1) * (nose === "right" ? 1 : -1)).toBe(1);
      expect(noseScaleX(m.facing, -1) * (nose === "right" ? 1 : -1)).toBe(-1);
    }
  });
});
