/**
 * Town scene presets for overworld maps (Easy Tilemap `overworld.towns[]`): one seeded side-view
 * street per town kind, built from existing parts only.
 *
 * - thai_town      Thai teak houses, a wat sala, shophouses and a market, power poles, temple hill
 * - malay_kampung  wooden mosque, Malay raised houses, roti teashop and halal stall (halal food only),
 *                  ending at a fishing beach with kolek boats
 * - chinese_town   Chinese-Thai shophouses around a shrine, lanterns along the street
 * - rural_village  teak houses with gardens, fences, trees and fields under the hills
 * - brick_city     the brick_town street set (rowhouses, shops, trees, cars, road strip)
 *
 * Every town scene gets exits back to the overworld at both street ends (the kampung: landward end only). Pure and deterministic.
 */
import { composeScene, layoutStreet, type ComposePropInput, type ComposeSceneInput, type StreetItem } from "./scene.js";
import type { EasySceneConfig, PartMeta, SceneExit, SceneTown } from "./types.js";

export const TOWN_KINDS = ["thai_town", "malay_kampung", "chinese_town", "rural_village", "brick_city"] as const;
export type TownKind = (typeof TOWN_KINDS)[number];

export interface TownSceneSpec {
  /** Scene id (the overworld town's `scene`). */
  id: string;
  kind: TownKind;
  seed: number;
  name?: { th: string; en: string; ms?: string };
  /** Overworld town id and map id, kept as metadata for the way back. */
  town?: string;
  map?: string;
  /**
   * DSK-6 annex: append more of the town after the generated street (same seed → the old street is
   * unchanged): house styles, civic buildings / offices, a ตลาดนัดมือสอง flea market (Chinese town) and
   * parked vehicles. Off by default so existing scenes regenerate byte-for-byte.
   */
  more?: boolean;
}

