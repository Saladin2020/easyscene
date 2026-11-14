import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadAssets } from "../src/lib/compose.js";
import { DEMO_INPUTS } from "../src/lib/demoScenes.js";
import { exportScene } from "../src/lib/export.js";
import { readPng } from "../src/lib/png.js";
import { GROUND_FLOOR, MAX_BUILDING_H, STOREY } from "../src/lib/sampleBrick.js";
import { loadParts, partImagePath } from "../src/lib/workspace.js";
import { renderProps } from "../src/shared/render.js";
import { composeScene, layoutStreet } from "../src/shared/scene.js";
import { BRICK_TOWN_SET, dressStreet, generateStreet } from "../src/shared/streetGen.js";
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

const BUILDINGS = BRICK_TOWN_SET.buildings.map((b) => b.part);
const alpha = (img: { width: number; data: ArrayLike<number> }, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;
/** Every brick-town facade is opaque at least this high on both party walls. */
const PARTY_WALL = GROUND_FLOOR + STOREY;

describe("brick town parts", () => {
  it("ships every rowhouse as a modular back-layer building on the 16 px grid", () => {
    const byId = new Map(parts.map((p) => [p.id, p]));
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(8);
    for (const b of BRICK_TOWN_SET.buildings) {
      const p = byId.get(b.part) as PropPart | undefined;
      expect(p, b.part).toBeDefined();
      expect(propCategory(p!)).toBe("building");
      expect(p!.defaultLayer).toBe("back");
      expect(p!.width % 16, b.part).toBe(0);
      expect(p!.width, b.part).toBe(b.width);
      expect(p!.tags).toContain("brick-town");
      expect(p!.height, b.part).toBeLessThanOrEqual(MAX_BUILDING_H);
    }
    for (const id of [
      "bg_sky_bright", "bg_far_city_spires", "bg_mid_utility_poles", "tiles_city_sidewalk", "prop_street_tree", "prop_planter_brick",
      "prop_lamp_post_city", "prop_fire_hydrant", "prop_bus_stop", "prop_car_hatch_red", "prop_car_sedan_dark", "prop_city_road",
    ]) expect(byId.has(id), id).toBe(true);
  });

  it.each(BUILDINGS)("%s has opaque party walls on both edges from the ground up and a full ground row", async (id) => {
    const p = parts.find((q) => q.id === id)!;
    const img = await readPng(partImagePath(root, p));
    for (let y = img.height - PARTY_WALL; y < img.height; y++) {
      expect(alpha(img, 0, y), `${id} left @${y}`).toBe(255);
      expect(alpha(img, img.width - 1, y), `${id} right @${y}`).toBe(255);
    }
    for (let x = 0; x < img.width; x++) expect(alpha(img, x, img.height - 1), `${id} ground @${x}`).toBe(255);
  });

  it("the road strip tiles seamlessly: the wrap seam is no harsher than any column pair inside it", async () => {
    const p = parts.find((q) => q.id === "prop_city_road")!;
    const img = await readPng(partImagePath(root, p));
    const colDiff = (x0: number, x1: number) => {
      let d = 0;
      for (let y = 0; y < img.height; y++) for (let c = 0; c < 4; c++) d += Math.abs(img.data[(y * img.width + x0) * 4 + c]! - img.data[(y * img.width + x1) * 4 + c]!);
      return d / img.height;
    };
    let inner = 0;
    for (let x = 0; x < img.width - 1; x++) inner = Math.max(inner, colDiff(x, x + 1));
    expect(colDiff(img.width - 1, 0)).toBeLessThanOrEqual(inner);
    for (let x = 0; x < img.width; x++) for (let y = 0; y < img.height; y++) expect(alpha(img, x, y)).toBe(255);
  });
});

describe("seamless terrace", () => {
  it.each([1, 7, 2026, 99999])("seed %i: a 40-building street has no gaps, no overlaps and a continuous facade", async (seed) => {
    const { scene, warnings } = composeScene(parts, {
      id: "terrace", width: 256, height: 18, tileset: "tiles_city_sidewalk", layers: ["bg_sky_bright"],
      terrain: { groundHeight: 3 }, streets: [{ x: 0, generate: { set: "brick_town", seed, count: 40, dress: false } }],
    });
    expect(warnings).toEqual([]);
    const byId = new Map(parts.map((p) => [p.id, p]));
    const bld = scene.props.filter((p) => BUILDINGS.includes(p.part));
    expect(bld).toHaveLength(40);
    for (let i = 1; i < bld.length; i++) {
      expect(bld[i]!.x).toBe(bld[i - 1]!.x + byId.get(bld[i - 1]!.part)!.width);
      expect(bld[i]!.part).not.toBe(bld[i - 1]!.part);
    }
    const end = bld[bld.length - 1]!.x + byId.get(bld[bld.length - 1]!.part)!.width;
    const assets = await loadAssets(root, scene, parts);
    const back = renderProps(scene, assets, "back");
    const ground = bld[0]!.y;
    for (let x = 0; x < end; x++) for (let y = ground - PARTY_WALL; y < ground; y++) {
      if (alpha(back, x, y) !== 255) throw new Error(`gap in the facade at x=${x} y=${y}`);
    }
  }, 30_000);

  it("chains any building after any other (all pairs) edge to edge", () => {
    for (const a of BUILDINGS) for (const b of BUILDINGS) {
      const res = layoutStreet(parts, { x: 0, items: [a, b, a] });
      expect(res.warnings).toEqual([]);
      const wa = parts.find((p) => p.id === a)!.width;
      const wb = parts.find((p) => p.id === b)!.width;
      expect(res.props.map((p) => p.x)).toEqual([0, wa, wa + wb]);
      expect(res.endX).toBe(2 * wa + wb);
    }
  });
});

describe("seeded street generator", () => {
  it("is deterministic per seed and varies between seeds", () => {
    const a = generateStreet({ set: "brick_town", seed: 42, count: 12 });
    expect(generateStreet({ set: "brick_town", seed: 42, count: 12 })).toEqual(a);
    const others = [1, 2, 3, 4, 5].map((s) => generateStreet({ set: "brick_town", seed: s, count: 12 }).items.join());
    expect(new Set([a.items.join(), ...others]).size).toBeGreaterThan(4);
    expect(a.items).toHaveLength(12);
  });

  it("dresses the row: road under the whole length, cars on the road, furniture on the sidewalk", () => {
    const { scene, warnings } = composeScene(parts, {
      id: "dressed", width: 80, height: 18, tileset: "tiles_city_sidewalk", terrain: { groundHeight: 3 },
      streets: [{ x: 32, generate: { set: "brick_town", seed: 5, count: 12 } }],
    });
    expect(warnings).toEqual([]);
    const surface = 18 * 16 - 3 * 16;
    const byId = new Map(parts.map((p) => [p.id, p]));
    const bld = scene.props.filter((p) => BUILDINGS.includes(p.part));
    const x0 = bld[0]!.x;
    const x1 = bld[bld.length - 1]!.x + byId.get(bld[bld.length - 1]!.part)!.width;
    expect(x0).toBe(32);
    const road = scene.props.filter((p) => p.part === "prop_city_road");
    expect(road[0]!.x).toBe(x0);
    expect(road[road.length - 1]!.x + 128).toBeGreaterThanOrEqual(x1);
    for (const r of road) { expect(r.y).toBe(surface + 48); expect(r.layer).toBe("front"); }
    const cars = scene.props.filter((p) => p.part.startsWith("prop_car_"));
    expect(cars.length).toBeGreaterThan(0);
    for (const c of cars) expect(c.y).toBe(surface + 30);
    // cars never overlap each other
    const spans = cars.map((c) => [c.x, c.x + byId.get(c.part)!.width] as const).sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1]);
    const furniture = scene.props.filter((p) => ["prop_street_tree", "prop_lamp_post_city", "prop_fire_hydrant", "prop_planter_brick", "prop_bus_stop"].includes(p.part));
    expect(furniture.length).toBeGreaterThan(4);
    for (const f of furniture) expect(f.y).toBe(surface);
  });

  it("dresses hand-listed items too (count 0) and reports unknown sets", () => {
    const res = layoutStreet(parts, { items: ["prop_bld_brick_row2_red", "prop_bld_brick_row3_brown"], generate: { set: "brick_town", seed: 1, count: 0 } });
    expect(res.warnings).toEqual([]);
    expect(res.props.some((p) => p.part === "prop_city_road")).toBe(true);
    const bad = layoutStreet(parts, { generate: { set: "nope" as "brick_town", seed: 1 } });
    expect(bad.warnings.join()).toMatch(/unknown set/);
    expect(dressStreet("brick_town", 1, [])).toEqual([]);
  });
});

