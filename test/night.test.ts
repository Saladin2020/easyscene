/**
 * Night side-view scenes (render --night, export night, MCP night): darker moonlit art, the night sky with
 * one moon, lit windows / lamps with a glow layer, readable signs, tinted characters — and day output untouched.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeAndSave, loadAssets, loadRenderScene } from "../src/lib/compose.js";
import { exportScene } from "../src/lib/export.js";
import { loadParts, loadScene } from "../src/lib/workspace.js";
import { NIGHT_GLOW_PART, nightProp, nightSheet, skyOneMoon } from "../src/shared/night.js";
import type { RgbaImage } from "../src/shared/raster.js";
import { renderScene } from "../src/shared/render.js";
import { TOWN_KINDS, townInput } from "../src/shared/townGen.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ root, cleanup } = await tempWorkspace()));
afterAll(() => cleanup?.());

const meanLum = (img: RgbaImage) => {
  let s = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) { s += 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!; n++; }
  return s / Math.max(1, n);
};
/** warm, bright pixels: lit windows, bulbs, lanterns */
const warmLights = (img: RgbaImage) => {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! > 200 && img.data[i + 1]! > 140 && img.data[i]! - img.data[i + 2]! > 70) n++;
  return n;
};
const sha = (b: NodeJS.ArrayBufferView) => createHash("sha256").update(b).digest("hex");
async function tree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const f = path.join(e.parentPath, e.name);
    out[path.relative(dir, f)] = sha(await readFile(f));
  }
  return out;
}

describe("night town streets", () => {
  it.each(TOWN_KINDS)("%s: darker, night sky, lights with glow, deterministic", async (kind) => {
    const parts = await loadParts(root);
    const { scene } = await composeAndSave(root, townInput(parts, { id: `n_${kind}`, kind, seed: 3 }));
    const day = await loadRenderScene(root, scene, false);
    const night = await loadRenderScene(root, scene, true);
    const dImg = renderScene(day.doc, day.assets);
    const nImg = renderScene(night.doc, night.assets);
    expect(meanLum(nImg)).toBeLessThan(meanLum(dImg) * 0.6);
    // the sky band is the night sky, twice as wide so the moon shows once per loop
    const sky = night.doc.layers[0]!.part;
    expect(night.assets.image(sky)!.width).toBe(2 * day.assets.image(sky)!.width);
    // a glow layer in front, and real lights (not just a dark picture)
    expect(night.doc.props.at(-1)).toMatchObject({ part: NIGHT_GLOW_PART, layer: "front" });
    expect(day.doc.props.some((p) => p.part === NIGHT_GLOW_PART)).toBe(false);
    expect(warmLights(nImg)).toBeGreaterThan(kind === "rural_village" ? 20 : 150);
    // the day doc is not touched
    expect(JSON.stringify(day.doc)).toBe(JSON.stringify(scene));
    const again = await loadRenderScene(root, scene, true);
    expect(sha(renderScene(again.doc, again.assets).data)).toBe(sha(nImg.data));
  }, 60_000);

  it("generic (non-town) scenes render at night too", async () => {
    for (const id of ["village_day", "misty_ruins", "brick_street"]) {
      const doc = await loadScene(root, id);
      const d = await loadRenderScene(root, doc, false);
      const n = await loadRenderScene(root, doc, true);
      expect(meanLum(renderScene(n.doc, n.assets))).toBeLessThan(meanLum(renderScene(d.doc, d.assets)) * 0.65);
    }
  });

  it("signs stay readable (contrast kept, just dimmer) and bulbs stay bright", async () => {
    const doc = await loadScene(root, "thai_village_street");
    const a = await loadAssets(root, doc, undefined, ["prop_signpost_th", "prop_street_lamp"]);
    const contrast = (img: RgbaImage) => {
      const l: number[] = [];
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) l.push(0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!);
      const m = l.reduce((s, v) => s + v, 0) / l.length;
      return Math.sqrt(l.reduce((s, v) => s + (v - m) ** 2, 0) / l.length);
    };
    const sign = a.image("prop_signpost_th")!;
    const ns = nightProp(sign, "prop_signpost_th", a.meta("prop_signpost_th")).image;
    expect(meanLum(ns)).toBeLessThan(meanLum(sign));
    expect(contrast(ns)).toBeGreaterThan(contrast(sign) * 0.25);
    const lamp = a.image("prop_street_lamp");
    if (lamp) {
      const nl = nightProp(lamp, "prop_street_lamp", a.meta("prop_street_lamp"));
      expect(nl.lights.length).toBeGreaterThan(0);
    }
  });

  it("characters are tinted to match the night", () => {
    const sheet: RgbaImage = { width: 2, height: 1, data: new Uint8Array([200, 200, 200, 255, 0, 0, 0, 0]) };
    const t = nightSheet(sheet);
    expect([...t.data.slice(0, 4)]).toEqual([124, 132, 180, 255]);
    expect([...t.data.slice(4)]).toEqual([0, 0, 0, 0]);
  });

  it("skyOneMoon keeps the left loop and removes the moon from the right one", async () => {
    const doc = await loadScene(root, "village_day");
    const a = await loadAssets(root, doc, undefined, ["bg_sky_night"]);
    const sky = a.image("bg_sky_night")!;
    const two = skyOneMoon(sky);
    const bright = (img: RgbaImage, x0: number, x1: number) => {
      let n = 0;
      for (let y = 0; y < img.height * 0.55; y++) for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i]! > 230 && img.data[i + 1]! > 225 && img.data[i + 2]! > 190) n++;
      }
      return n;
    };
    expect(bright(two, 0, sky.width)).toBeGreaterThan(bright(two, sky.width, 2 * sky.width) + 60);
  });
});

