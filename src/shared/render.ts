/**
 * Scene compositor. Pure: callers hand in decoded part images.
 * Draw order: parallax layers (back→front) · [characters layer "back"] · back props · tilemap ·
 * characters (default "main") · front props · [characters layer "front"].
 */
import { applyColor, blit, blitWrapX, createImage, extendUp, type RgbaImage } from "./raster.js";
import { resolveTile, surfaceY } from "./tiles.js";
import type { BackgroundPart, CharacterLayer, PartMeta, PropLayer, SceneDoc, TilesetPart } from "./types.js";

export interface SceneAssets {
  meta(id: string): PartMeta | undefined;
  image(id: string): RgbaImage | undefined;
}

export interface CharacterSprite {
  sheet: RgbaImage;
  x: number;
  /** Frame column (default 0 = idle) and row (0 = right in easysprite side-view sheets). */
  col?: number;
  row?: number;
  frameSize?: number;
  /** Sole row inside the frame (default 47, Easy Sprite side view). */
  groundRow?: number;
  /** Baseline in world px; default = ground surface under the frame's centre. */
  y?: number;
  flipX?: boolean;
  layer?: CharacterLayer;
}

export const DEFAULT_GROUND_ROW = 47;

export function mapSize(doc: SceneDoc): { width: number; height: number } {
  return { width: doc.width * doc.tileSize, height: doc.height * doc.tileSize };
}

/** Layer image after recolor/tint. */
export function layerImage(doc: SceneDoc, assets: SceneAssets, index: number): RgbaImage | undefined {
  const layer = doc.layers[index];
  if (!layer) return undefined;
  const img = assets.image(layer.part);
  const meta = assets.meta(layer.part);
  if (!img) return undefined;
  return applyColor(img, { recolorBase: meta?.recolorBase, color: layer.color, tint: layer.tint, tintAmount: layer.tintAmount });
}

/** World Y of a layer's top edge: bottom-aligned to the map bottom, plus offsetY. */
export function layerWorldY(doc: SceneDoc, img: { height: number }, index: number): number {
  return doc.height * doc.tileSize - img.height + (doc.layers[index]?.offsetY ?? 0);
}

/** Render only the tilemap onto a transparent map-sized image. */
export function renderTilemap(doc: SceneDoc, assets: SceneAssets): RgbaImage {
  const { width, height } = mapSize(doc);
  const out = createImage(width, height);
  const atlas = assets.image(doc.tileset);
  const meta = assets.meta(doc.tileset) as TilesetPart | undefined;
  if (!atlas) return out;
  const ts = meta?.tileSize ?? doc.tileSize;
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const t = resolveTile(doc.tiles, x, y);
      if (!t) continue;
      blit(out, atlas, x * doc.tileSize, y * doc.tileSize, { sx: t.col * ts, sy: t.row * ts, sw: ts, sh: ts });
    }
  }
  return out;
}

export function propImage(doc: SceneDoc, assets: SceneAssets, index: number): RgbaImage | undefined {
  const p = doc.props[index];
  if (!p) return undefined;
  const img = assets.image(p.part);
  if (!img) return undefined;
  return applyColor(img, { recolorBase: assets.meta(p.part)?.recolorBase, color: p.color, tint: p.tint, tintAmount: p.tintAmount });
}

export function propLayerOf(doc: SceneDoc, assets: SceneAssets, index: number): PropLayer {
  const p = doc.props[index]!;
  const meta = assets.meta(p.part);
  return p.layer ?? (meta?.kind === "prop" ? meta.defaultLayer : "back");
}

/** Render one group of props onto a transparent map-sized image. */
export function renderProps(doc: SceneDoc, assets: SceneAssets, layer: PropLayer): RgbaImage {
  const { width, height } = mapSize(doc);
  const out = createImage(width, height);
  doc.props.forEach((p, i) => {
    if (propLayerOf(doc, assets, i) !== layer) return;
    const img = propImage(doc, assets, i);
    if (img) blit(out, img, p.x, p.y - img.height, { flipX: p.flipX });
  });
  return out;
}

function drawCharacter(out: RgbaImage, doc: SceneDoc, ch: CharacterSprite, camX: number, camY: number): void {
  const fs = ch.frameSize ?? 48;
  blit(out, ch.sheet, ch.x - camX, characterTop(doc, ch) - camY, {
    sx: (ch.col ?? 0) * fs,
    sy: (ch.row ?? 0) * fs,
    sw: fs,
    sh: fs,
    flipX: ch.flipX,
  });
}

