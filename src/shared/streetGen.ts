/**
 * Seeded street generators: turn `{ set, seed, count }` into a row of modular buildings plus the
 * street dressing that goes with them (trees, lamps, hydrants, planters, a bus stop, parked cars and
 * the road strip). Pure and deterministic: the same seed always gives the same street.
 */
import type { ComposePropInput, StreetItem } from "./scene.js";

export interface StreetGenerateSpec {
  /** Building set to draw from. */
  set: StreetSetId;
  /** Any integer; the same seed gives the same street. */
  seed: number;
  /** Number of buildings to append (default 8, max 128; 0 = only dress the listed items). */
  count?: number;
  /** Add trees, lamps, hydrants, planters, a bus stop, parked cars and the road strip (default true). */
  dress?: boolean;
}

export type StreetSetId = "brick_town";
export const STREET_SETS: StreetSetId[] = ["brick_town"];

interface SetBuilding {
  part: string;
  width: number;
  weight: number;
  /** Where the entrance is, so planters stay clear of it. */
  door: "left" | "right";
  shop?: boolean;
}

interface StreetSet {
  buildings: SetBuilding[];
  /** Front-layer road strip chained under the whole street. */
  road?: { part: string; width: number; groundOffset: number };
  /** Parked cars: part, width, recolor options (null = keep the drawn colour). */
  cars: Array<{ part: string; width: number; colors: Array<string | null> }>;
  /** px below the sidewalk surface where parked cars stand. */
  carOffset: number;
  tree: { part: string; width: number };
  lamp: { part: string; width: number };
  hydrant: { part: string; width: number };
  planter: { part: string; width: number };
  busStop: { part: string; width: number };
}

export const BRICK_TOWN_SET: StreetSet = {
  buildings: [
    { part: "prop_bld_brick_row2_red", width: 64, weight: 3, door: "left" },
    { part: "prop_bld_brick_row3_brown", width: 64, weight: 3, door: "right" },
    { part: "prop_bld_brick_row3_cream_bay", width: 80, weight: 2, door: "left" },
    { part: "prop_bld_brick_row4_tan", width: 80, weight: 2, door: "right" },
    { part: "prop_bld_brick_row3_red_bay", width: 80, weight: 2, door: "right" },
    { part: "prop_bld_brick_row2_brown", width: 64, weight: 2, door: "right" },
    { part: "prop_bld_brick_shop_red", width: 80, weight: 1.5, door: "left", shop: true },
    { part: "prop_bld_brick_shop_teal", width: 96, weight: 1.5, door: "right", shop: true },
    { part: "prop_bld_brick_shop_cream", width: 96, weight: 1, door: "left", shop: true },
  ],
  road: { part: "prop_city_road", width: 128, groundOffset: 48 },
  cars: [
    { part: "prop_car_hatch_red", width: 56, colors: [null, null, "#2c6aa8", "#e0b030", "#3a8a5a"] },
    { part: "prop_car_sedan_dark", width: 72, colors: [null, null, "#8a8e96", "#5a2a3a"] },
  ],
  carOffset: 30,
  tree: { part: "prop_street_tree", width: 64 },
  lamp: { part: "prop_lamp_post_city", width: 16 },
  hydrant: { part: "prop_fire_hydrant", width: 12 },
  planter: { part: "prop_planter_brick", width: 32 },
  busStop: { part: "prop_bus_stop", width: 64 },
};

const SETS: Record<StreetSetId, StreetSet> = { brick_town: BRICK_TOWN_SET };

/** mulberry32 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedStreet {
  /** Buildings, edge to edge (feed to a street row). */
  items: StreetItem[];
  /** Total width of the buildings in px. */
  width: number;
}

/** Pick `count` buildings from the set (never the same one twice in a row). */
export function generateStreet(spec: StreetGenerateSpec): GeneratedStreet {
  const set = SETS[spec.set];
  if (!set) return { items: [], width: 0 };
  const r = rng((Math.round(spec.seed) ^ 0x5bd1e995) >>> 0);
  const count = Math.max(1, Math.min(128, Math.round(spec.count ?? 8)));
  const total = set.buildings.reduce((a, b) => a + b.weight, 0);
  const chosen: SetBuilding[] = [];
  for (let i = 0; i < count; i++) {
    let b: SetBuilding;
    let guard = 0;
    do {
      let t = r() * total;
      b = set.buildings[set.buildings.length - 1]!;
      for (const c of set.buildings) { t -= c.weight; if (t <= 0) { b = c; break; } }
    } while (chosen.length && b.part === chosen[chosen.length - 1]!.part && ++guard < 8);
    chosen.push(b);
  }
  return { items: chosen.map((b) => b.part), width: chosen.reduce((a, b) => a + b.width, 0) };
}

/**
 * Street dressing for a laid-out row of buildings: trees, lamps and hydrants on the party walls,
 * planters on the side away from residential doors, one bus stop in front of a shop, parked cars
 * along the curb with gaps, and the road strip under the whole length. Deterministic per seed.
 */
export function dressStreet(setId: StreetSetId, seed: number, buildings: ReadonlyArray<{ part: string; x: number; width: number }>): ComposePropInput[] {
  const set = SETS[setId];
  if (!set || !buildings.length) return [];
  const r = rng((Math.round(seed) * 2654435761 + 17) >>> 0);
  const info = new Map(set.buildings.map((b) => [b.part, b]));
  const props: ComposePropInput[] = [];
  const count = buildings.length;
  let lastTree = -999;
  let busDone = count < 5;
  let hydrants = 0;
  for (const [i, b] of buildings.entries()) {
    const meta = info.get(b.part);
    const edge = b.x + b.width;
    const shop = meta?.shop ?? false;
    if (!shop && r() < 0.55) {
      const doorLeft = (meta?.door ?? "left") === "left";
      props.push({ part: set.planter.part, x: doorLeft ? edge - set.planter.width - 6 : b.x + 6 });
    }
    if (!busDone && shop && i > 0) {
      props.push({ part: set.busStop.part, x: b.x + Math.round((b.width - set.busStop.width) / 2) });
      busDone = true;
      continue;
    }
    if (i < count - 1) {
      const roll = r();
      if (roll < 0.5 && edge - lastTree > 140) {
        props.push({ part: set.tree.part, x: edge - set.tree.width / 2 });
        lastTree = edge;
      } else if (roll < 0.75) {
        props.push({ part: set.lamp.part, x: edge - Math.round(set.lamp.width / 2) });
      } else if (hydrants < Math.ceil(count / 4)) {
        props.push({ part: set.hydrant.part, x: edge - 18 });
        hydrants++;
      }
    }
  }
  const x0 = buildings[0]!.x;
  const x1 = buildings[buildings.length - 1]!.x + buildings[buildings.length - 1]!.width;
  if (set.road) {
    for (let rx = x0; rx < x1; rx += set.road.width) props.push({ part: set.road.part, x: rx, groundOffset: set.road.groundOffset, layer: "front" });
  }
  let cx = x0 + 8 + Math.floor(r() * 40);
  while (cx < x1 - 40) {
    const c = set.cars[Math.floor(r() * set.cars.length)]!;
    if (cx + c.width > x1) break;
    if (r() < 0.6) {
      const color = c.colors[Math.floor(r() * c.colors.length)];
      props.push({ part: c.part, x: cx, groundOffset: set.carOffset, layer: "front", ...(r() < 0.5 ? { flipX: true } : {}), ...(color ? { color } : {}) });
      cx += c.width + 10 + Math.floor(r() * 24);
    } else cx += 40 + Math.floor(r() * 50);
  }
  return props;
}
