import { describe, expect, it } from "vitest";
import {
  surfaceBelow,
  MASK_E,
  MASK_N,
  MASK_S,
  MASK_W,
  buildTiles,
  mergeRuns,
  normalizeTiles,
  resolveTile,
  surfaceY,
  terrainMask,
  tileShape,
} from "../src/shared/tiles.js";

describe("autotile", () => {
  const map = [
    "........",
    "..###...",
    "..###...",
    "........",
  ];

  it("gives each cell a 4-neighbour mask", () => {
    expect(terrainMask(map, 2, 1)).toBe(MASK_E | MASK_S); // top-left corner
    expect(terrainMask(map, 3, 1)).toBe(MASK_E | MASK_S | MASK_W); // top edge
    expect(terrainMask(map, 4, 2)).toBe(MASK_N | MASK_W); // bottom-right corner
  });

  it("maps the mask to atlas col/row (index = mask)", () => {
    const m = MASK_E | MASK_S | MASK_W; // 14
    expect(resolveTile(map, 3, 1)).toEqual({ col: m % 4, row: Math.floor(m / 4) });
    expect(resolveTile(map, 0, 0)).toBeNull();
  });

  it("treats off-map bottom and side continuation as solid so map edges stay seamless", () => {
    const ground = ["....", "####"];
    expect(terrainMask(ground, 0, 1)).toBe(MASK_E | MASK_S | MASK_W);
    expect(terrainMask(ground, 3, 1)).toBe(MASK_E | MASK_S | MASK_W);
  });

  it("picks platform end caps from horizontal neighbours", () => {
    const row = [".=.===."];
    expect(resolveTile(row, 1, 0)).toEqual({ col: 0, row: 4 }); // single
    expect(resolveTile(row, 3, 0)).toEqual({ col: 1, row: 4 }); // left end
    expect(resolveTile(row, 4, 0)).toEqual({ col: 2, row: 4 }); // middle
    expect(resolveTile(row, 5, 0)).toEqual({ col: 3, row: 4 }); // right end
  });

  it("counts slopes as solid neighbours so ground under a slope has no grass top", () => {
    const m = ["./", "##"];
    expect(terrainMask(m, 1, 1) & MASK_N).toBe(MASK_N);
    expect(terrainMask(m, 0, 1) & MASK_N).toBe(0);
  });
});

describe("collision shapes", () => {
  it("solid is a full square, platform is one-way and thin, slopes are triangles", () => {
    expect(tileShape("#", 16)).toEqual({ points: [[0, 0], [16, 0], [16, 16], [0, 16]], oneWay: false });
    const p = tileShape("=", 16)!;
    expect(p.oneWay).toBe(true);
    expect(Math.max(...p.points.map(([, y]) => y))).toBe(4);
    expect(tileShape("/", 16)!.points).toHaveLength(3);
    expect(tileShape(".", 16)).toBeNull();
  });

  it("merges horizontal runs into rects", () => {
    expect(mergeRuns(["##.#", "===."], 16, "#")).toEqual([
      { x: 0, y: 0, w: 32, h: 16 },
      { x: 48, y: 0, w: 16, h: 16 },
    ]);
    expect(mergeRuns(["##.#", "===."], 16, "=")).toEqual([{ x: 0, y: 16, w: 48, h: 4 }]);
  });
});

describe("buildTiles", () => {
  it("lays flat ground of the requested height", () => {
    const t = buildTiles({ width: 6, height: 5, groundHeight: 2 });
    expect(t).toEqual(["......", "......", "......", "######", "######"]);
  });

  it("builds a hill with matching slopes on both sides", () => {
    const t = buildTiles({ width: 10, height: 6, groundHeight: 2, hills: [{ x: 2, width: 2, height: 2 }] });
    expect(t).toEqual([
      "..........",
      "..........",
      ".../##\\...",
      "../####\\..",
      "##########",
      "##########",
    ]);
  });

  it("cuts pits and adds one-way platforms above the ground surface", () => {
    const t = buildTiles({ width: 8, height: 6, groundHeight: 2, pits: [{ x: 3, width: 2 }], platforms: [{ x: 2, y: 2, length: 4 }] });
    expect(t[2]).toBe("..====..");
    expect(t[4]).toBe("###..###");
    expect(t[5]).toBe("###..###");
  });

  it("normalizes rows: pads, crops and drops unknown codes", () => {
    expect(normalizeTiles(["#x#", "######"], 4, 3)).toEqual(["#.#.", "####", "...."]);
  });

  it("finds the walkable surface per column", () => {
    const t = buildTiles({ width: 4, height: 6, groundHeight: 2 });
    expect(surfaceY(t, 0, 16)).toBe(4 * 16);
    expect(surfaceY(["....", "...."], 0, 16)).toBe(32);
  });

  it("ignores one-way platforms for ground snapping unless asked, and surfaceBelow finds the platform under the cursor", () => {
    const t = ["....", "=...", "....", "####"];
    expect(surfaceY(t, 0, 16)).toBe(48);
    expect(surfaceY(t, 0, 16, { platforms: true })).toBe(16);
    expect(surfaceBelow(t, 0, 16, 0)).toBe(16);
    expect(surfaceBelow(t, 0, 16, 20)).toBe(16); // cursor on the platform row
    expect(surfaceBelow(t, 0, 16, 33)).toBe(48);
  });
});
