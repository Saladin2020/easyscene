import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadAssets } from "../src/lib/compose.js";
import { readPng } from "../src/lib/png.js";
import { loadParts, loadScenes, partImagePath } from "../src/lib/workspace.js";
import { composeScene } from "../src/shared/scene.js";
import { renderScene } from "../src/shared/render.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ root, cleanup } = await tempWorkspace()));
afterAll(() => cleanup());

describe("sample part set", () => {
  it("writes every part with matching PNG size, sample flag and CC0 license", async () => {
    const parts = await loadParts(root);
    expect(parts.filter((p) => p.kind === "background").length).toBeGreaterThanOrEqual(4);
    expect(parts.filter((p) => p.kind === "tileset").length).toBeGreaterThanOrEqual(1);
    for (const id of ["prop_tree_oak", "prop_house", "prop_fence", "prop_sign"]) expect(parts.some((p) => p.id === id)).toBe(true);
    for (const p of parts) {
      const img = await readPng(partImagePath(root, p));
      expect([img.width, img.height]).toEqual([p.width, p.height]);
      expect(p.sample).toBe(true);
      expect(p.license).toBe("CC0-1.0");
    }
    const credits = JSON.parse(await readFile(path.join(root, "parts", "CREDITS.json"), "utf8"));
    expect(credits.parts).toHaveLength(parts.length);
  });

  it("every background loops seamlessly: moving the camera one full loop gives identical pixels", async () => {
    const parts = await loadParts(root);
    for (const bg of parts.filter((p) => p.kind === "background")) {
      const { scene } = composeScene(parts, { id: "loop", width: 40, layers: [{ part: bg.id, scroll: 1 }], tiles: ["."] });
      const assets = await loadAssets(root, scene, parts);
      const loop = bg.kind === "background" ? bg.loopWidth : 0;
      const at = (camX: number) => renderScene(scene, assets, { cameraX: camX, width: 200, height: 270, include: { tiles: false, props: false } });
      expect(Buffer.from(at(37).data).equals(Buffer.from(at(37 + loop).data)), bg.id).toBe(true);
      // the wrap seam (last column → first column) must look like any other neighbouring column pair
      const img = assets.image(bg.id)!;
      const colDiff = (x0: number, x1: number) => {
        let d = 0;
        for (let y = 0; y < img.height; y++) {
          for (let c = 0; c < 4; c++) d += Math.abs(img.data[(y * img.width + x0) * 4 + c]! - img.data[(y * img.width + x1) * 4 + c]!);
        }
        return d / img.height;
      };
      let inner = 0;
      for (let x = 0; x < img.width - 1; x++) inner = Math.max(inner, colDiff(x, x + 1));
      expect(colDiff(img.width - 1, 0), `${bg.id} seam`).toBeLessThanOrEqual(inner);
    }
  });

  it("seeds demo scenes that reference real parts", async () => {
    const parts = new Set((await loadParts(root)).map((p) => p.id));
    const scenes = await loadScenes(root);
    expect(scenes.length).toBeGreaterThanOrEqual(2);
    for (const s of scenes) {
      for (const id of [s.tileset, ...s.layers.map((l) => l.part), ...s.props.map((p) => p.part)]) expect(parts.has(id), id).toBe(true);
    }
  });
});
