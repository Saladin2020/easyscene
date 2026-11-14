/**
 * Canvas renderer for the editor and the live parallax preview.
 * Mirrors src/shared/render.ts (same placement maths) but draws with drawImage for speed.
 * imageSmoothingEnabled is always false — nearest-neighbour only.
 */
import { applyColor, type RgbaImage } from "../../src/shared/raster";
import { layerWorldY, propLayerOf, type SceneAssets } from "../../src/shared/render";
import { resolveTile, surfaceY } from "../../src/shared/tiles";
import type { BackgroundPart, PartMeta, PropLayer, SceneDoc } from "./types";

export interface LoadedPart {
  meta: PartMeta;
  img: RgbaImage;
  canvas: HTMLCanvasElement;
}

export function toCanvas(img: RgbaImage): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  const data = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  ctx.putImageData(data, 0, 0);
  return c;
}

export async function loadImage(url: string): Promise<RgbaImage> {
  const el = new Image();
  el.src = url;
  await el.decode();
  const c = document.createElement("canvas");
  c.width = el.naturalWidth;
  c.height = el.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(el, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

export function assetsOf(parts: Map<string, LoadedPart>): SceneAssets {
  return { meta: (id) => parts.get(id)?.meta, image: (id) => parts.get(id)?.img };
}

const colorCache = new Map<string, HTMLCanvasElement>();

/** Recolored/tinted canvas for a part (cached per color combo). */
export function coloredCanvas(
  part: LoadedPart,
  opts: { color?: string; tint?: string; tintAmount?: number },
): HTMLCanvasElement {
  if (!opts.color && !opts.tint) return part.canvas;
  const key = `${part.meta.id}|${opts.color ?? ""}|${opts.tint ?? ""}|${opts.tintAmount ?? ""}`;
  let c = colorCache.get(key);
  if (!c) {
    c = toCanvas(applyColor(part.img, { recolorBase: part.meta.recolorBase, ...opts }));
    colorCache.set(key, c);
  }
  return c;
}

export interface CharacterDraw {
  sheet: CanvasImageSource;
  x: number;
  col: number;
  row: number;
  /** Sole row in the 48px frame (default 47, Easy Sprite side view). */
  groundRow?: number;
  /** Baseline in world px (default: ground under the character). */
  y?: number;
  flipX?: boolean;
  layer?: "back" | "main" | "front";
}

/** Lowest opaque row of frame (col,row): where the soles are. */
export function detectSheetGroundRow(img: HTMLImageElement, col = 0, row = 0): number | undefined {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(img, col * 48, row * 48, 48, 48, 0, 0, 48, 48);
  const data = ctx.getImageData(0, 0, 48, 48).data;
  for (let y = 47; y >= 0; y--) for (let x = 0; x < 48; x++) if (data[(y * 48 + x) * 4 + 3]! > 0) return y;
  return undefined;
}

/** Draw the scene as seen from camera (camX, camY) into a viewW×viewH region of ctx. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  doc: SceneDoc,
  parts: Map<string, LoadedPart>,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  character?: CharacterDraw | readonly CharacterDraw[],
): void {
  const chars: readonly CharacterDraw[] = !character ? [] : Array.isArray(character) ? character : [character as CharacterDraw];
  const drawChars = (layer: "back" | "main" | "front") => {
    for (const ch of chars) {
      if ((ch.layer ?? "main") !== layer) continue;
      const base = ch.y ?? surfaceY(doc.tiles, Math.floor((ch.x + 24) / doc.tileSize), doc.tileSize);
      const top = Math.round(base - ((ch.groundRow ?? 47) + 1) - camY);
      const left = Math.round(ch.x - camX);
      if (ch.flipX) {
        ctx.save();
        ctx.translate(left + 48, top);
        ctx.scale(-1, 1);
        ctx.drawImage(ch.sheet, ch.col * 48, ch.row * 48, 48, 48, 0, 0, 48, 48);
        ctx.restore();
      } else {
        ctx.drawImage(ch.sheet, ch.col * 48, ch.row * 48, 48, 48, left, top, 48, 48);
      }
    }
  };
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, viewW, viewH);
  const assets = assetsOf(parts);

  doc.layers.forEach((layer, i) => {
    const part = parts.get(layer.part);
    if (!part) return;
    const cv = coloredCanvas(part, layer);
    const meta = part.meta as BackgroundPart;
    const p = Math.max(1, meta.loopWidth ?? cv.width);
    const sx = Math.round(-camX * layer.scroll);
    const sy = Math.round(layerWorldY(doc, cv, i) - camY * (layer.scrollY ?? 1));
    const start = ((sx % p) + p) % p;
    for (let x = start - p; x < viewW; x += p) {
      if ((meta.band === "sky" || i === 0) && sy > 0) ctx.drawImage(cv, 0, 0, Math.min(p, cv.width), 1, x, 0, Math.min(p, cv.width), sy);
      ctx.drawImage(cv, 0, 0, Math.min(p, cv.width), cv.height, x, sy, Math.min(p, cv.width), cv.height);
    }
  });

  const drawProps = (which: PropLayer) => {
    doc.props.forEach((prop, i) => {
      if (propLayerOf(doc, assets, i) !== which) return;
      const part = parts.get(prop.part);
      if (!part) return;
      const cv = coloredCanvas(part, prop);
      const x = Math.round(prop.x - camX);
      const y = Math.round(prop.y - cv.height - camY);
      if (prop.flipX) {
        ctx.save();
        ctx.translate(x + cv.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, 0, 0);
        ctx.restore();
      } else ctx.drawImage(cv, x, y);
    });
  };

  drawChars("back");
  drawProps("back");
  const atlas = parts.get(doc.tileset);
  if (atlas) {
    const ts = doc.tileSize;
    const x0 = Math.max(0, Math.floor(camX / ts));
    const x1 = Math.min(doc.width, Math.ceil((camX + viewW) / ts));
    const y0 = Math.max(0, Math.floor(camY / ts));
    const y1 = Math.min(doc.height, Math.ceil((camY + viewH) / ts));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const t = resolveTile(doc.tiles, x, y);
        if (t) ctx.drawImage(atlas.canvas, t.col * ts, t.row * ts, ts, ts, Math.round(x * ts - camX), Math.round(y * ts - camY), ts, ts);
      }
    }
  }
  drawChars("main");
  drawProps("front");
  drawChars("front");
}
