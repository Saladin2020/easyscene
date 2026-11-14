import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeAndSave, resolveCharacters } from "../src/lib/compose.js";
import { exportScene } from "../src/lib/export.js";
import { decodePng, encodePng } from "../src/lib/png.js";
import { loadScene } from "../src/lib/workspace.js";
import {
  defaultLayout,
  detectGroundRow,
  facingRow,
  normalizeCharacters,
  parseCharacterArg,
  sceneCharacters,
  stillColumn,
  walkColumns,
} from "../src/shared/characters.js";
import { createImage, type RgbaImage } from "../src/shared/raster.js";
import { renderScene } from "../src/shared/render.js";
import { loadAssets } from "../src/lib/compose.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let sheetA: string;
let sheetB: string;

/** Fake Easy Sprite side sheet: 30×3 frames, a 10×20 body whose soles end at `sole`. Row r is tinted r-wise; col c encodes c in blue. */
function fakeSheet(sole: number, color: [number, number, number]): RgbaImage {
  const img = createImage(48 * 30, 48 * 3);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 30; col++) {
      for (let y = sole - 19; y <= sole; y++) {
        for (let x = 19; x < 29; x++) {
          const i = ((row * 48 + y) * img.width + col * 48 + x) * 4;
          img.data[i] = color[0];
          img.data[i + 1] = color[1] + row * 40;
          img.data[i + 2] = col * 8;
          img.data[i + 3] = 255;
        }
      }
    }
  }
  return img;
}

beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const dir = path.join(root, "sheets");
  await mkdir(dir, { recursive: true });
  sheetA = path.join(dir, "walker_a.png");
  sheetB = path.join(dir, "walker_b.png");
  await writeFile(sheetA, encodePng(fakeSheet(47, [200, 20, 0])));
  await writeFile(sheetB, encodePng(fakeSheet(44, [20, 20, 0])));
  // B ships an Easy Sprite export JSON with its own frame order (walk frames first)
  await writeFile(
    path.join(dir, "walker_b.json"),
    JSON.stringify({ format: "easysprite.native", view: "side", frameSize: 48, directions: ["right", "left", "front"], frames: ["walk0", "walk1", "walk2", "idle"] }),
  );
});
afterAll(() => cleanup());

describe("character helpers", () => {
  it("parses path[:x[:facing[:anim[:frame]]]]", () => {
    expect(parseCharacterArg("a.png")).toEqual({ sheet: "a.png" });
    expect(parseCharacterArg("a.png:120:left:walk:walk2")).toEqual({ sheet: "a.png", x: 120, facing: "left", anim: "walk", frame: "walk2" });
    expect(parseCharacterArg("a.png::front")).toEqual({ sheet: "a.png", facing: "front" });
    expect(parseCharacterArg("a.png:8:right:idle:10")).toEqual({ sheet: "a.png", x: 8, facing: "right", anim: "idle", frame: 10 });
    expect(parseCharacterArg("C:\\sprites\\hero.png:40")).toEqual({ sheet: "C:\\sprites\\hero.png", x: 40 });
    expect(() => parseCharacterArg("a.png:x")).toThrow(/number/);
    expect(() => parseCharacterArg("a.png:1:up")).toThrow(/facing/);
    expect(() => parseCharacterArg("a.png:1:left:run")).toThrow(/anim/);
  });

  it("normalizes a character list and drops bad entries with warnings", () => {
    const { characters, warnings } = normalizeCharacters([
      { sheet: " a.png ", x: 10.6, facing: "left", anim: "walk", patrol: { minX: 90, maxX: 10, speed: 20 }, extra: 1 },
      { x: 3 },
      { sheet: "b.png", facing: "up", layer: "sky" },
    ]);
    expect(characters).toEqual([
      { sheet: "a.png", x: 11, facing: "left", anim: "walk", patrol: { minX: 10, maxX: 90, speed: 20 } },
      { sheet: "b.png" },
    ]);
    expect(warnings.join("\n")).toMatch(/no sheet/);
    expect(warnings.join("\n")).toMatch(/facing "up"/);
    expect(warnings.join("\n")).toMatch(/layer "sky"/);
  });

  it("detects the sole row and maps frames / facings", () => {
    expect(detectGroundRow(fakeSheet(47, [1, 1, 1]))).toBe(47);
    expect(detectGroundRow(fakeSheet(44, [1, 1, 1]), 48, 3, 2)).toBe(44);
    expect(detectGroundRow(createImage(48, 48))).toBeUndefined();
    const side = defaultLayout({ width: 1440, height: 144 });
    expect(side.directions).toEqual(["right", "left", "front"]);
    expect(walkColumns(side)).toEqual([1, 2, 3, 2]);
    expect(stillColumn(side, { anim: "walk" })).toBe(1);
    expect(stillColumn(side, { frame: "sit" })).toBe(28);
    expect(facingRow({ ...side, directions: ["right"] }, "left")).toEqual({ row: 0, flipX: true });
  });

  it("lists the legacy character first, then characters", () => {
    expect(sceneCharacters({ character: { sheet: "old.png", x: 5 }, characters: [{ sheet: "new.png" }] })).toEqual([
      { sheet: "old.png", x: 5 },
      { sheet: "new.png" },
    ]);
  });
});

