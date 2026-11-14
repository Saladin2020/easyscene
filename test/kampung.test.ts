import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readPng } from "../src/lib/png.js";
import { DEMO_INPUTS } from "../src/lib/demoScenes.js";
import { loadParts, partImagePath } from "../src/lib/workspace.js";
import { composeScene } from "../src/shared/scene.js";
import { propCategory, type PartMeta, type PropPart } from "../src/shared/types.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let parts: PartMeta[];
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  parts = await loadParts(root);
});
afterAll(() => cleanup());

const BUILDINGS = [
  "prop_bld_mosque_wooden", "prop_bld_malay_house", "prop_bld_roti_teashop", "prop_bld_halal_stall",
  "prop_bld_wat_sala", "prop_bld_chinese_shrine",
];
const OTHER = ["prop_kolek_boat", "prop_fish_rack", "prop_fisher_hut"];

describe("multicultural village set", () => {
  it("ships the kampung, temple and shrine buildings as modular back-layer buildings", () => {
    const byId = new Map(parts.map((p) => [p.id, p]));
    for (const id of BUILDINGS) {
      const p = byId.get(id) as PropPart | undefined;
      expect(p, id).toBeDefined();
      expect(propCategory(p!), id).toBe("building");
      expect(p!.defaultLayer).toBe("back");
      expect(p!.width % 16, id).toBe(0);
      expect(p!.tags).toContain("multicultural");
    }
    for (const id of OTHER) expect(byId.get(id), id).toBeDefined();
  });

  it.each(BUILDINGS)("%s reaches both footprint edges and stands on its bottom row", async (id) => {
    const p = parts.find((q) => q.id === id)!;
    const img = await readPng(partImagePath(root, p));
    const a = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;
    const bottom = img.height - 1;
    let left = false;
    let right = false;
    for (let y = 0; y < img.height; y++) {
      if (a(0, y)) left = true;
      if (a(img.width - 1, y)) right = true;
    }
    expect(left && right, id).toBe(true);
    let ground = 0;
    for (let x = 0; x < img.width; x++) if (a(x, bottom)) ground++;
    expect(ground, id).toBeGreaterThan(img.width * 0.2);
  });

  it("harmony_town puts the temple, shrine and mosque on one street with no warnings", () => {
    const input = DEMO_INPUTS.find((d) => d.id === "harmony_town")!;
    const { scene, warnings } = composeScene(parts, input);
    expect(warnings).toEqual([]);
    const ids = scene.props.map((p) => p.part);
    for (const id of ["prop_bld_wat_sala", "prop_bld_chinese_shrine", "prop_bld_mosque_wooden", "prop_kolek_boat"]) expect(ids).toContain(id);
    const street = scene.props.filter((p) => propCategory(parts.find((q) => q.id === p.part) as PropPart) === "building");
    for (let i = 1; i < street.length; i++) {
      const prev = parts.find((q) => q.id === street[i - 1]!.part) as PropPart;
      expect(street[i]!.x).toBe(street[i - 1]!.x + prev.width);
    }
  });
});
