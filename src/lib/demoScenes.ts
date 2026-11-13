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
];

export function demoScenes(parts: PartMeta[] = sampleDefs().map((d) => d.meta)): SceneDoc[] {
  return DEMO_INPUTS.map((input) => composeScene(parts, input).scene);
}
