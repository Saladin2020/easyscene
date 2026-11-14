import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RgbaImage } from "../shared/raster.js";
import {
  DEFAULT_CHARACTER_X,
  characterLabel,
  defaultLayout,
  detectGroundRow,
  facingRow,
  frameColumn,
  layoutFromMeta,
  stillColumn,
  type SheetLayout,
} from "../shared/characters.js";
import { DEFAULT_GROUND_ROW, type CharacterSprite, type SceneAssets } from "../shared/render.js";
import { composeScene, normalizeScene, type ComposeSceneInput } from "../shared/scene.js";
import { DEFAULT_CONFIG, type PartMeta, type SceneCharacter, type SceneDoc } from "../shared/types.js";
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

/** Legacy single preview sprite: idle, facing right, sole row detected from the sheet. */
export function characterSprite(sheet: RgbaImage, x: number): CharacterSprite {
  return { sheet, x, col: 0, row: 0, frameSize: 48, groundRow: detectGroundRow(sheet, 48, 0, 0) ?? DEFAULT_GROUND_ROW };
}

/** Sheet layout from the sibling Easy Sprite export JSON (`hero.png` → `hero.json`), else side-view defaults. */
export async function loadSheetLayout(file: string, img: RgbaImage): Promise<SheetLayout> {
  const json = file.replace(/\.png$/i, ".json");
  try {
    const layout = layoutFromMeta(JSON.parse(await readFile(json, "utf8")));
    if (layout) return layout;
  } catch {
    // no export JSON next to the sheet: fall through
  }
  return defaultLayout(img);
}

export interface ResolvedCharacter {
  index: number;
  spec: SceneCharacter;
  /** Unique, file-name-safe label. */
  label: string;
  file: string;
  image: RgbaImage;
  layout: SheetLayout;
  groundRow: number;
  /** Still sprite for PNG previews. */
  sprite: CharacterSprite;
}

/**
 * Load every character's sheet and work out rows, columns and sole row. Bad sheets are skipped with a
 * warning so one wrong path never blocks an export.
 */
export async function resolveCharacters(
  root: string,
  list: readonly SceneCharacter[],
  opts: { trusted?: boolean; fallbackGroundRow?: number } = {},
): Promise<{ characters: ResolvedCharacter[]; warnings: string[] }> {
  const characters: ResolvedCharacter[] = [];
  const warnings: string[] = [];
  const used = new Map<string, number>();
  for (const [index, spec] of list.entries()) {
    try {
      const image = await loadCharacterSheet(root, spec.sheet, { trusted: opts.trusted });
      const file = resolvePath(root, spec.sheet, spec.sheet);
      const layout = await loadSheetLayout(file, image);
      const fs = layout.frameSize;
      const { row, flipX } = facingRow(layout, spec.facing ?? "right");
      const groundRow =
        spec.groundRow ??
        detectGroundRow(image, fs, frameColumn(layout, "idle", 0), row) ??
        opts.fallbackGroundRow ??
        DEFAULT_CONFIG.character.groundRow;
      let label = characterLabel(spec, index);
      const n = (used.get(label) ?? 0) + 1;
      used.set(label, n);
      if (n > 1) label = `${label}_${n}`;
      characters.push({
        index,
        spec,
        label,
        file,
        image,
        layout,
        groundRow,
        sprite: {
          sheet: image,
          x: spec.x ?? DEFAULT_CHARACTER_X,
          ...(typeof spec.y === "number" ? { y: spec.y } : {}),
          col: stillColumn(layout, spec),
          row,
          flipX,
          frameSize: fs,
          groundRow,
          layer: spec.layer ?? "main",
        },
      });
    } catch (e) {
      warnings.push(`Character ${index} (${spec.sheet}) skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { characters, warnings };
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
