/**
 * Re-render the README art in docs/assets from a fresh sample workspace.
 *
 *   npx tsx scripts/render-docs.ts [outDir] [--character <easysprite side-view sheet.png>]
 *
 * Defaults: docs/assets, character ../easysprite/docs/assets/sheet-side-pier-kid.png when it exists.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { characterSprite, composeAndSave, loadAssets, loadCharacterSheet } from "../src/lib/compose.js";
import { writePng } from "../src/lib/png.js";
import { initWorkspace, loadParts, loadScene, partImagePath } from "../src/lib/workspace.js";
import { readPng } from "../src/lib/png.js";
import { createImage, type RgbaImage } from "../src/shared/raster.js";
import { renderParallaxStrip, renderScene } from "../src/shared/render.js";
import { PROP_CATEGORIES, propCategory, type PropPart } from "../src/shared/types.js";
import { renderCatalog } from "./catalog.js";

const args = process.argv.slice(2);
const ci = args.indexOf("--character");
const characterArg = ci >= 0 ? args.splice(ci, 2)[1] : undefined;
const outDir = path.resolve(args[0] ?? "docs/assets");
const sheetPath = path.resolve(characterArg ?? "../easysprite/docs/assets/sheet-side-pier-kid.png");

function upscale(img: RgbaImage, k: number): RgbaImage {
  const out = createImage(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

const root = await mkdtemp(path.join(os.tmpdir(), "easyscene-docs-"));
try {
  await initWorkspace(root);
  await mkdir(outDir, { recursive: true });
  const sheet = existsSync(sheetPath) ? await loadCharacterSheet(root, sheetPath, { trusted: true }) : undefined;
  if (!sheet) console.warn(`No character sheet at ${sheetPath}; rendering without a walker.`);

  await composeAndSave(root, {
    id: "forest_evening",
    name: "Forest evening",
    width: 72,
    layers: [
      { part: "bg_sky_dusk" },
      { part: "bg_far_clouds", tint: "#ff9a7a", tintAmount: 0.4 },
      { part: "bg_far_mountains", color: "#6a4f8a" },
      { part: "bg_mid_forest", tint: "#e08a8a", tintAmount: 0.35 },
      { part: "bg_near_bushes", tint: "#ff9a6a", tintAmount: 0.25 },
    ],
    terrain: { groundHeight: 3, hills: [{ x: 30, width: 6, height: 2 }], pits: [{ x: 46, width: 3 }], platforms: [{ x: 19, y: 3, length: 5 }, { x: 44, y: 3, length: 6 }] },
    props: [
      { part: "prop_tree_pine", x: 40 },
      { part: "prop_lantern", x: 120 },
      { part: "prop_house", x: 150 },
      { part: "prop_fence", x: 240 },
      { part: "prop_tree_oak", x: 330 },
      { part: "prop_sign", x: 420 },
      { part: "prop_tree_pine", x: 520, flipX: true },
      { part: "prop_rock", x: 640 },
      { part: "prop_tree_oak", x: 900 },
      { part: "prop_bush", x: 980, layer: "front" },
      { part: "prop_lantern", x: 1080 },
    ],
  });

  const forest = await loadScene(root, "forest_evening");
  const forestAssets = await loadAssets(root, forest);
  await writePng(path.join(outDir, "forest-evening.png"), renderScene(forest, forestAssets, { character: sheet && characterSprite(sheet, 96) }));
  await writePng(path.join(outDir, "forest-evening-parallax.png"), renderParallaxStrip(forest, forestAssets, 3, sheet && characterSprite(sheet, 0)));

  const village = await loadScene(root, "village_day");
  await writePng(path.join(outDir, "village-day.png"), renderScene(village, await loadAssets(root, village)));

  const night = await loadScene(root, "lantern_night");
  await writePng(path.join(outDir, "lantern-night.png"), renderScene(night, await loadAssets(root, night), { character: sheet && characterSprite(sheet, 300) }));

  const street = await loadScene(root, "thai_village_street");
  await writePng(path.join(outDir, "thai-village-street.png"), renderScene(street, await loadAssets(root, street), { character: sheet && characterSprite(sheet, 560) }));
  const townProps = (await loadParts(root)).filter((p): p is PropPart => p.kind === "prop");
  const ordered = PROP_CATEGORIES.flatMap((c) => townProps.filter((p) => propCategory(p) === c));
  await writePng(path.join(outDir, "thai-town-catalog.png"), await renderCatalog(root, ordered, { maxWidth: 1000 }));

  const grass = (await loadParts(root)).find((p) => p.id === "tiles_grass")!;
  await writePng(path.join(outDir, "tileset-grass.png"), upscale(await readPng(partImagePath(root, grass)), 4));
  console.log(`Wrote README art to ${outDir}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