/** World y of the frame's top edge so that its sole row sits on the surface (or on `ch.y`). */
export function characterTop(doc: SceneDoc, ch: Pick<CharacterSprite, "x" | "y" | "frameSize" | "groundRow">): number {
  const fs = ch.frameSize ?? 48;
  const ground = ch.groundRow ?? DEFAULT_GROUND_ROW;
  const base = ch.y ?? surfaceY(doc.tiles, Math.floor((ch.x + fs / 2) / doc.tileSize), doc.tileSize);
  return base - (ground + 1);
}

export interface RenderOptions {
  /** Camera left edge in world px. Omit for a full-level overview (camera at 0 for every layer). */
  cameraX?: number;
  cameraY?: number;
  /** Output size; defaults to the whole map. */
  width?: number;
  height?: number;
  /** Legacy single character (drawn like a "main" layer character). */
  character?: CharacterSprite;
  characters?: readonly CharacterSprite[];
  /** Skip parts of the stack (used by per-layer PNG export). */
  include?: { layers?: boolean; tiles?: boolean; props?: boolean };
}

/** Composite the scene as the camera sees it at (cameraX, cameraY). */
export function renderScene(doc: SceneDoc, assets: SceneAssets, opts: RenderOptions = {}): RgbaImage {
  const size = mapSize(doc);
  const out = createImage(opts.width ?? size.width, opts.height ?? size.height);
  const camX = opts.cameraX ?? 0;
  const camY = opts.cameraY ?? 0;
  const inc = { layers: true, tiles: true, props: true, ...opts.include };

  if (inc.layers) {
    doc.layers.forEach((layer, i) => {
      const img = layerImage(doc, assets, i);
      if (!img) return;
      const meta = assets.meta(layer.part) as BackgroundPart | undefined;
      const period = meta?.loopWidth ?? img.width;
      const sx = -camX * layer.scroll;
      const sy = layerWorldY(doc, img, i) - camY * (layer.scrollY ?? 1);
      if (meta?.band === "sky" || i === 0) extendUp(out, img, sx, sy, period);
      blitWrapX(out, img, sx, sy, period);
    });
  }

  const drawProps = (which: PropLayer) => {
    doc.props.forEach((p, i) => {
      if (propLayerOf(doc, assets, i) !== which) return;
      const img = propImage(doc, assets, i);
      if (img) blit(out, img, p.x - camX, p.y - img.height - camY, { flipX: p.flipX });
    });
  };

  const chars = [...(opts.character ? [opts.character] : []), ...(opts.characters ?? [])];
  const drawChars = (layer: CharacterLayer) => {
    for (const ch of chars) if ((ch.layer ?? "main") === layer) drawCharacter(out, doc, ch, camX, camY);
  };

  drawChars("back");
  if (inc.props) drawProps("back");
  if (inc.tiles) {
    const tiles = renderTilemap(doc, assets);
    blit(out, tiles, -camX, -camY);
  }
  drawChars("main");
  if (inc.props) drawProps("front");
  drawChars("front");
  return out;
}

/**
 * Stack N viewport snapshots across the level to show parallax depth in one PNG.
 * A single sprite walks along with the camera (legacy preview); an array stays at its world positions.
 */
export function renderParallaxStrip(
  doc: SceneDoc,
  assets: SceneAssets,
  frames = 3,
  character?: CharacterSprite | readonly CharacterSprite[],
): RgbaImage {
  const vw = doc.viewport.width;
  const vh = doc.viewport.height;
  const size = mapSize(doc);
  const maxCam = Math.max(0, size.width - vw);
  const camY = Math.max(0, size.height - vh);
  const out = createImage(vw, vh * frames + 2 * (frames - 1));
  for (let f = 0; f < frames; f++) {
    const camX = frames === 1 ? 0 : Math.round((maxCam * f) / (frames - 1));
    const many = Array.isArray(character) ? (character as readonly CharacterSprite[]) : undefined;
    const one = character && !many ? (character as CharacterSprite) : undefined;
    const ch = one ? { ...one, x: camX + Math.round(vw / 3) } : undefined;
    const shot = renderScene(doc, assets, { cameraX: camX, cameraY: camY, width: vw, height: vh, character: ch, characters: many });
    blit(out, shot, 0, f * (vh + 2));
  }
  return out;
}