describe("scenes with several characters", () => {
  it("keeps the legacy single `character` untouched and adds `characters`", async () => {
    const legacy = await composeAndSave(root, { id: "legacy_one", width: 30, character: { sheet: sheetA, x: 40 } });
    expect(legacy.scene.character).toEqual({ sheet: sheetA, x: 40 });
    expect(legacy.scene.characters).toBeUndefined();
    expect(legacy.scene.format).toBe("easyscene/1");

    const res = await composeAndSave(root, {
      id: "cast_test",
      width: 30,
      terrain: { groundHeight: 3 },
      characters: [
        { sheet: sheetA, x: 32, facing: "right", anim: "walk", patrol: { minX: 16, maxX: 120, speed: 30 } },
        { sheet: sheetB, x: 200, facing: "left", frame: "idle", layer: "front" },
      ],
    });
    expect(res.scene.characters).toHaveLength(2);
    const back = await loadScene(root, "cast_test");
    expect(back.characters?.[1]).toEqual({ sheet: sheetB, x: 200, facing: "left", frame: "idle", layer: "front" });
  });

  it("stands every character's soles on the ground (detected sole row, sheet JSON frames)", async () => {
    const doc = await loadScene(root, "cast_test");
    const { characters, warnings } = await resolveCharacters(root, sceneCharacters(doc));
    expect(warnings).toEqual([]);
    expect(characters.map((c) => c.groundRow)).toEqual([47, 44]);
    // B's JSON puts idle at column 3
    expect(characters[1]!.sprite.col).toBe(3);
    expect(characters[1]!.sprite.row).toBe(1);

    const assets = await loadAssets(root, doc);
    const img = renderScene(doc, assets, { characters: characters.map((c) => c.sprite) });
    const surface = (17 - 3) * 16; // groundHeight 3 on a 17-row map
    const px = (x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
    // A: soles (row 47) on the row right above the surface, nothing below
    expect(px(32 + 24, surface - 1)[0]).toBe(200);
    expect(px(32 + 24, surface - 20)[0]).toBe(200);
    // B: its sole row 44 lands on the surface too (not floating 3px)
    expect(px(200 + 24, surface - 1).slice(0, 2)).toEqual([20, 60]);
  });

  it("exports characters to png, pixi and godot", async () => {
    const png = await exportScene(root, { sceneId: "cast_test", preset: "png" });
    expect(png.warnings).toEqual([]);
    const sceneJson = JSON.parse(await readFile(png.paths.find((p) => p.endsWith(".scene.json"))!, "utf8"));
    expect(sceneJson.characters).toHaveLength(2);

    const pixi = await exportScene(root, { sceneId: "cast_test", preset: "pixi" });
    const pj = JSON.parse(await readFile(pixi.paths.find((p) => p.endsWith(".pixi.json"))!, "utf8"));
    expect(pj.characters.map((c: { name: string }) => c.name)).toEqual(["walker_a", "walker_b"]);
    expect(pj.characters[0]).toMatchObject({ image: "characters/walker_a.png", groundRow: 47, y: 224 - 48, anim: "walk", layer: "main", animations: { walk: [1, 2, 3, 2] }, patrol: { minX: 16, maxX: 120, speed: 30 } });
    expect(pj.characters[1]).toMatchObject({ groundRow: 44, y: 224 - 45, facing: "left", layer: "front", animations: { idle: [3], walk: [0, 1, 2, 1] } });
    const copied = decodePng(await readFile(path.join(pixi.dir, "characters/walker_a.png")));
    expect([copied.width, copied.height]).toEqual([1440, 144]);
    const loader = await readFile(path.join(pixi.dir, "load-scene.js"), "utf8");
    expect(loader).toMatch(/AnimatedSprite/);
    expect(loader).toMatch(/function update\(dt\)/);

    const godot = await exportScene(root, { sceneId: "cast_test", preset: "godot" });
    const tscn = await readFile(godot.paths.find((p) => p.endsWith(".tscn"))!, "utf8");
    expect(tscn).toMatch(/\[node name="C0_walker_a" type="AnimatedSprite2D" parent="Characters"\]/);
    expect(tscn).toMatch(/\[node name="C1_walker_b" type="AnimatedSprite2D" parent="CharactersFront"\]/);
    expect(tscn).toMatch(/"name": &"walk_right"/);
    expect(tscn).toMatch(/autoplay = "walk_right"/);
    expect(tscn).toMatch(/autoplay = "idle_left"/);
    expect(tscn).toMatch(/script = ExtResource\("\d+_character_patrol"\)/);
    expect(tscn).toMatch(/min_x = 16\nmax_x = 120\nspeed = 30/);
    expect(tscn).toMatch(/position = Vector2\(32, 176\)/);
    const steps = Number(/load_steps=(\d+)/.exec(tscn)![1]);
    const declared = (tscn.match(/^\[(ext_resource|sub_resource) /gm) ?? []).length;
    expect(steps).toBe(declared + 1);
    expect(godot.paths.some((p) => p.endsWith("character_patrol.gd"))).toBe(true);
    expect(godot.paths.some((p) => p.endsWith(path.join("assets", "characters", "walker_b.png")))).toBe(true);
  });

  it("export --character override replaces the scene cast (legacy single sheet still works)", async () => {
    const res = await exportScene(root, { sceneId: "cast_test", preset: "pixi", dir: "exports/override", character: sheetB });
    const pj = JSON.parse(await readFile(res.paths.find((p) => p.endsWith(".pixi.json"))!, "utf8"));
    expect(pj.characters).toHaveLength(1);
    expect(pj.characters[0]).toMatchObject({ name: "walker_b", x: 96 });
  });

  it("skips a missing sheet with a warning instead of failing the export", async () => {
    await composeAndSave(root, { id: "cast_missing", width: 20, characters: [{ sheet: path.join(root, "nope.png") }, { sheet: sheetA }] });
    const res = await exportScene(root, { sceneId: "cast_missing", preset: "pixi" });
    expect(res.warnings.join("\n")).toMatch(/nope\.png/);
    const pj = JSON.parse(await readFile(res.paths.find((p) => p.endsWith(".pixi.json"))!, "utf8"));
    expect(pj.characters).toHaveLength(1);
  });
});
