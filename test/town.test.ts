import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportScene } from "../src/lib/export.js";
import { readPng } from "../src/lib/png.js";
import { partDir } from "../src/lib/sampleParts.js";
import { THAI_SIGNS } from "../src/lib/thaiSignText.js";
import { initWorkspace, loadParts, loadScene, partImagePath } from "../src/lib/workspace.js";
import { applyColor, type RgbaImage } from "../src/shared/raster.js";
import { composeScene, layoutStreet, snapBuildingX } from "../src/shared/scene.js";
import { surfaceY } from "../src/shared/tiles.js";
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

const TOWN_BUILDINGS = [
  "prop_bld_noodle_shop", "prop_bld_mini_mart", "prop_bld_fruit_stall", "prop_bld_shophouse_2f",
  "prop_bld_shophouse_2f_closed", "prop_bld_shophouse_3f", "prop_bld_shophouse_3f_gold", "prop_bld_thai_house",
];
const alpha = (img: RgbaImage, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;
const props = () => parts.filter((p): p is PropPart => p.kind === "prop");

describe("thai town buildings", () => {
  it("ships every building as a back-layer `building` prop on the 16 px grid", () => {
    const byId = new Map(parts.map((p) => [p.id, p]));
    for (const id of TOWN_BUILDINGS) {
      const p = byId.get(id);
      expect(p, id).toBeDefined();
      expect(p!.kind).toBe("prop");
      expect(propCategory(p as PropPart), id).toBe("building");
      expect((p as PropPart).defaultLayer).toBe("back");
    }
    for (const p of props().filter((p) => propCategory(p) === "building")) expect(p.width % 16, `${p.id} width ${p.width}`).toBe(0);
  });

  it("reads at 48 px character scale: shops 96–160 px wide, shophouses 140–200 px tall", () => {
    const byId = new Map(props().map((p) => [p.id, p]));
    for (const id of ["prop_bld_noodle_shop", "prop_bld_mini_mart", "prop_bld_fruit_stall"]) {
      expect(byId.get(id)!.width).toBeGreaterThanOrEqual(96);
      expect(byId.get(id)!.width).toBeLessThanOrEqual(160);
    }
    for (const p of props().filter((p) => p.id.startsWith("prop_bld_shophouse"))) {
      expect(p.height, p.id).toBeGreaterThanOrEqual(140);
      expect(p.height, p.id).toBeLessThanOrEqual(200);
      expect(p.width).toBe(112);
    }
  });

  it("stands on its baseline and reaches both footprint edges, so neighbours touch without a gap", async () => {
    for (const id of TOWN_BUILDINGS) {
      const meta = parts.find((p) => p.id === id)!;
      const img = await readPng(partImagePath(root, meta));
      const bottom = img.height - 1;
      let ground = 0;
      for (let x = 0; x < img.width; x++) if (alpha(img, x, bottom)) ground++;
      expect(ground, `${id} touches the ground`).toBeGreaterThan(0);
      let spansRow = -1;
      for (let y = 0; y < img.height && spansRow < 0; y++) {
        let solid = true;
        for (let x = 0; x < img.width && solid; x++) solid = alpha(img, x, y) === 255;
        if (solid) spansRow = y;
      }
      expect(spansRow, `${id} has a solid row from edge to edge`).toBeGreaterThanOrEqual(0);
    }
  });

  it("recolors as one: `color` moves the facade hue of a shophouse", async () => {
    const meta = parts.find((p) => p.id === "prop_bld_shophouse_2f")!;
    const img = await readPng(partImagePath(root, meta));
    const out = applyColor(img, { recolorBase: meta.recolorBase, color: "#d070a0" });
    let changed = 0;
    let opaque = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (!img.data[i + 3]) continue;
      opaque++;
      if (img.data[i] !== out.data[i] || img.data[i + 2] !== out.data[i + 2]) changed++;
    }
    expect(changed / opaque).toBeGreaterThan(0.2);
  });
});

describe("street layout", () => {
  it("chains items edge to edge from a grid-snapped x and skips unknown ids", () => {
    const res = layoutStreet(parts, { x: 37, items: ["prop_bld_noodle_shop", "nope", { part: "prop_bld_mini_mart", flipX: true }, "prop_bld_shophouse_3f"] });
    expect(res.warnings.some((w) => w.includes("nope"))).toBe(true);
    expect(res.props.map((p) => [p.part, p.x])).toEqual([
      ["prop_bld_noodle_shop", 32],
      ["prop_bld_mini_mart", 32 + 128],
      ["prop_bld_shophouse_3f", 32 + 128 + 144],
    ]);
    expect(res.props[1]!.flipX).toBe(true);
    expect(res.endX).toBe(32 + 128 + 144 + 112);
    const gapped = layoutStreet(parts, { gap: 16, items: ["prop_bld_noodle_shop", { part: "prop_bld_noodle_shop", gapBefore: 32 }] });
    expect(gapped.props.map((p) => p.x)).toEqual([0, 128 + 16 + 32]);
  });

  it("composeScene expands streets into plain props behind the loose props", () => {
    const { scene, warnings } = composeScene(parts, {
      id: "t",
      width: 40,
      tileset: "tiles_street",
      streets: [{ items: ["prop_bld_shophouse_2f", "prop_bld_shophouse_3f"] }],
      props: [{ part: "prop_cat", x: 20 }],
    });
    expect(warnings).toEqual([]);
    expect(scene.props.map((p) => p.part)).toEqual(["prop_bld_shophouse_2f", "prop_bld_shophouse_3f", "prop_cat"]);
    expect(scene.props[1]!.x).toBe(112);
    expect(JSON.stringify(scene)).not.toContain("streets"); // saved format stays easyscene/1 props
  });

  it("editor snapping glues buildings to neighbours, else to the grid, and leaves other props alone", () => {
    const shop = { kind: "prop" as const, width: 128, category: "building" };
    const n = [{ x: 0, width: 112 }];
    expect(snapBuildingX(shop, 117, 16, n)).toBe(112); // right of the neighbour
    expect(snapBuildingX(shop, 300, 16, n)).toBe(304); // grid
    expect(snapBuildingX({ kind: "prop", width: 20 }, 117.4, 16, n)).toBe(117);
  });
});

