/**
 * Scene document builder/validator. Pure: give it the part catalog and an input,
 * get back a normalized SceneDoc plus human-readable warnings (never throws on
 * unknown parts — it drops them, like Easy Sprite's compose).
 */
import { isHex } from "./raster.js";
import { buildTiles, normalizeTiles, surfaceY, type TerrainSpec } from "./tiles.js";
import {
  DEFAULT_CONFIG,
  type BackgroundPart,
  type CollisionRect,
  type EasySceneConfig,
  type PartMeta,
  type PropLayer,
  type SceneDoc,
  type SceneLayer,
  type SceneProp,
} from "./types.js";

export interface ComposeLayerInput extends Partial<SceneLayer> {
  part: string;
}

export interface ComposePropInput extends Partial<SceneProp> {
  part: string;
  x: number;
}

export interface ComposeSceneInput {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  tileSize?: number;
  viewport?: { width: number; height: number };
  /** Back-to-front. Strings are part ids with default scroll. */
  layers?: Array<string | ComposeLayerInput>;
  tileset?: string;
  /** Explicit tile rows (`.#=/\`). Wins over `terrain`. */
  tiles?: string[];
  terrain?: Omit<TerrainSpec, "width" | "height">;
  props?: ComposePropInput[];
  collision?: CollisionRect[];
  character?: { sheet: string; x?: number };
}

export const DEFAULT_LAYERS = ["bg_sky_day", "bg_far_mountains", "bg_mid_forest", "bg_near_bushes"];
export const DEFAULT_TILESET = "tiles_grass";

/** px the layer art tucks under the grass line. */
export const ANCHOR_OVERLAP = 6;

