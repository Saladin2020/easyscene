import { composeScene, type ComposeSceneInput } from "../shared/scene.js";
import type { PartMeta, SceneDoc } from "../shared/types.js";
import { sampleDefs } from "./sampleParts.js";

/** Demo recipes seeded into scenes/ on first run. Reused by tests and smoke scripts. */
export const DEMO_INPUTS: ComposeSceneInput[] = [
  {
    id: "village_day",
    name: "Village · day",
    width: 60,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_far_mountains", "bg_mid_hills", "bg_near_bushes"],
    tileset: "tiles_grass",
    terrain: {
      groundHeight: 3,
      hills: [{ x: 36, width: 8, height: 2 }],
      platforms: [{ x: 14, y: 4, length: 5 }],
    },
    props: [
      { part: "prop_house", x: 64 },
      { part: "prop_lantern", x: 156 },
      { part: "prop_fence", x: 176 },
      { part: "prop_tree_oak", x: 330 },
      { part: "prop_sign", x: 520 },
      { part: "prop_tree_oak", x: 600, flipX: true },
      { part: "prop_house", x: 740, color: "#3d6fa8" },
      { part: "prop_bush", x: 900 },
    ],
  },
  {
    id: "misty_ruins",
    name: "Misty ruins",
    width: 48,
    layers: [
      { part: "bg_sky_day", color: "#9aa3b8" },
      { part: "bg_far_mountains", tint: "#c8d0e0", tintAmount: 0.4 },
      { part: "bg_mid_forest", color: "#4a6670" },
    ],
    tileset: "tiles_stone",
    terrain: { groundHeight: 4, pits: [{ x: 20, width: 3 }], platforms: [{ x: 19, y: 3, length: 5 }, { x: 30, y: 5, length: 4 }] },
    props: [
      { part: "prop_rock", x: 90 },
      { part: "prop_tree_pine", x: 200 },
      { part: "prop_sign", x: 420 },
    ],
  },
  {
    id: "lantern_night",
    name: "Lantern night",
    width: 56,
    layers: [
      "bg_sky_night",
      { part: "bg_far_mountains", tint: "#3a4a8a", tintAmount: 0.55 },
      { part: "bg_mid_forest", tint: "#2a3a6a", tintAmount: 0.6 },
      { part: "bg_near_bushes", tint: "#2a3a6a", tintAmount: 0.55 },
    ],
    tileset: "tiles_grass_night",
    terrain: { groundHeight: 3, hills: [{ x: 30, width: 6, height: 2 }], pits: [{ x: 22, width: 3 }], platforms: [{ x: 21, y: 3, length: 5 }] },
    props: [
      { part: "prop_tree_pine", x: 30, tint: "#2a3a6a", tintAmount: 0.55 },
      { part: "prop_lantern", x: 100 },
      { part: "prop_house", x: 128, tint: "#5a6aa0", tintAmount: 0.45 },
      { part: "prop_lantern", x: 222 },
      { part: "prop_fence", x: 250, tint: "#3a4a8a", tintAmount: 0.5 },
      { part: "prop_rock", x: 420, tint: "#3a4a8a", tintAmount: 0.5 },
      { part: "prop_lantern", x: 520 },
      { part: "prop_tree_oak", x: 640, tint: "#2a3a6a", tintAmount: 0.55 },
      { part: "prop_sign", x: 720, tint: "#3a4a8a", tintAmount: 0.5 },
      { part: "prop_lantern", x: 760 },
      { part: "prop_bush", x: 800, tint: "#2a3a6a", tintAmount: 0.55 },
    ],
  },
  {
    id: "thai_village_street",
    name: "Thai village street",
    width: 88,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_far_temple_hill", "bg_mid_tropical"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3, pits: [{ x: 70, width: 18 }] },
    streets: [
      {
        x: 0,
        items: [
          "prop_bld_thai_house",
          "prop_bld_fruit_stall",
          "prop_bld_noodle_shop",
          "prop_bld_shophouse_2f",
          "prop_bld_shophouse_3f",
          "prop_bld_shophouse_3f_gold",
          "prop_bld_shophouse_2f_closed",
          "prop_bld_mini_mart",
        ],
      },
      // power poles every 240 px: wires meet at the sprite edges, so the run is continuous;
      // the end-of-line pole closes it (flipped at the start)
      { x: 0, items: [{ part: "prop_power_pole_end", flipX: true }, "prop_power_pole", "prop_power_pole", "prop_power_pole_end"] },
    ],
    props: [
      { part: "prop_street_dog", x: 300 },
      { part: "prop_motorbike", x: 404 },
      { part: "prop_potted_plants", x: 470 },
      { part: "prop_flower_box", x: 592 },
      { part: "prop_cat", x: 742 },
      { part: "prop_potted_plants", x: 812 },
      { part: "prop_flower_box", x: 900 },
      { part: "prop_flag_pole", x: 958 },
      { part: "prop_signpost_th", x: 1000 },
      { part: "prop_lantern", x: 1060 },
      { part: "prop_pier", x: 1120 },
      { part: "prop_canal_boat", x: 1236, y: 238 },
    ],
  },
  // ---- town life (DSK-5): walk-in interiors (the seller / clerk stands behind a front-layer counter), transit
  {
    id: "shop_interior",
    name: "Shop interior · ร้านโชห่วย",
    width: 30,
    layers: ["bg_sky_day"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    props: [
      { part: "prop_int_grocery", x: 0 },
      { part: "prop_int_grocery_counter", x: 176 },
    ],
  },
  {
    id: "station_hall",
    name: "Station hall · ขายตั๋ว",
    width: 30,
    layers: ["bg_sky_day"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    props: [
      { part: "prop_int_station", x: 0 },
      { part: "prop_int_station_counter", x: 131 },
    ],
  },
  {
    id: "station_platform",
    name: "Station platform · ชานชาลา",
    width: 30,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_tropical"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    props: [
      { part: "prop_rail_track", x: 0, y: 214 },
      { part: "prop_platform_canopy", x: 0 },
      { part: "prop_flower_box", x: 300 },
    ],
  },
  {
    id: "airport_terminal",
    name: "Airport terminal · เช็กอิน",
    width: 30,
    layers: ["bg_sky_day"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    props: [
      { part: "prop_int_airport", x: 0 },
      { part: "prop_int_airport_counter", x: 60 },
    ],
  },
  {
    id: "airport_apron",
    name: "Airport · ท่าอากาศยาน",
    width: 40,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_hills"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    props: [
      { part: "prop_control_tower", x: 16 },
      { part: "prop_bld_airport_terminal", x: 80 },
      { part: "prop_plane_side", x: 340 },
      { part: "prop_runway_marks", x: 0, y: 236 },
      { part: "prop_runway_marks", x: 480, y: 236 },
      { part: "prop_plane_sky", x: 520, y: 60 },
    ],
  },
  {
    // ตลาดนัด: a market-day row of stalls; sellers stand behind the tables (counterTop split)
    id: "market_day",
    name: "Market day · ตลาดนัด",
    width: 40,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_tropical"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    streets: [{ x: 16, gap: 16, items: ["prop_bld_market_stall", "prop_bld_halal_stall", "prop_bld_fruit_stall", "prop_bld_market_stall_closed", "prop_bld_noodle_shop_closed"] }],
    props: [
      { part: "prop_motorbike", x: 560 },
      { part: "prop_street_dog", x: 300 },
    ],
  },
  {
    // DSK-6 ตลาดนัดมือสอง: second-hand clothes on rails, a junk stall, racks and a banner; sellers stand behind the tables
    id: "flea_market",
    name: "Flea market · ตลาดนัดมือสอง",
    width: 52,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_tropical"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    streets: [{ x: 176, gap: 16, items: ["prop_bld_flea_clothes", "prop_bld_flea_junk", "prop_bld_flea_clothes_red", "prop_bld_flea_clothes"] }],
    props: [
      { part: "prop_flea_banner", x: 8 },
      { part: "prop_clothes_rack", x: 632 },
      { part: "prop_tuktuk", x: 690 },
      { part: "prop_scooter_teal", x: 770 },
    ],
  },
  {
    // DSK-6 civic street: hospital, police station, post office, bank, district office, company office + traffic
    id: "civic_street",
    name: "Civic street · โรงพยาบาล สถานีตำรวจ ไปรษณีย์",
    width: 72,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_hills"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    streets: [{ x: 0, gap: 16, items: ["prop_bld_hospital", "prop_bld_police", "prop_bld_post_office", "prop_bld_bank", "prop_bld_district_office", "prop_bld_company_office"] }],
    props: [
      { part: "prop_car_taxi", x: 150 },
      { part: "prop_bus_city", x: 520 },
      { part: "prop_car_pickup", x: 900 },
    ],
  },
  {
    // DSK-6 houses: Thai wooden stilt house, modern house, Malay kampung house, Chinese shophouse, shophouse variants
    id: "houses_street",
    name: "Houses · เรือนไทย บ้านสมัยใหม่ rumah kampung ตึกแถว",
    width: 62,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_mid_tropical"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3 },
    streets: [{ x: 0, gap: 16, items: ["prop_bld_house_thai_wood", "prop_bld_house_modern", "prop_bld_house_kampung", "prop_bld_shophouse_chinese", "prop_bld_shophouse_stationery", "prop_bld_shophouse_clothes"] }],
    props: [
      { part: "prop_songthaew", x: 4 },
      { part: "prop_scooter_teal", x: 640 },
      { part: "prop_truck_cargo", x: 752 },
      { part: "prop_tuktuk", x: 916 },
    ],
  },
  {
    // Multicultural village: the wat, the Chinese-Thai shrine and the mosque share one street;
    // the road runs on past the kampung to a fishing beach with kolek boats.
    id: "harmony_town",
    name: "Harmony town · วัด มัสยิด ศาลเจ้า",
    width: 112,
    layers: ["bg_sky_day", "bg_far_clouds", "bg_far_temple_hill", "bg_mid_tropical"],
    tileset: "tiles_street",
    terrain: { groundHeight: 3, pits: [{ x: 92, width: 20 }] },
    streets: [
      {
        x: 0,
        items: [
          "prop_bld_wat_sala",
          "prop_bld_chinese_shrine",
          "prop_bld_noodle_shop",
          "prop_bld_roti_teashop",
          "prop_bld_halal_stall",
          "prop_bld_fruit_stall",
          "prop_bld_malay_house",
          "prop_bld_mosque_wooden",
        ],
      },
    ],
    props: [
      { part: "prop_flower_box", x: 134 },
      { part: "prop_street_dog", x: 230 },
      { part: "prop_motorbike", x: 470 },
      { part: "prop_cat", x: 620 },
      { part: "prop_potted_plants", x: 700 },
      { part: "prop_lantern", x: 1150 },
      { part: "prop_flag_pole", x: 1170 },
      { part: "prop_fish_rack", x: 1290 },
      { part: "prop_signpost_th", x: 1400 },
      { part: "prop_fisher_hut", x: 1480, y: 258 },
      { part: "prop_kolek_boat", x: 1600, y: 234 },
      { part: "prop_kolek_boat", x: 1690, y: 236, flipX: true, color: "#2a8a5c" },
    ],
  },
  {
    // Brick town: a terrace of 19th-century style brick rowhouses and shops on a city street.
    // The first nine buildings are listed by hand; `generate` appends six more from seed 2026 and
    // dresses the whole row (trees, lamps, hydrant, planters, bus stop, parked cars, road strip).
    // Change the seed for a different street; any rowhouse chains with any other.
    id: "brick_street",
    name: "Brick street",
    width: 73,
    height: 18,
    layers: ["bg_sky_bright", "bg_far_city_spires", "bg_mid_utility_poles"],
    tileset: "tiles_city_sidewalk",
    terrain: { groundHeight: 3 },
    streets: [
      {
        x: 0,
        items: [
          "prop_bld_brick_row2_red",
          "prop_bld_brick_row3_brown",
          "prop_bld_brick_shop_red",
          "prop_bld_brick_row3_cream_bay",
          "prop_bld_brick_row4_tan",
          "prop_bld_brick_shop_teal",
          "prop_bld_brick_row2_brown",
          "prop_bld_brick_row3_red_bay",
          "prop_bld_brick_shop_cream",
        ],
        generate: { set: "brick_town", seed: 2026, count: 6 },
      },
    ],
  },
];

export function demoScenes(parts: PartMeta[] = sampleDefs().map((d) => d.meta)): SceneDoc[] {
  return DEMO_INPUTS.map((input) => composeScene(parts, input).scene);
}