describe("night export", () => {
  it("writes the night twin next to the day files; godot / png day files stay byte-identical", async () => {
    const dir = path.join(root, "nx");
    const parts = await loadParts(root);
    const { scene } = await composeAndSave(root, townInput(parts, { id: "nx_kampung", kind: "malay_kampung", seed: 3, town: "t1", map: "world" }));
    for (const preset of ["png", "godot", "pixi"] as const) {
      const plain = await exportScene(root, { scene, preset, dir: path.join(dir, "plain") });
      const withNight = await exportScene(root, { scene, preset, dir: path.join(dir, "night"), night: true });
      const a = await tree(plain.dir);
      const b = await tree(withNight.dir);
      const extra = Object.keys(b).filter((k) => !(k in a));
      expect(extra.length).toBeGreaterThan(3);
      for (const k of extra) expect(k.startsWith("night/") || k.startsWith("nx_kampung_night")).toBe(true);
      for (const [k, v] of Object.entries(a)) {
        if (preset === "pixi" && k === "nx_kampung.pixi.json") continue;
        expect(b[k], `${preset}/${k}`).toBe(v);
      }
      if (preset === "pixi") {
        const day = JSON.parse(await readFile(path.join(withNight.dir, "nx_kampung.pixi.json"), "utf8"));
        const plainDay = JSON.parse(await readFile(path.join(plain.dir, "nx_kampung.pixi.json"), "utf8"));
        expect(day.night).toBe("nx_kampung_night.pixi.json");
        expect({ ...day, night: undefined }).toEqual({ ...plainDay, night: undefined });
        expect(plainDay.night).toBeUndefined();
        const night = JSON.parse(await readFile(path.join(withNight.dir, "nx_kampung_night.pixi.json"), "utf8"));
        expect(night).toMatchObject({ lighting: "night", day: "nx_kampung.pixi.json", exits: day.exits, town: day.town });
        expect(night.tilemap).toEqual(day.tilemap);
        expect(night.collision).toEqual(day.collision);
        expect(night.layers.every((l: { image: string }) => l.image.startsWith("night/"))).toBe(true);
        expect(night.props.at(-1)).toMatchObject({ part: NIGHT_GLOW_PART, layer: "front", x: 0, y: 0 });
      }
      if (preset === "godot") {
        const tscn = await readFile(path.join(withNight.dir, "nx_kampung_night.tscn"), "utf8");
        expect(tscn).toContain("res://night/assets/");
        expect(tscn).toContain("res://nx_kampung_night_tileset.tres");
        expect(tscn).not.toMatch(/res:\/\/assets\//);
        expect(extra).not.toContain("project.godot");
      }
    }
  }, 120_000);
});
