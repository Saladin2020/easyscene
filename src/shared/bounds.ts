/**
 * Walkable street vs open water / pier decks, and a guard so parked vehicles stay on the road.
 *
 * A canal or beach is a pit of empty tiles (the sky's water band shows through). A pier or stilt
 * hut adds a thin deck collision over that pit: people can walk to the end of the deck, but cars
 * must stay on solid ground.
 */
import type { PartMeta, PropPart, SceneDoc, SceneProp } from "./types.js";

export type Span = { minX: number; maxX: number };
export type MetaLookup = ((id: string) => PartMeta | undefined) | readonly PartMeta[];

export function metaOf(parts: MetaLookup, id: string): PartMeta | undefined {
  return typeof parts === "function" ? parts(id) : parts.find((p) => p.id === id);
}

/** Pier, jetty or stilt deck over water (not boats). */
export function isPierPart(meta: PartMeta | undefined): meta is PropPart {
  if (!meta || meta.kind !== "prop") return false;
  const p = meta as PropPart;
  if (/boat/i.test(p.id) || (p.tags ?? []).some((t) => t === "boat")) return false;
  // category water + a deck box covers prop_pier and prop_fisher_hut. Do not use the
  // "stilts" tag alone: land buildings such as prop_bld_malay_house also have it.
  if (p.category === "water" && p.collision) return true;
  return (p.tags ?? []).some((t) => t === "pier" || t === "boardwalk" || t === "jetty");
}

/** Parked street vehicles (not trains or planes). */
export function isStreetVehicle(meta: PartMeta | undefined): meta is PropPart {
  if (!meta || meta.kind !== "prop") return false;
  if (/train|plane/.test(meta.id)) return false;
  const tags = meta.tags ?? [];
  if (tags.some((t) => t === "train" || t === "plane" || t === "sky")) return false;
  if (tags.includes("vehicle") || tags.includes("car")) return true;
  return /^(prop_car_|prop_tuktuk|prop_scooter|prop_songthaew|prop_bus_|prop_truck_|prop_motorbike)/.test(meta.id);
}

function colSolid(doc: SceneDoc, col: number): boolean {
  if (col < 0 || col >= doc.width) return false;
  for (const row of doc.tiles) {
    const c = row[col];
    if (c === "#" || c === "/" || c === "\\") return true;
  }
  return false;
}

/** World-px spans of pier / stilt decks. */
export function pierSpans(doc: SceneDoc, parts: MetaLookup): Array<{ x0: number; x1: number }> {
  const out: Array<{ x0: number; x1: number }> = [];
  for (const p of doc.props) {
    const meta = metaOf(parts, p.part);
    if (!isPierPart(meta)) continue;
    const c = meta.collision;
    if (c) {
      const cx = p.flipX ? meta.width - c.x - c.w : c.x;
      out.push({ x0: p.x + cx, x1: p.x + cx + c.w });
    } else out.push({ x0: p.x, x1: p.x + meta.width });
  }
  return out;
}

function overlapsPier(x0: number, x1: number, spans: Array<{ x0: number; x1: number }>): boolean {
  return spans.some((s) => x0 < s.x1 && x1 > s.x0);
}

/** Inclusive street the player may walk: solid tiles plus pier decks. Open water past the deck is out. */
export function walkBounds(doc: SceneDoc, parts: MetaLookup): Span {
  const ts = doc.tileSize;
  const widthPx = doc.width * ts;
  const walkable: boolean[] = new Array(doc.width).fill(false);
  for (let col = 0; col < doc.width; col++) walkable[col] = colSolid(doc, col);
  for (const s of pierSpans(doc, parts)) {
    const c0 = Math.max(0, Math.floor(s.x0 / ts));
    const c1 = Math.min(doc.width, Math.ceil(s.x1 / ts));
    for (let c = c0; c < c1; c++) walkable[c] = true;
  }
  const first = walkable.indexOf(true);
  if (first < 0) return { minX: 0, maxX: widthPx };
  let last = first;
  for (let c = first; c < doc.width && walkable[c]; c++) last = c;
  return { minX: first * ts, maxX: (last + 1) * ts };
}

/** Road only: solid ground tiles that are not under a pier or jetty. Vehicles stay here. */
export function roadBounds(doc: SceneDoc, parts: MetaLookup): Span {
  const ts = doc.tileSize;
  const widthPx = doc.width * ts;
  const spans = pierSpans(doc, parts);
  const road: boolean[] = new Array(doc.width).fill(false);
  for (let col = 0; col < doc.width; col++) {
    if (!colSolid(doc, col)) continue;
    if (overlapsPier(col * ts, (col + 1) * ts, spans)) continue;
    road[col] = true;
  }
  const first = road.indexOf(true);
  if (first < 0) return { minX: 0, maxX: widthPx };
  let last = first;
  for (let c = first; c < doc.width && road[c]; c++) last = c;
  return { minX: first * ts, maxX: (last + 1) * ts };
}

/** True when the scene has a pier or a canal/beach pit that runs off a map edge (not a mid-street hole). */
export function hasWaterOrPier(doc: SceneDoc, parts: MetaLookup): boolean {
  if (pierSpans(doc, parts).length > 0) return true;
  return !colSolid(doc, 0) || !colSolid(doc, doc.width - 1);
}

export type VehicleMove = { part: string; from: number; to: number };

/** Snap street vehicles that sit on a pier or in open water back onto the road. Returns what moved. */
export function clampVehiclesToRoad(doc: SceneDoc, parts: MetaLookup): VehicleMove[] {
  const road = roadBounds(doc, parts);
  const moved: VehicleMove[] = [];
  for (const p of doc.props) {
    const meta = metaOf(parts, p.part);
    if (!isStreetVehicle(meta)) continue;
    const maxStart = road.maxX - meta.width;
    if (maxStart < road.minX) continue;
    const to = Math.max(road.minX, Math.min(maxStart, p.x));
    if (to !== p.x) {
      moved.push({ part: p.part, from: p.x, to });
      p.x = to;
    }
  }
  return moved;
}

export function vehicleOnWaterOrPier(p: SceneProp, doc: SceneDoc, parts: MetaLookup): boolean {
  const meta = metaOf(parts, p.part);
  if (!isStreetVehicle(meta)) return false;
  const road = roadBounds(doc, parts);
  return p.x < road.minX || p.x + meta.width > road.maxX;
}
