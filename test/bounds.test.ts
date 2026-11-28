import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportScene } from "../src/lib/export.js";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { loadParts, loadScene } from "../src/lib/workspace.js";
import { clampVehiclesToRoad, hasWaterOrPier, isStreetVehicle, roadBounds, walkBounds } from "../src/shared/bounds.js";
import { composeScene } from "../src/shared/scene.js";
import { composeTown } from "../src/shared/townGen.js";
import type { PartMeta, SceneDoc } from "../src/shared/types.js";
import { tempWorkspace } from "./helpers.js";

const catalog = sampleDefs().map((d) => d.meta);

describe("walk / road bounds", () => {
  it("lets the player walk onto a pier but keeps the road (and cars) on land", () => {
    const { scene } = composeScene(catalog, {
      id: "canal",
      width: 20,
      height: 8,
      tileset: "tiles_street",
      terrain: { groundHeight: 3, pits: [{ x: 12, width: 8 }] },
      props: [
        { part: "prop_pier", x: 176 },
        { part: "prop_car_pickup", x: 192 }, // on the pier over the pit
        { part: "prop_kolek_boat", x: 240, y: 120 },
      ],
    });
    const walk = walkBounds(scene, catalog);
    const road = roadBounds(scene, catalog);
    expect(walk.maxX).toBeGreaterThan(road.maxX);
    expect(walk.maxX).toBeLessThanOrEqual(20 * 16);
    // pier is 64 px from x 176, pit starts at col 12 (192). Deck covers the bank + water.
    expect(walk.maxX).toBe(176 + 64);
    expect(road.maxX).toBeLessThanOrEqual(176); // road stops where the pier starts
    expect(road.maxX).toBeGreaterThan(0);
    const pickup = scene.props.find((p) => p.part === "prop_car_pickup")!;
    expect(pickup.x + 96).toBeLessThanOrEqual(road.maxX);
    expect(pickup.x).toBeLessThan(176);
    expect(hasWaterOrPier(scene, catalog)).toBe(true);
  });

  it("a malay kampung beach is walkable to the stilt-hut deck, not into the sea; annex vehicles stay on the road", () => {
    const { scene, warnings } = composeTown(catalog, { id: "k", kind: "malay_kampung", seed: 3, more: true });
    expect(warnings.filter((w) => w.startsWith("Moved "))).toEqual([]);
    const walk = walkBounds(scene, catalog);
    const road = roadBounds(scene, catalog);
    const hut = scene.props.find((p) => p.part === "prop_fisher_hut")!;
    const mapW = scene.width * scene.tileSize;
    expect(hasWaterOrPier(scene, catalog)).toBe(true);
    expect(walk.maxX).toBe(hut.x + 96); // hut deck is 96 px
    expect(walk.maxX).toBeLessThan(mapW);
    expect(road.maxX).toBeLessThanOrEqual(hut.x);
    expect(road.maxX).toBeLessThan(walk.maxX);
    for (const p of scene.props) {
      const meta = catalog.find((m) => m.id === p.part);
      if (isStreetVehicle(meta)) expect(p.x + (meta!.width)).toBeLessThanOrEqual(road.maxX);
    }
  });

  it("a mid-street pit (misty ruins style) is not a canal and does not get walk/road fields", () => {
    const { scene } = composeScene(catalog, {
      id: "hole",
      width: 24,
      height: 8,
      tileset: "tiles_stone",
      terrain: { groundHeight: 3, pits: [{ x: 10, width: 3 }] },
    });
    expect(hasWaterOrPier(scene, catalog)).toBe(false);
    expect(walkBounds(scene, catalog).maxX).toBe(10 * 16); // walking still stops at the hole
  });

  it("landlocked streets have no walk/road split and leave parked cars where they are", () => {

    const { scene } = composeTown(catalog, { id: "c", kind: "chinese_town", seed: 5, more: true });
    const mapW = scene.width * scene.tileSize;
    expect(hasWaterOrPier(scene, catalog)).toBe(false);
    expect(walkBounds(scene, catalog)).toEqual({ minX: 0, maxX: mapW });
    expect(roadBounds(scene, catalog)).toEqual({ minX: 0, maxX: mapW });
    const before = scene.props.filter((p) => p.part === "prop_car_pickup").map((p) => p.x);
    expect(clampVehiclesToRoad(scene, catalog)).toEqual([]);
    expect(scene.props.filter((p) => p.part === "prop_car_pickup").map((p) => p.x)).toEqual(before);
  });

  it("clampVehiclesToRoad is idempotent after the first snap", () => {
    const { scene } = composeScene(catalog, {
      id: "pit",
      width: 16,
      height: 8,
      tileset: "tiles_street",
      terrain: { groundHeight: 3, pits: [{ x: 8, width: 8 }] },
      props: [{ part: "prop_pier", x: 112 }, { part: "prop_scooter_teal", x: 128 }],
    });
    expect(clampVehiclesToRoad(scene, catalog)).toEqual([]); // compose already snapped it
    const x = scene.props.find((p) => p.part === "prop_scooter_teal")!.x;
    scene.props.find((p) => p.part === "prop_scooter_teal")!.x = 160;
    const moved = clampVehiclesToRoad(scene, catalog);
    expect(moved).toHaveLength(1);
    expect(moved[0]!.from).toBe(160);
    expect(moved[0]!.to).toBe(x);
    expect(clampVehiclesToRoad(scene, catalog)).toEqual([]);
  });
});

describe("pixi export includes walk/road only on watery scenes", () => {
  let root: string;
  let cleanup: () => Promise<void>;
  let parts: PartMeta[];
  beforeAll(async () => {
    ({ root, cleanup } = await tempWorkspace());
    parts = await loadParts(root);
  });
  afterAll(() => cleanup());

  it("thai_village_street (canal + pier) exports walk to the deck and road on the bank", async () => {
    const doc = (await loadScene(root, "thai_village_street")) as SceneDoc;
    const pier = doc.props.find((p) => p.part === "prop_pier")!;
    const res = await exportScene(root, { sceneId: "thai_village_street", preset: "pixi" });
    const json = JSON.parse(await readFile(path.join(res.dir, "thai_village_street.pixi.json"), "utf8")) as {
      walk?: { minX: number; maxX: number };
      road?: { minX: number; maxX: number };
      size: { width: number };
    };
    expect(json.walk).toEqual(walkBounds(doc, parts));
    expect(json.road).toEqual(roadBounds(doc, parts));
    expect(json.walk!.maxX).toBe(pier.x + 64);
    expect(json.road!.maxX).toBeLessThanOrEqual(pier.x);
    expect(json.walk!.maxX).toBeLessThan(json.size.width);
  });
});
