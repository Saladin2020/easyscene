/**
 * Scene compositor. Pure: callers hand in decoded part images.
 * Draw order: parallax layers (back→front) · back props · tilemap · character · front props.
 */
import { applyColor, blit, blitWrapX, createImage, extendUp, type RgbaImage } from "./raster.js";
import { resolveTile, surfaceY } from "./tiles.js";
import type { BackgroundPart, PartMeta, PropLayer, SceneDoc, TilesetPart } from "./types.js";

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
  groundRow?: number;
}

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
  const ground = ch.groundRow ?? 44;
  const col = Math.floor((ch.x + fs / 2) / doc.tileSize);
  const base = surfaceY(doc.tiles, col, doc.tileSize);
  blit(out, ch.sheet, ch.x - camX, base - (ground + 1) - camY, {
    sx: (ch.col ?? 0) * fs,
    sy: (ch.row ?? 0) * fs,
    sw: fs,
    sh: fs,
  });
}

export interface RenderOptions {
  /** Camera left edge in world px. Omit for a full-level overview (camera at 0 for every layer). */
  cameraX?: number;
  cameraY?: number;
  /** Output size; defaults to the whole map. */
  width?: number;
  height?: number;
  character?: CharacterSprite;
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

  if (inc.props) drawProps("back");
  if (inc.tiles) {
    const tiles = renderTilemap(doc, assets);
    blit(out, tiles, -camX, -camY);
  }
  if (opts.character) drawCharacter(out, doc, opts.character, camX, camY);
  if (inc.props) drawProps("front");
  return out;
}

/** Stack N viewport snapshots across the level to show parallax depth in one PNG. */
export function renderParallaxStrip(doc: SceneDoc, assets: SceneAssets, frames = 3, character?: CharacterSprite): RgbaImage {
  const vw = doc.viewport.width;
  const vh = doc.viewport.height;
  const size = mapSize(doc);
  const maxCam = Math.max(0, size.width - vw);
  const camY = Math.max(0, size.height - vh);
  const out = createImage(vw, vh * frames + 2 * (frames - 1));
  for (let f = 0; f < frames; f++) {
    const camX = frames === 1 ? 0 : Math.round((maxCam * f) / (frames - 1));
    const ch = character ? { ...character, x: camX + Math.round(vw / 3) } : undefined;
    const shot = renderScene(doc, assets, { cameraX: camX, cameraY: camY, width: vw, height: vh, character: ch });
    blit(out, shot, 0, f * (vh + 2));
  }
  return out;
}
