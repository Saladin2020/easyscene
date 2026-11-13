/**
 * Thai town previews: the demo street (full + 3× + viewport crops), a parallax strip and a
 * labeled catalog of every prop, from a fresh sample workspace.
 *
 *   npx tsx scripts/render-catalog.ts [outDir] [--character <easysprite side-view sheet.png>]
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { characterSprite, loadAssets, loadCharacterSheet } from "../src/lib/compose.js";
import { writePng } from "../src/lib/png.js";
import { initWorkspace, loadParts, loadScene } from "../src/lib/workspace.js";
import { createImage, type RgbaImage } from "../src/shared/raster.js";
import { renderParallaxStrip, renderScene } from "../src/shared/render.js";
import { PROP_CATEGORIES, propCategory, type PropPart } from "../src/shared/types.js";
import { renderCatalog, upscale } from "./catalog.js";

const args = process.argv.slice(2);
const ci = args.indexOf("--character");
const characterArg = ci >= 0 ? args.splice(ci, 2)[1] : undefined;
const outDir = path.resolve(args[0] ?? "thai-town-preview");
const sheetPath = path.resolve(characterArg ?? "../easysprite/docs/assets/sheet-side-pier-kid.png");

function crop(img: RgbaImage, x0: number, w: number): RgbaImage {
  const out = createImage(w, img.height);
  for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x0 + w) * 4), y * w * 4);
  return out;
}

const root = await mkdtemp(path.join(os.tmpdir(), "easyscene-catalog-"));
try {
  await initWorkspace(root);
  await mkdir(outDir, { recursive: true });
  const sheet = existsSync(sheetPath) ? await loadCharacterSheet(root, sheetPath, { trusted: true }) : undefined;
  if (!sheet) console.warn(`No character sheet at ${sheetPath}; rendering without a walker.`);

  const doc = await loadScene(root, "thai_village_street");
  const assets = await loadAssets(root, doc);
  const street = renderScene(doc, assets, { character: sheet && characterSprite(sheet, 560) });
  await writePng(path.join(outDir, "thai-village-street.png"), street);
  await writePng(path.join(outDir, "thai-village-street@3x.png"), upscale(street, 3));
  const vw = doc.viewport.width;
  for (const [i, x0] of [0, 400, street.width - vw].entries()) await writePng(path.join(outDir, `thai-village-street-view${i + 1}@3x.png`), upscale(crop(street, x0, vw), 3));
  await writePng(path.join(outDir, "thai-village-street-parallax.png"), renderParallaxStrip(doc, assets, 3, sheet && characterSprite(sheet, 0)));

  const parts = await loadParts(root);
  const props = parts.filter((p): p is PropPart => p.kind === "prop");
  const ordered = PROP_CATEGORIES.flatMap((c) => props.filter((p) => propCategory(p) === c));
  const catalog = await renderCatalog(root, ordered, { maxWidth: 1000, title: "easy scene props - building street nature water decor" });
  await writePng(path.join(outDir, "thai-town-catalog.png"), catalog);
  await writePng(path.join(outDir, "thai-town-catalog@2x.png"), upscale(catalog, 2));
  const tiles = parts.filter((p) => p.id === "tiles_street" || p.id === "bg_far_temple_hill" || p.id === "bg_mid_tropical");
  await writePng(path.join(outDir, "thai-town-backgrounds.png"), await renderCatalog(root, tiles, { maxWidth: 1000 }));
  console.log(`Wrote Thai town previews to ${outDir}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
