import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeAndSave } from "../src/lib/compose.js";
import { exportScene, godotPackedStringArray } from "../src/lib/export.js";
import { encodePng } from "../src/lib/png.js";
import { loadScene } from "../src/lib/workspace.js";
import {
  characterBaseline,
  characterList,
  characterRect,
  dragCharacter,
  hitCharacter,
  patchCharacter,
  removeCharacter,
  withCharacters,
} from "../src/shared/editorCharacters.js";
import { normalizeCharacters } from "../src/shared/characters.js";
import { createImage, type RgbaImage } from "../src/shared/raster.js";
import { characterTop } from "../src/shared/render.js";
import { surfaceY } from "../src/shared/tiles.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let sheetA: string;

function fakeSheet(): RgbaImage {
  const img = createImage(48 * 30, 48 * 3);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 30; col++) {
      for (let y = 28; y <= 47; y++) {
        for (let x = 16; x < 32; x++) {
          const i = ((row * 48 + y) * img.width + col * 48 + x) * 4;
          img.data[i] = 200;
          img.data[i + 1] = 20;
          img.data[i + 2] = 20;
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
  await writeFile(sheetA, encodePng(fakeSheet()));
  await composeAndSave(root, {
    id: "edit_cast",
    width: 40,
    height: 17,
    terrain: { groundHeight: 3, hills: [{ x: 16, width: 6, height: 2 }] },
    characters: [
      { sheet: sheetA, name: "ann", x: 32, facing: "right", anim: "idle" },
      { sheet: sheetA, name: "ben", x: 200, facing: "left", anim: "walk", patrol: { minX: 160, maxX: 400, speed: 24 } },
    ],
  });
});
afterAll(() => cleanup());

describe("editor character helpers", () => {
  it("hits, drags (x + terrain snap), patches and round-trips characters[]", async () => {
    const doc = await loadScene(root, "edit_cast");
    const list = characterList(doc);
    expect(list).toHaveLength(2);

    const a = characterRect(doc, list[0]!);
    expect(a.w).toBe(48);
    expect(a.h).toBe(48);
    expect(a.x).toBe(32);
    const ground = surfaceY(doc.tiles, Math.floor((32 + 24) / doc.tileSize), doc.tileSize);
    expect(a.y).toBe(ground - 48); // sole row 47 → top = base - 48

    expect(hitCharacter(doc, list, a.x + 10, a.y + 10)).toBe(0);
    expect(hitCharacter(doc, list, 8, 8)).toBeNull();

    const base = characterBaseline(doc, list[0]!);
    const moved = dragCharacter(list[0]!, 80 + 5, base + 3, { dx: 5, dy: 3 }, { free: false });
    expect(moved.x).toBe(80);
    expect(moved.y).toBeUndefined();
    const lifted = dragCharacter(list[0]!, 80 + 5, 100 + 3, { dx: 5, dy: 3 }, { free: true });
    expect(lifted).toMatchObject({ x: 80, y: 100 });

    const patched = patchCharacter(list, 0, { facing: "left", anim: "walk", groundRow: 47, patrol: { minX: 10, maxX: 90, speed: 20 } });
    const saved = withCharacters(doc, patched);
    expect(saved.character).toBeUndefined();
    expect(saved.characters?.[0]).toMatchObject({ name: "ann", facing: "left", anim: "walk", patrol: { minX: 10, maxX: 90, speed: 20 } });

    const { characters, warnings } = normalizeCharacters(JSON.parse(JSON.stringify(saved.characters)));
    expect(warnings).toEqual([]);
    expect(characters[0]).toMatchObject({ sheet: sheetA, name: "ann", facing: "left", anim: "walk", groundRow: 47, patrol: { minX: 10, maxX: 90, speed: 20 } });

    expect(removeCharacter(patched, 0).map((c) => c.name)).toEqual(["ben"]);
  });
});

describe("Godot patrol follows hills", () => {
  it("exports tile codes and a script whose Y matches PNG/Pixi surfaceY across a hill", async () => {
    const doc = await loadScene(root, "edit_cast");
    const godot = await exportScene(root, { sceneId: "edit_cast", preset: "godot", dir: "exports/hill_patrol" });
    const gd = await readFile(path.join(godot.dir, "character_patrol.gd"), "utf8");
    expect(gd).toMatch(/func _surface_y\(/);
    expect(gd).toMatch(/follow_terrain/);
    expect(gd).toMatch(/tile_codes/);

    const tscn = await readFile(godot.paths.find((p) => p.endsWith(".tscn"))!, "utf8");
    expect(tscn).toMatch(/tile_size = 16/);
    expect(tscn).toMatch(/frame_size = 48/);
    expect(tscn).toMatch(/ground_row = 47/);
    expect(tscn).toMatch(/follow_terrain = true/);
    expect(tscn).toContain(`tile_codes = ${godotPackedStringArray(doc.tiles)}`);
    // backslash slope codes survive the .tscn string
    expect(doc.tiles.some((r) => r.includes("\\"))).toBe(true);
    expect(godotPackedStringArray(doc.tiles)).toMatch(/\\\\/);

    const groundRow = 47;
    const flatX = 32;
    const hillX = 16 * 16 + 3 * 16; // on the plateau (hill starts at tile 16, slope 2, plateau from 18)
    const yFlat = characterTop(doc, { x: flatX, groundRow });
    const yHill = characterTop(doc, { x: hillX, groundRow });
    expect(yHill).toBeLessThan(yFlat);
    // formula the GDScript uses (same as characterTop / Pixi surfaceAt)
    const scriptTop = (x: number) => surfaceY(doc.tiles, Math.floor((x + 24) / doc.tileSize), doc.tileSize) - (groundRow + 1);
    expect(scriptTop(flatX)).toBe(yFlat);
    expect(scriptTop(hillX)).toBe(yHill);
    // walking from the flats onto the hill changes Y the way a still PNG would
    const steps = [flatX, 160, 240, 280, hillX].map((x) => scriptTop(x));
    expect(new Set(steps).size).toBeGreaterThan(1);
    expect(Math.min(...steps)).toBe(yHill);
    expect(Math.max(...steps)).toBe(yFlat);
  });
});
