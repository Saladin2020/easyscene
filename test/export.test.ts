import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeAndSave } from "../src/lib/compose.js";
import { decodeTileMapData, encodeTileMapData, exportScene } from "../src/lib/export.js";
import { loadScene } from "../src/lib/workspace.js";
import { resolveTile } from "../src/shared/tiles.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  await composeAndSave(root, {
    id: "forest_test",
    name: "Forest test",
    width: 40,
    layers: ["bg_sky_dusk", { part: "bg_far_mountains", color: "#7d5a9a" }, "bg_mid_forest", { part: "bg_near_bushes", tint: "#ff9a6a", tintAmount: 0.3 }],
    terrain: { groundHeight: 3, hills: [{ x: 20, width: 4, height: 2 }], platforms: [{ x: 6, y: 3, length: 4 }] },
    props: [{ part: "prop_tree_pine", x: 40 }, { part: "prop_rock", x: 200 }, { part: "prop_bush", x: 300, flipX: true }],
    collision: [{ x: 500, y: 150, w: 32, h: 8, oneWay: true }],
  });
});
afterAll(() => cleanup());

const pngSize = async (file: string) => {
  const p = PNG.sync.read(await readFile(file));
  return [p.width, p.height];
};

describe("png export", () => {
  it("writes layer PNGs at part size and map-sized tilemap/props/preview", async () => {
    const res = await exportScene(root, { sceneId: "forest_test", preset: "png" });
    const byName = (n: string) => res.paths.find((p) => path.basename(p) === n)!;
    expect(res.paths.filter((p) => path.basename(p).startsWith("layer_"))).toHaveLength(4);
    expect(await pngSize(res.paths.find((p) => path.basename(p).startsWith("layer_0"))!)).toEqual([480, 270]);
    for (const n of ["tilemap.png", "props_back.png", "props_front.png", "forest_test_preview.png"]) {
      expect(await pngSize(byName(n)), n).toEqual([40 * 16, 17 * 16]);
    }
    expect(await pngSize(byName("forest_test_parallax.png"))).toEqual([480, 270 * 3 + 4]);
  });
});

describe("godot export", () => {
  it("writes a .tscn whose every ext_resource exists and a TileSet with physics", async () => {
    const res = await exportScene(root, { sceneId: "forest_test", preset: "godot" });
    const tscn = await readFile(path.join(res.dir, "forest_test.tscn"), "utf8");
    const refs = [...tscn.matchAll(/path="res:\/\/([^"]+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(5);
    expect(new Set(refs).size).toBe(refs.length); // each file referenced once
    expect(refs).toContain("camera_pan.gd");
    for (const r of refs) await expect(access(path.join(res.dir, r)), r).resolves.toBeUndefined();
    expect(tscn).toMatch(/type="Parallax2D"/);
    expect(tscn.match(/type="Parallax2D"/g)).toHaveLength(4);
    expect(tscn).toMatch(/scroll_scale = Vector2\(0\.2, 1\)/);
    expect(tscn).toMatch(/repeat_size = Vector2\(480, 0\)/);
    expect(tscn).toMatch(/type="TileMapLayer"/);
    expect(tscn).toMatch(/one_way_collision = true/);
    expect(tscn).toMatch(/flip_h = true/);
    // load_steps = ext + sub resources + 1
    const ext = (tscn.match(/^\[ext_resource/gm) ?? []).length;
    const sub = (tscn.match(/^\[sub_resource/gm) ?? []).length;
    expect(tscn).toContain(`load_steps=${ext + sub + 1}`);

    const tres = await readFile(path.join(res.dir, "forest_test_tileset.tres"), "utf8");
    expect(tres).toMatch(/texture_region_size = Vector2i\(16, 16\)/);
    expect(tres).toMatch(/physics_layer_0\/collision_layer = 1/);
    expect(tres).toMatch(/0:4\/0\/physics_layer_0\/polygon_0\/one_way = true/);
    expect(tres).toMatch(/0:5\/0\/physics_layer_0\/polygon_0\/points = PackedVector2Array\(-8, 8, 8, -8, 8, 8\)/);
    const project = await readFile(path.join(res.dir, "project.godot"), "utf8");
    expect(project).toMatch(/default_texture_filter=0/);
    expect(project).toContain('run/main_scene="res://forest_test.tscn"');
  });

  it("encodes tile_map_data as format-0 cells that decode back to the autotile result", async () => {
    const doc = await loadScene(root, "forest_test");
    const bytes = encodeTileMapData(doc);
    const cells = decodeTileMapData(bytes);
    const expected = doc.tiles.join("").replace(/\./g, "").length;
    expect(bytes.length).toBe(2 + expected * 12);
    expect(cells).toHaveLength(expected);
    for (const c of cells.slice(0, 50)) {
      const t = resolveTile(doc.tiles, c.x, c.y)!;
      expect(c.atlas).toEqual([t.col, t.row]);
    }
  });

  it("can emit legacy ParallaxBackground nodes", async () => {
    const res = await exportScene(root, { sceneId: "forest_test", preset: "godot", baseName: "legacy", godot: { parallax: "legacy" } });
    const tscn = await readFile(path.join(res.dir, "legacy.tscn"), "utf8");
    expect(tscn).toMatch(/type="ParallaxBackground"/);
    expect(tscn).toMatch(/motion_mirroring = Vector2\(480, 0\)/);
    expect(tscn).not.toMatch(/Parallax2D/);
  });
});

describe("pixi export", () => {
  it("writes a JSON whose images exist and whose tile data matches the grid", async () => {
    const res = await exportScene(root, { sceneId: "forest_test", preset: "pixi" });
    const json = JSON.parse(await readFile(path.join(res.dir, "forest_test.pixi.json"), "utf8"));
    expect(json.scaleMode).toBe("nearest");
    expect(json.layers).toHaveLength(4);
    expect(json.layers[1].scrollFactor).toEqual({ x: 0.2, y: 1 });
    expect(json.tilemap.data).toHaveLength(40 * 17);
    expect(json.tilemap.data.filter((n: number) => n >= 0).length).toBe(json.tilemap.codes.join("").replace(/\./g, "").length);
    for (const img of [json.tileset.image, ...json.layers.map((l: { image: string }) => l.image), ...json.props.map((p: { image: string }) => p.image)]) {
      await expect(access(path.join(res.dir, img)), img).resolves.toBeUndefined();
    }
    expect(json.collision.oneWay.some((r: { x: number }) => r.x === 500)).toBe(true);
    expect(json.collision.solid.some((r: { w: number; h: number }) => r.w === 20 && r.h === 10)).toBe(true); // rock box
    expect(json.collision.slopes.length).toBe(4);
  });
});

describe("safety", () => {
  it("rejects path-like ids and folders outside allowed roots", async () => {
    await expect(exportScene(root, { sceneId: "../../etc/passwd" })).rejects.toThrow(/Invalid scene id/);
    await expect(exportScene(root, { sceneId: "forest_test", dir: "/tmp/elsewhere-easyscene" })).rejects.toThrow(/Folder not allowed/);
  });
});
