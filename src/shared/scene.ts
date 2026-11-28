/**
 * Scene document builder/validator. Pure: give it the part catalog and an input,
 * get back a normalized SceneDoc plus human-readable warnings (never throws on
 * unknown parts — it drops them, like Easy Sprite's compose).
 */
import { clampVehiclesToRoad } from "./bounds.js";
import { normalizeCharacters } from "./characters.js";
import { dressStreet, generateStreet, type StreetGenerateSpec } from "./streetGen.js";
import { isHex } from "./raster.js";
import { buildTiles, normalizeTiles, surfaceY, type TerrainSpec } from "./tiles.js";
import {
  DEFAULT_CONFIG,
  EXIT_SIDES,
  type BackgroundPart,
  type CollisionRect,
  type EasySceneConfig,
  type PartMeta,
  type PropLayer,
  type SceneCharacter,
  type SceneDoc,
  type SceneDoor,
  type SceneInterior,
  type SceneExit,
  type SceneTown,
  type SceneLayer,
  type SceneProp,
} from "./types.js";

export interface ComposeLayerInput extends Partial<SceneLayer> {
  part: string;
}

export interface ComposePropInput extends Partial<SceneProp> {
  part: string;
  x: number;
  /**
   * px below the ground surface under the prop's centre for its baseline (ignored when `y` is set).
   * Used for road-level props in front of a sidewalk: a road strip, parked cars.
   */
  groundOffset?: number;
}

/** One building in a street row: a part id, or an object with per-building options. */
export type StreetItem = string | (Omit<ComposePropInput, "x"> & { /** Extra px before this item (default 0). */ gapBefore?: number });

/**
 * A row of props placed edge to edge from `x` (snapped to the tile grid): each next item starts
 * where the previous one ends (`x += width + gap`). Made for `category: "building"` parts.
 */
export interface ComposeStreetInput {
  /** Left edge of the first item in px (default 0; snapped down to the tile grid). */
  x?: number;
  /** px between items (default 0 = touching). */
  gap?: number;
  /** Buildings left to right (may be empty when `generate` is set). */
  items?: StreetItem[];
  /**
   * Seeded generator: appends `count` buildings from a set (e.g. "brick_town") after `items` and,
   * unless `dress: false`, adds trees, lamps, hydrants, planters, a bus stop, parked cars and the road.
   */
  generate?: StreetGenerateSpec;
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
  /** Rows of buildings chained edge to edge; expanded into `props` (drawn before them). */
  streets?: ComposeStreetInput[];
  collision?: CollisionRect[];
  /** Legacy single preview character. */
  character?: { sheet: string; x?: number };
  characters?: SceneCharacter[];
  exits?: SceneExit[];
  doors?: SceneDoor[];
  interior?: SceneInterior;
  town?: SceneTown;
}

/**
 * Expand a street row into props with explicit x. Unknown / non-prop parts are skipped with a warning
 * and take no space. Pure: the saved scene only ever contains plain props.
 */
export function layoutStreet(
  parts: readonly PartMeta[],
  street: ComposeStreetInput,
  tileSize = DEFAULT_CONFIG.tileSize,
): { props: ComposePropInput[]; warnings: string[]; endX: number } {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const warnings: string[] = [];
  const props: ComposePropInput[] = [];
  let x = Math.floor((Number.isFinite(street.x) ? street.x! : 0) / tileSize) * tileSize;
  const gap = Number.isFinite(street.gap) ? Math.round(street.gap!) : 0;
  const items = [...(Array.isArray(street.items) ? street.items : [])];
  if (street.generate) {
    const gen = street.generate.count === 0 ? { items: [] } : generateStreet(street.generate);
    if (street.generate.count !== 0 && !gen.items.length) warnings.push(`Street generate: unknown set ${JSON.stringify(street.generate.set)}`);
    items.push(...gen.items);
  }
  const placed: Array<{ part: string; x: number; width: number }> = [];
  for (const [i, raw] of items.entries()) {
    const item = typeof raw === "string" ? { part: raw } : raw;
    const meta = byId.get(item.part);
    if (!meta || meta.kind !== "prop") {
      warnings.push(`Street item "${item.part}": not a prop part (use list_parts kind=prop category=building)`);
      continue;
    }
    if (meta.width % tileSize !== 0) warnings.push(`Street item "${item.part}" is ${meta.width}px wide (not a multiple of ${tileSize}); neighbours will be off-grid`);
    const { gapBefore, ...rest } = item as Exclude<StreetItem, string>;
    if (i > 0) x += gap;
    if (typeof gapBefore === "number" && Number.isFinite(gapBefore)) x += Math.round(gapBefore);
    props.push({ ...rest, x });
    placed.push({ part: item.part, x, width: meta.width });
    x += meta.width;
  }
  if (street.generate && street.generate.dress !== false) {
    for (const p of dressStreet(street.generate.set, street.generate.seed, placed)) {
      if (byId.has(p.part)) props.push(p);
      else warnings.push(`Street dressing "${p.part}" is not in the workspace (re-run init to add new sample parts)`);
    }
  }
  return { props, warnings, endX: x };
}