/** Most common walkable surface (px) across columns — the "ground line" of the map. */
export function mostCommonSurface(tiles: readonly string[], tileSize: number): number {
  const counts = new Map<number, number>();
  const width = tiles[0]?.length ?? 0;
  for (let x = 0; x < width; x++) {
    const y = surfaceY(tiles, x, tileSize);
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let best = tiles.length * tileSize;
  let n = -1;
  for (const [y, c] of counts) if (c > n || (c === n && y > best)) [best, n] = [y, c];
  return best;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const int = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback);
const normHex = (v: string) => (v.startsWith("#") ? v : `#${v}`).toLowerCase();

export function composeScene(
  parts: readonly PartMeta[],
  input: ComposeSceneInput,
  config: EasySceneConfig = DEFAULT_CONFIG,
): { scene: SceneDoc; warnings: string[] } {
  const warnings: string[] = [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const tileSize = int(input.tileSize, config.tileSize);
  const width = clamp(int(input.width, 60), 4, 1024);
  const height = clamp(int(input.height, Math.ceil(config.viewport.height / tileSize)), 4, 256);

  // ---- parallax layers ----
  const rawLayers = input.layers?.length ? input.layers : DEFAULT_LAYERS;
  const layers: SceneLayer[] = [];
  const explicitOffset: boolean[] = [];
  for (const raw of rawLayers) {
    const l: ComposeLayerInput = typeof raw === "string" ? { part: raw } : raw;
    const meta = byId.get(l.part);
    if (!meta || meta.kind !== "background") {
      warnings.push(`Skipped layer "${l.part}": not a background part (use list_parts kind=background)`);
      continue;
    }
    if (layers.length >= config.maxLayers) {
      warnings.push(`Skipped layer "${l.part}": max ${config.maxLayers} layers`);
      continue;
    }
    const layer: SceneLayer = {
      part: l.part,
      scroll: clamp(typeof l.scroll === "number" ? l.scroll : (meta as BackgroundPart).defaultScroll, 0, 1),
    };
    if (typeof l.scrollY === "number") layer.scrollY = clamp(l.scrollY, 0, 1);
    if (l.color) {
      if (isHex(l.color)) layer.color = normHex(l.color);
      else warnings.push(`Layer "${l.part}": ignored bad color ${JSON.stringify(l.color)}`);
    }
    if (l.tint) {
      if (isHex(l.tint)) {
        layer.tint = normHex(l.tint);
        if (typeof l.tintAmount === "number") layer.tintAmount = clamp(l.tintAmount, 0, 1);
      } else warnings.push(`Layer "${l.part}": ignored bad tint ${JSON.stringify(l.tint)}`);
    }
    if (typeof l.offsetY === "number" && l.offsetY !== 0) layer.offsetY = Math.round(l.offsetY);
    layers.push(layer);
    explicitOffset.push(typeof l.offsetY === "number");
  }

  // ---- tileset + tiles ----
  let tileset = input.tileset ?? DEFAULT_TILESET;
  const tsMeta = byId.get(tileset);
  if (!tsMeta || tsMeta.kind !== "tileset") {
    const fallback = parts.find((p) => p.kind === "tileset");
    warnings.push(`Tileset "${tileset}" not found; using ${fallback?.id ?? "none"}`);
    tileset = fallback?.id ?? "";
  } else if (tsMeta.tileSize !== tileSize) {
    warnings.push(`Tileset "${tileset}" is ${tsMeta.tileSize}px but scene tileSize is ${tileSize}px`);
  }

  const tiles = input.tiles?.length
    ? normalizeTiles(input.tiles, width, height)
    : buildTiles({ width, height, ...(input.terrain ?? {}) });
  if (input.tiles?.some((row) => /[^.#=/\\]/.test(row))) warnings.push("Unknown tile codes were replaced with '.'");

  // Anchor non-sky layers to the ground line so near/mid art is not hidden behind the tiles.
  const groundLine = mostCommonSurface(tiles, tileSize);
  const mapH = height * tileSize;
  const autoOffset = Math.min(0, groundLine - mapH + ANCHOR_OVERLAP);
  for (const [i, layer] of layers.entries()) {
    const meta = byId.get(layer.part) as BackgroundPart;
    if (!explicitOffset[i] && meta.band !== "sky" && autoOffset !== 0) layer.offsetY = autoOffset;
  }

  // ---- props ----
  const props: SceneProp[] = [];
  for (const p of input.props ?? []) {
    const meta = byId.get(p.part);
    if (!meta || meta.kind !== "prop") {
      warnings.push(`Skipped prop "${p.part}": not a prop part (use list_parts kind=prop)`);
      continue;
    }
    const x = Math.round(p.x);
    const centerCol = Math.floor((x + meta.width / 2) / tileSize);
    const y = typeof p.y === "number" ? Math.round(p.y) : surfaceY(tiles, centerCol, tileSize);
    const prop: SceneProp = { part: p.part, x, y };
    if (p.flipX) prop.flipX = true;
    if (p.layer === "back" || p.layer === "front") prop.layer = p.layer as PropLayer;
    if (p.color && isHex(p.color)) prop.color = normHex(p.color);
    if (p.tint && isHex(p.tint)) {
      prop.tint = normHex(p.tint);
      if (typeof p.tintAmount === "number") prop.tintAmount = clamp(p.tintAmount, 0, 1);
    }
    if (x + meta.width < 0 || x > width * tileSize) warnings.push(`Prop "${p.part}" at x=${x} is outside the map`);
    props.push(prop);
  }

  const collision: CollisionRect[] = (input.collision ?? [])
    .filter((r) => [r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && Number.isFinite(v)) && r.w > 0 && r.h > 0)
    .map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), ...(r.oneWay ? { oneWay: true } : {}) }));

  const scene: SceneDoc = {
    format: "easyscene/1",
    id: input.id,
    name: input.name?.trim() || input.id,
    tileSize,
    width,
    height,
    viewport: input.viewport ?? { ...config.viewport },
    layers,
    tileset,
    tiles,
    props,
    collision,
  };
  if (input.character?.sheet) scene.character = { sheet: input.character.sheet, ...(typeof input.character.x === "number" ? { x: Math.round(input.character.x) } : {}) };
  return { scene, warnings };
}

/** Parse a SceneDoc-like JSON (e.g. hand-edited) back through composeScene so it is always normalized. */
export function normalizeScene(parts: readonly PartMeta[], doc: SceneDoc, config?: EasySceneConfig) {
  return composeScene(
    parts,
    {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      tileSize: doc.tileSize,
      viewport: doc.viewport,
      layers: doc.layers,
      tileset: doc.tileset,
      tiles: doc.tiles,
      props: doc.props,
      collision: doc.collision,
      character: doc.character,
    },
    config,
  );
}
