import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RgbaImage } from "../shared/raster.js";
import type { CharacterSprite, SceneAssets } from "../shared/render.js";
import { composeScene, normalizeScene, type ComposeSceneInput } from "../shared/scene.js";
import type { PartMeta, SceneDoc } from "../shared/types.js";
import { decodePng, isPng } from "./png.js";
import { assertSafeId, isAllowedPath, loadConfig, loadParts, partImagePath, resolvePath, saveScene } from "./workspace.js";

const imageCache = new Map<string, { mtime: number; img: RgbaImage }>();

export function clearImageCache(): void {
  imageCache.clear();
}

async function loadImage(file: string): Promise<RgbaImage> {
  const { stat } = await import("node:fs/promises");
  const st = await stat(file);
  const hit = imageCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.img;
  const img = decodePng(await readFile(file));
  imageCache.set(file, { mtime: st.mtimeMs, img });
  return img;
}

/** Decode every part image the scene references. */
export async function loadAssets(root: string, doc: SceneDoc, parts?: PartMeta[]): Promise<SceneAssets & { parts: PartMeta[] }> {
  const catalog = parts ?? (await loadParts(root));
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const ids = new Set([...doc.layers.map((l) => l.part), doc.tileset, ...doc.props.map((p) => p.part)]);
  const images = new Map<string, RgbaImage>();
  for (const id of ids) {
    const meta = byId.get(id);
    if (meta) images.set(id, await loadImage(partImagePath(root, meta)));
  }
  return { parts: catalog, meta: (id) => byId.get(id), image: (id) => images.get(id) };
}

/**
 * Load an Easy Sprite side-view sheet (30×48 columns, rows right/left/front) for previews.
 * `trusted` (CLI) may read any path; server/MCP callers must stay inside allowed roots.
 */
export async function loadCharacterSheet(root: string, sheet: string, opts: { trusted?: boolean } = {}): Promise<RgbaImage> {
  const file = resolvePath(root, sheet, sheet);
  if (!opts.trusted && !isAllowedPath(root, file)) {
    throw new Error(`Character sheet not allowed: ${file}. Put it in the workspace or EASYSCENE_ALLOWED_DIRS.`);
  }
  if (path.extname(file).toLowerCase() !== ".png") throw new Error("Character sheet must be a .png");
  const buf = await readFile(file);
  if (!isPng(buf)) throw new Error("Character sheet is not PNG data");
  const img = decodePng(buf);
  if (img.width % 48 !== 0 || img.height < 48) throw new Error(`Character sheet ${img.width}x${img.height} is not a 48px frame grid`);
  return img;
}

export function characterSprite(sheet: RgbaImage, x: number): CharacterSprite {
  return { sheet, x, col: 0, row: 0, frameSize: 48, groundRow: 44 };
}

export async function composeAndSave(
  root: string,
  input: ComposeSceneInput,
  dir?: string,
): Promise<{ scene: SceneDoc; path: string; warnings: string[] }> {
  assertSafeId(input.id);
  const [parts, config] = await Promise.all([loadParts(root), loadConfig(root)]);
  const { scene, warnings } = composeScene(parts, input, config);
  const saved = await saveScene(root, scene, dir);
  return { scene: saved.scene, path: saved.path, warnings };
}

/** Validate a full SceneDoc (from the UI) and save it. */
export async function saveSceneDoc(root: string, doc: SceneDoc, dir?: string) {
  assertSafeId(doc.id);
  const [parts, config] = await Promise.all([loadParts(root), loadConfig(root)]);
  const { scene, warnings } = normalizeScene(parts, doc, config);
  const saved = await saveScene(root, { ...scene, createdAt: doc.createdAt }, dir);
  return { scene: saved.scene, path: saved.path, warnings };
}
