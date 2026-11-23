import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodePng } from "../src/lib/png.js";
import { explicitNightMask } from "../src/lib/pixelArt.js";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { loadParts } from "../src/lib/workspace.js";
import { NIGHT_MASK_FILE, nightProp } from "../src/shared/night.js";
import { readFile } from "node:fs/promises";
import { initWorkspace, partImagePath } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  await initWorkspace(root);
});
afterAll(() => cleanup());

const props = () => sampleDefs().filter((d) => d.meta.kind === "prop");

describe("explicit night masks for every sample prop", () => {
  it("init writes a night.png for every sample prop (all-clear when nothing lights up)", async () => {
    const parts = await loadParts(root);
    for (const d of props()) {
      const meta = parts.find((p) => p.id === d.meta.id)!;
      expect(existsSync(path.join(path.dirname(partImagePath(root, meta)), NIGHT_MASK_FILE)), d.meta.id).toBe(true);
    }
  });

  it("no sample prop goes through colour detection: poles, flag pole and nets get no stray lights", async () => {
    for (const id of ["prop_power_pole", "prop_power_pole_end", "prop_flag_pole"]) {
      const d = props().find((p) => p.meta.id === id)!;
      const img = d.draw();
      expect(nightProp(img, id, d.meta, explicitNightMask(img)).lights, id).toEqual([]);
    }
  });

  it("the stilt fishing hut lights its window by mask, not its blue nets", async () => {
    const d = props().find((p) => p.meta.id === "prop_fisher_hut")!;
    const img = d.draw();
    const { lights } = nightProp(img, d.meta.id, d.meta, explicitNightMask(img));
    expect(lights.length).toBe(1);
    expect(lights[0]!.x).toBeGreaterThan(20);
    expect(lights[0]!.x).toBeLessThan(34);
    expect(lights[0]!.y).toBeGreaterThan(32);
    expect(lights[0]!.y).toBeLessThan(46);
  });

  it("masks are read from disk exactly as drawn", async () => {
    const parts = await loadParts(root);
    const meta = parts.find((p) => p.id === "prop_flag_pole")!;
    const m = decodePng(await readFile(path.join(path.dirname(partImagePath(root, meta)), NIGHT_MASK_FILE)));
    expect([m.width, m.height]).toEqual([meta.width, meta.height]);
    expect(m.data.every((v) => v === 0)).toBe(true);
  });
});