/**
 * Snap a building's left edge for the editor: to a neighbouring building's edge when within
 * `tolerance` px (so they touch without a gap or overlap), otherwise to the tile grid.
 * Non-building props are returned unchanged.
 */
export function snapBuildingX(
  meta: Pick<PartMeta, "kind" | "width"> & { category?: string },
  rawLeft: number,
  tileSize: number,
  neighbours: ReadonlyArray<{ x: number; width: number }>,
  tolerance = 8,
): number {
  if (meta.kind !== "prop" || meta.category !== "building") return Math.round(rawLeft);
  let best = Math.round(rawLeft / tileSize) * tileSize;
  let bestD = Infinity;
  for (const n of neighbours) {
    for (const edge of [n.x + n.width, n.x - meta.width]) {
      const d = Math.abs(rawLeft - edge);
      if (d <= tolerance && d < bestD) [best, bestD] = [edge, d];
    }
  }
  return best;
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

  // ---- props (street rows first so they draw behind loose props) ----
  const streetProps: ComposePropInput[] = [];
  for (const street of input.streets ?? []) {
    if (!street || (!Array.isArray(street.items) && !street.generate)) continue;
    const res = layoutStreet(parts, street, tileSize);
    streetProps.push(...res.props);
    warnings.push(...res.warnings);
  }
  const props: SceneProp[] = [];
  for (const p of [...streetProps, ...(input.props ?? [])]) {
    const meta = byId.get(p.part);
    if (!meta || meta.kind !== "prop") {
      warnings.push(`Skipped prop "${p.part}": not a prop part (use list_parts kind=prop)`);
      continue;
    }
    const x = Math.round(p.x);
    const centerCol = Math.floor((x + meta.width / 2) / tileSize);
    const ground = surfaceY(tiles, centerCol, tileSize);
    const y = typeof p.y === "number"
      ? Math.round(p.y)
      : ground + (typeof p.groundOffset === "number" && Number.isFinite(p.groundOffset) ? Math.round(p.groundOffset) : 0);
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
  if (input.characters !== undefined) {
    const res = normalizeCharacters(input.characters);
    warnings.push(...res.warnings);
    if (res.characters.length) scene.characters = res.characters;
    const mapW = width * tileSize;
    for (const c of res.characters) {
      if (typeof c.x === "number" && (c.x + 48 < 0 || c.x > mapW)) warnings.push(`Character "${c.name ?? c.sheet}" at x=${c.x} is outside the map`);
    }
  }
  if (input.exits !== undefined) {
    const exits: SceneExit[] = [];
    for (const e of Array.isArray(input.exits) ? input.exits : []) {
      if (!e || !(EXIT_SIDES as readonly string[]).includes(e.side) || typeof e.to !== "string" || !e.to.trim()) {
        warnings.push(`Skipped exit ${JSON.stringify(e)}: needs side "left"|"right" and a "to" target`);
        continue;
      }
      exits.push({ side: e.side, to: e.to.trim(), ...(typeof e.at === "string" && e.at.trim() ? { at: e.at.trim() } : {}) });
    }
    if (exits.length) scene.exits = exits;
  }
  if (Array.isArray(input.doors) && input.doors.length) {
    const doors: SceneDoor[] = [];
    for (const d of input.doors) {
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.w) || d.w <= 0) continue;
      doors.push({ x: Math.round(d.x), w: Math.round(d.w), ...(d.side ? { side: d.side } : {}), ...(d.kind ? { kind: d.kind } : {}), ...(d.to ? { to: d.to } : {}) });
    }
    if (doors.length) scene.doors = doors;
  }
  if (input.interior && typeof input.interior.type === "string") {
    const i = input.interior;
    scene.interior = { type: i.type, ...(i.seed != null ? { seed: i.seed } : {}), ...(i.kind ? { kind: i.kind } : {}), ...(i.halal ? { halal: true } : {}) };
  }
  if (input.town && typeof input.town.kind === "string") {
    const t = input.town;
    scene.town = { kind: t.kind, ...(t.id ? { id: t.id } : {}), ...(t.map ? { map: t.map } : {}), ...(t.name?.th && t.name?.en ? { name: { th: t.name.th, en: t.name.en, ...(t.name.ms ? { ms: t.name.ms } : {}) } } : {}) };
  }
  const moved = clampVehiclesToRoad(scene, parts);
  for (const m of moved) warnings.push(`Moved ${m.part} off water/pier (${m.from} → ${m.to})`);
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
      characters: doc.characters,
      exits: doc.exits,
      town: doc.town,
    },
    config,
  );
}