describe("brick_street demo", () => {
  it("composes with no warnings and holds every brick-town piece", () => {
    const input = DEMO_INPUTS.find((d) => d.id === "brick_street")!;
    const { scene, warnings } = composeScene(parts, input);
    expect(warnings).toEqual([]);
    const ids = new Set(scene.props.map((p) => p.part));
    for (const id of [...BUILDINGS, "prop_street_tree", "prop_lamp_post_city", "prop_city_road", "prop_car_hatch_red", "prop_car_sedan_dark", "prop_bus_stop"]) {
      expect(ids.has(id), id).toBe(true);
    }
    const byId = new Map(parts.map((p) => [p.id, p]));
    const mapW = scene.width * scene.tileSize;
    // buildings and furniture stay on the map; only the last road strip may run on past the edge
    for (const p of scene.props) expect(p.x + byId.get(p.part)!.width, p.part).toBeLessThanOrEqual(mapW + (p.part === "prop_city_road" ? 127 : 0));
  });

  it.each(["png", "godot", "pixi"] as const)("exports to %s", async (preset) => {
    const res = await exportScene(root, { sceneId: "brick_street", preset });
    expect(res.paths.length).toBeGreaterThan(3);
    for (const p of res.paths) await expect(access(p)).resolves.toBeUndefined();
    if (preset === "godot") {
      const tscn = await readFile(path.join(res.dir, "brick_street.tscn"), "utf8");
      expect(tscn).toMatch(/type="TileMapLayer"/);
      expect(tscn.match(/type="Parallax2D"/g)).toHaveLength(3);
    }
  }, 30_000);
});