describe("power poles chain", () => {
  it("wires leave both edges at the same rows; the end pole has none on the right", async () => {
    const wireRows = (img: RgbaImage, x: number) => Array.from({ length: img.height }, (_, y) => y).filter((y) => alpha(img, x, y) === 255);
    const pole = await readPng(partImagePath(root, parts.find((p) => p.id === "prop_power_pole")!));
    const left = wireRows(pole, 0);
    expect(left.length).toBeGreaterThanOrEqual(4);
    expect(wireRows(pole, pole.width - 1)).toEqual(left);
    const end = await readPng(partImagePath(root, parts.find((p) => p.id === "prop_power_pole_end")!));
    expect(wireRows(end, 0)).toEqual(left);
    expect(wireRows(end, end.width - 1)).toEqual([]);
  });
});

describe("thai_village_street demo", () => {
  it("is seeded, uses existing parts, and lines its buildings up on the ground and the grid", async () => {
    const doc = await loadScene(root, "thai_village_street");
    const ids = new Set(parts.map((p) => p.id));
    for (const id of [doc.tileset, ...doc.layers.map((l) => l.part), ...doc.props.map((p) => p.part)]) expect(ids.has(id), id).toBe(true);
    const byId = new Map(props().map((p) => [p.id, p]));
    const buildings = doc.props.filter((p) => byId.get(p.part)?.category === "building");
    expect(buildings.length).toBeGreaterThanOrEqual(8);
    const ground = surfaceY(doc.tiles, 2, doc.tileSize);
    let prevEnd = buildings[0]!.x;
    for (const b of buildings) {
      expect(b.x % 16, b.part).toBe(0);
      expect(b.y, `${b.part} baseline`).toBe(ground);
      expect(b.x, `${b.part} touches the previous building`).toBe(prevEnd);
      prevEnd = b.x + byId.get(b.part)!.width;
    }
    expect(doc.tiles.some((row) => row.includes("."))).toBe(true);
    // the canal: an open pit to the map edge with the pier over its bank
    const pier = doc.props.find((p) => p.part === "prop_pier")!;
    expect(surfaceY(doc.tiles, Math.floor((pier.x + 32) / 16), 16)).toBe(doc.height * 16);
  });

  it("exports a Godot scene whose resources all exist (props, pier collision)", async () => {
    const res = await exportScene(root, { sceneId: "thai_village_street", preset: "godot" });
    const tscn = await readFile(path.join(res.dir, "thai_village_street.tscn"), "utf8");
    const refs = [...tscn.matchAll(/path="res:\/\/([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(refs).size).toBe(refs.length);
    for (const r of refs) await expect(access(path.join(res.dir, r)), r).resolves.toBeUndefined();
    const doc = await loadScene(root, "thai_village_street");
    expect((tscn.match(/^\[node name="P\d+_[^"]*" type="Sprite2D"/gm) ?? []).length).toBe(doc.props.length);
    expect(tscn).toMatch(/flip_h = true/); // flipped end-of-line pole
    expect(tscn).toMatch(/size = Vector2\(64, 6\)/); // pier deck collision
    const ext = (tscn.match(/^\[ext_resource/gm) ?? []).length;
    const sub = (tscn.match(/^\[sub_resource/gm) ?? []).length;
    expect(tscn).toContain(`load_steps=${ext + sub + 1}`);
  });

  it("exports Pixi JSON whose prop images exist", async () => {
    const res = await exportScene(root, { sceneId: "thai_village_street", preset: "pixi" });
    const json = JSON.parse(await readFile(path.join(res.dir, "thai_village_street.pixi.json"), "utf8"));
    expect(json.props.length).toBeGreaterThanOrEqual(20);
    for (const p of json.props as Array<{ image: string }>) await expect(access(path.join(res.dir, p.image)), p.image).resolves.toBeUndefined();
  });
});

describe("thai sign bitmaps", () => {
  it("are well-formed 1-bit rows", () => {
    for (const [key, s] of Object.entries(THAI_SIGNS)) {
      expect(s.rows, key).toHaveLength(s.height);
      for (const r of s.rows) expect(r, key).toMatch(new RegExp(`^[#.]{${s.width}}$`));
      expect(s.rows.join("").includes("#"), key).toBe(true);
    }
  });
});

describe("workspace upgrade", () => {
  it("adds sample parts that are missing without touching existing part folders", async () => {
    const { root: r2, cleanup: c2 } = await tempWorkspace();
    try {
      const catDir = partDir(r2, { kind: "prop", id: "prop_cat" });
      await rm(catDir, { recursive: true, force: true });
      const signJson = path.join(partDir(r2, { kind: "prop", id: "prop_sign" }), "part.json");
      const edited = { ...JSON.parse(await readFile(signJson, "utf8")), name: "My edited sign" };
      await writeFile(signJson, JSON.stringify(edited));
      await initWorkspace(r2);
      await expect(access(path.join(catDir, "prop.png"))).resolves.toBeUndefined();
      expect(JSON.parse(await readFile(signJson, "utf8")).name).toBe("My edited sign");
    } finally {
      await c2();
    }
  });
});
