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
];

export function demoScenes(parts: PartMeta[] = sampleDefs().map((d) => d.meta)): SceneDoc[] {
  return DEMO_INPUTS.map((input) => composeScene(parts, input).scene);
}