/** mulberry32 */
function rng(seed: number): () => number {
  let s = (Math.round(seed) ^ 0x2c1b3c6d) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W: Record<string, number> = {
  prop_bld_thai_house: 128, prop_bld_wat_sala: 128, prop_bld_noodle_shop: 128, prop_bld_shophouse_2f: 112,
  prop_bld_shophouse_3f: 112, prop_bld_shophouse_3f_gold: 112, prop_bld_shophouse_2f_closed: 112, prop_bld_fruit_stall: 96,
  prop_bld_mini_mart: 144, prop_bld_malay_house: 128, prop_bld_mosque_wooden: 176, prop_bld_roti_teashop: 128,
  prop_bld_halal_stall: 96, prop_bld_chinese_shrine: 80,
  prop_bld_house_thai_wood: 112, prop_bld_house_modern: 96, prop_bld_house_kampung: 112, prop_bld_shophouse_chinese: 112,
  prop_bld_shophouse_stationery: 112, prop_bld_shophouse_clothes: 112, prop_bld_hospital: 224, prop_bld_police: 160,
  prop_bld_post_office: 128, prop_bld_bank: 128, prop_bld_district_office: 192, prop_bld_company_office: 128,
  prop_bld_flea_clothes: 96, prop_bld_flea_clothes_red: 96, prop_bld_flea_junk: 96, prop_flea_banner: 160,
};

type Annex = { items: StreetItem[]; props: Array<{ part: string; dx: number; flipX?: boolean }> };
/** DSK-6 annex per town kind (dx = offset from the annex start; vehicles are drawn nose-right). */
const ANNEX: Partial<Record<TownKind, Annex>> = {
  thai_town: {
    items: ["prop_bld_house_thai_wood", "prop_bld_house_modern", "prop_bld_district_office", "prop_bld_police", "prop_bld_hospital"],
    props: [{ part: "prop_tuktuk", dx: 240 }, { part: "prop_songthaew", dx: 560, flipX: true }, { part: "prop_car_taxi", dx: 760 }],
  },
  chinese_town: {
    items: ["prop_bld_shophouse_chinese", "prop_bld_bank", "prop_bld_post_office", { part: "prop_flea_banner", gapBefore: 16 }, "prop_bld_flea_clothes", "prop_bld_flea_junk", "prop_bld_flea_clothes_red", { part: "prop_bld_police", gapBefore: 80 }, "prop_bld_hospital"],
    props: [{ part: "prop_car_pickup", dx: 140 }, { part: "prop_clothes_rack", dx: 852 }, { part: "prop_tuktuk", dx: 1060, flipX: true }, { part: "prop_scooter_teal", dx: 1100 }],
  },
  malay_kampung: {
    items: ["prop_bld_house_kampung", "prop_bld_shophouse_stationery", "prop_bld_post_office"],
    props: [{ part: "prop_scooter_teal", dx: 128 }],
  },
  rural_village: {
    items: [{ part: "prop_bld_house_thai_wood", gapBefore: 96 }, { part: "prop_bld_house_modern", gapBefore: 80 }, { part: "prop_bld_shophouse_clothes", gapBefore: 80 }, { part: "prop_bld_district_office", gapBefore: 96 }],
    props: [{ part: "prop_car_pickup", dx: 216 }, { part: "prop_songthaew", dx: 520, flipX: true }],
  },
};

/** Append the annex (when `spec.more`) after a street that ends at `end`. */
function withAnnex(spec: TownSceneSpec, items: StreetItem[], end: number): { items: StreetItem[]; props: ComposePropInput[]; w: number } {
  const a = spec.more ? ANNEX[spec.kind] : undefined;
  if (!a) return { items, props: [], w: 0 };
  return { items: [...items, ...a.items], props: a.props.map((p) => ({ part: p.part, x: end + p.dx, ...(p.flipX ? { flipX: true } : {}) })), w: widthOf(a.items) };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Fixed landmark + shuffled fillers (never the same building twice in a row). */
function row(r: () => number, landmark: string[], fill: string[], n: number, at = 0.4): string[] {
  const picked: string[] = [];
  let pool = shuffle(fill, r);
  while (picked.length < n) {
    if (!pool.length) pool = shuffle(fill, r);
    const b = pool.shift()!;
    if (picked[picked.length - 1] !== b) picked.push(b);
  }
  const pos = Math.max(1, Math.min(picked.length, Math.round(picked.length * at)));
  picked.splice(pos, 0, ...landmark);
  return picked;
}

const widthOf = (items: StreetItem[]) => items.reduce((a, it) => a + (W[typeof it === "string" ? it : it.part] ?? 96) + (typeof it === "string" ? 0 : (it.gapBefore ?? 0)), 0);

/** Scatter small props over [x0, x1) every ~step px, deterministic. */
function scatter(r: () => number, x0: number, x1: number, step: number, parts: string[]): ComposePropInput[] {
  const out: ComposePropInput[] = [];
  for (let x = x0 + 24; x < x1 - 24; x += step * (0.7 + r() * 0.6)) out.push({ part: parts[Math.floor(r() * parts.length)]!, x: Math.round(x), ...(r() < 0.4 ? { flipX: true } : {}) });
  return out;
}

export function townSceneInput(spec: TownSceneSpec): ComposeSceneInput & { exits: SceneExit[]; town: SceneTown } {
  const r = rng(spec.seed);
  const label = spec.name ? `${spec.name.th} · ${spec.name.en}` : spec.id;
  const exit = (side: SceneExit["side"]): SceneExit => ({ side, to: spec.map ?? "overworld", ...(spec.town ? { at: spec.town } : {}) });
  // The kampung street ends at the sea, so only its landward end leads back out.
  const exits: SceneExit[] = spec.kind === "malay_kampung" ? [exit("left")] : [exit("left"), exit("right")];
  const town: SceneTown = { kind: spec.kind, ...(spec.town ? { id: spec.town } : {}), ...(spec.map ? { map: spec.map } : {}), ...(spec.name ? { name: spec.name } : {}) };
  const lead = 64; // open street before the first building, so the player arrives in the clear
  const tiles = (px: number) => Math.ceil(px / 16);
  switch (spec.kind) {
    case "thai_town": {
      const base = row(r, ["prop_bld_wat_sala"], ["prop_bld_thai_house", "prop_bld_noodle_shop", "prop_bld_shophouse_2f", "prop_bld_shophouse_3f", "prop_bld_shophouse_3f_gold", "prop_bld_fruit_stall", "prop_bld_mini_mart"], 6);
      const w0 = widthOf(base);
      const ax = withAnnex(spec, base, lead + w0);
      const items = ax.items;
      const w = w0 + ax.w;
      const width = tiles(lead + w + 96);
      const poles: StreetItem[] = [{ part: "prop_power_pole_end", flipX: true }];
      for (let x = 240; x < w; x += 240) poles.push("prop_power_pole");
      poles.push("prop_power_pole_end");
      return {
        id: spec.id, name: label, width,
        layers: ["bg_sky_day", "bg_far_clouds", "bg_far_temple_hill", "bg_mid_tropical"],
        tileset: "tiles_street", terrain: { groundHeight: 3 },
        streets: [{ x: lead, items }, { x: lead, items: poles }],
        props: [...scatter(r, lead, lead + w0, 150, ["prop_street_dog", "prop_motorbike", "prop_potted_plants", "prop_flower_box", "prop_cat", "prop_lantern"]), { part: "prop_signpost_th", x: 8 }, { part: "prop_flag_pole", x: lead + w + 24 }, ...ax.props],
        exits, town,
      };
    }
    case "malay_kampung": {
      // halal food only: roti teashop + halal stall + fruit stall, no other food shops
      const base = row(r, ["prop_bld_mosque_wooden"], ["prop_bld_malay_house", "prop_bld_malay_house", "prop_bld_roti_teashop", "prop_bld_halal_stall", "prop_bld_fruit_stall"], 5, 0.5);
      const w0 = widthOf(base);
      const ax = withAnnex(spec, base, lead + w0);
      const items = ax.items;
      const w = w0 + ax.w;
      const beach = 320;
      const width = tiles(lead + w + beach);
      const pitX = tiles(lead + w + 96);
      return {
        id: spec.id, name: label, width,
        layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_tropical"],
        tileset: "tiles_street", terrain: { groundHeight: 3, pits: [{ x: pitX, width: width - pitX }] },
        streets: [{ x: lead, items }],
        props: [
          ...scatter(r, lead, lead + w0, 170, ["prop_potted_plants", "prop_flower_box", "prop_cat", "prop_motorbike"]),
          ...ax.props,
          { part: "prop_fish_rack", x: lead + w + 8 },
          { part: "prop_fisher_hut", x: (pitX - 2) * 16, y: 258 },
          { part: "prop_kolek_boat", x: (pitX + 5) * 16, y: 234 },
          { part: "prop_kolek_boat", x: (pitX + 11) * 16, y: 236, flipX: true, color: "#2a8a5c" },
        ],
        exits, town,
      };
    }
    case "chinese_town": {
      const base = row(r, ["prop_bld_chinese_shrine"], ["prop_bld_shophouse_2f", "prop_bld_shophouse_3f", "prop_bld_shophouse_3f_gold", "prop_bld_shophouse_2f_closed", "prop_bld_noodle_shop", "prop_bld_fruit_stall"], 6, 0.5);
      const w0 = widthOf(base);
      const ax = withAnnex(spec, base, lead + w0);
      const items = ax.items;
      const w = w0 + ax.w;
      const width = tiles(lead + w + 96);
      const lanterns: ComposePropInput[] = [];
      for (let x = lead + 20; x < lead + w0; x += 72) lanterns.push({ part: "prop_lantern", x });
      return {
        id: spec.id, name: label, width,
        layers: ["bg_sky_day", "bg_far_clouds", "bg_far_city_spires", "bg_mid_utility_poles"],
        tileset: "tiles_street", terrain: { groundHeight: 3 },
        streets: [{ x: lead, items }],
        props: [...lanterns, ...scatter(r, lead, lead + w0, 190, ["prop_potted_plants", "prop_cat", "prop_motorbike", "prop_flower_box"]), { part: "prop_signpost_th", x: 8 }, ...ax.props],
        exits, town,
      };
    }
    case "rural_village": {
      const fill = ["prop_bld_thai_house", "prop_bld_thai_house", "prop_bld_fruit_stall"];
      const base: StreetItem[] = shuffle(fill, r).map((part, i) => ({ part, gapBefore: i === 0 ? 0 : 96 + Math.round(r() * 64) }));
      const w0 = widthOf(base);
      const width0 = tiles(lead + w0 + 160);
      const ax = withAnnex(spec, base, lead + w0);
      const items = ax.items;
      const width = tiles(lead + w0 + ax.w + 160);
      const props: ComposePropInput[] = [];
      let x = lead;
      for (const [i, it] of items.entries()) {
        const o = it as { part: string; gapBefore?: number };
        x += o.gapBefore ?? 0;
        if (i < base.length) {
          props.push({ part: r() < 0.5 ? "prop_tree_oak" : "prop_street_tree", x: x - 64 - Math.round(r() * 16) });
          props.push({ part: "prop_fence", x: x - 48 });
        } else props.push({ part: i % 2 ? "prop_tree_oak" : "prop_street_tree", x: x - 72 }, { part: "prop_fence", x: x - 48 });
        x += W[o.part] ?? 96;
        if (i === base.length - 1) props.push(...scatter(r, 0, width0 * 16, 130, ["prop_bush", "prop_rock", "prop_flower_box", "prop_street_dog"]));
      }
      if (ax.w) props.push(...ax.props, ...scatter(r, width0 * 16, width * 16, 130, ["prop_bush", "prop_rock", "prop_flower_box"]));
      return {
        id: spec.id, name: label, width,
        layers: ["bg_sky_bright", "bg_far_mountains", "bg_mid_hills", "bg_near_bushes"],
        tileset: "tiles_grass", terrain: { groundHeight: 3 },
        streets: [{ x: lead, items }],
        props,
        exits, town,
      };
    }
    case "brick_city":
    default:
      return {
        id: spec.id, name: label, width: 0, height: 18,
        layers: ["bg_sky_bright", "bg_far_city_spires", "bg_mid_utility_poles"],
        tileset: "tiles_city_sidewalk", terrain: { groundHeight: 3 },
        streets: [{ x: lead, items: [], generate: { set: "brick_town", seed: spec.seed, count: 8 } }],
        exits, town,
      };
  }
}

/** Town input with the width fitted to the generated street plus open road at the far end. */
export function townInput(parts: readonly PartMeta[], spec: TownSceneSpec): ComposeSceneInput {
  const input = townSceneInput(spec);
  let endX = 0;
  for (const st of input.streets ?? []) endX = Math.max(endX, layoutStreet(parts, st, input.tileSize ?? 16).endX);
  const need = Math.ceil((endX + 96) / 16);
  if (spec.kind !== "malay_kampung" && (input.width ?? 0) < need) input.width = need;
  return input;
}

export function composeTown(parts: readonly PartMeta[], spec: TownSceneSpec, config?: EasySceneConfig) {
  return composeScene(parts, townInput(parts, spec), config);
}

export function isTownKind(k: unknown): k is TownKind {
  return typeof k === "string" && (TOWN_KINDS as readonly string[]).includes(k);
}

/** Town specs from an Easy Tilemap map JSON (`overworld.towns[]`), one per distinct scene id. */
export function townSpecsFromOverworld(map: { id?: string; overworld?: { towns?: Array<{ id: string; kind: string; scene: string; seed?: number; name?: { th: string; en: string; ms?: string }; more?: boolean }> } }): { specs: TownSceneSpec[]; warnings: string[] } {
  const specs: TownSceneSpec[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const [i, t] of (map.overworld?.towns ?? []).entries()) {
    if (!t?.scene || seen.has(t.scene)) continue;
    if (!isTownKind(t.kind)) { warnings.push(`Town ${t.id}: unknown kind ${JSON.stringify(t.kind)}`); continue; }
    seen.add(t.scene);
    specs.push({ id: t.scene, kind: t.kind, seed: typeof t.seed === "number" ? t.seed : 1000 + i, ...(t.name ? { name: t.name } : {}), town: t.id, ...(map.id ? { map: map.id } : {}), ...(t.more ? { more: true } : {}) });
  }
  if (!map.overworld) warnings.push("Map has no overworld block (generate one with `easytilemap generate overworld`)");
  return { specs, warnings };
}
