import { describe, expect, it } from "vitest";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { ANCHOR_OVERLAP, composeScene, mostCommonSurface } from "../src/shared/scene.js";

const parts = sampleDefs().map((d) => d.meta);

describe("composeScene", () => {
  it("drops unknown or wrong-kind parts with warnings instead of failing", () => {
    const { scene, warnings } = composeScene(parts, {
      id: "t",
      layers: ["bg_sky_day", "no_such_layer", "prop_house"],
      tileset: "nope",
      props: [{ part: "bg_sky_day", x: 0 }, { part: "prop_sign", x: 10 }],
    });
    expect(scene.layers.map((l) => l.part)).toEqual(["bg_sky_day"]);
    expect(scene.tileset).toBe("tiles_grass");
    expect(scene.props.map((p) => p.part)).toEqual(["prop_sign"]);
    expect(warnings.join("\n")).toMatch(/no_such_layer/);
    expect(warnings.join("\n")).toMatch(/prop_house/);
    expect(warnings.join("\n")).toMatch(/Tileset "nope"/);
  });

  it("caps layers at 5 and clamps scroll factors", () => {
    const ids = ["bg_sky_day", "bg_far_clouds", "bg_far_mountains", "bg_mid_hills", "bg_mid_forest", "bg_near_bushes"];
    const { scene, warnings } = composeScene(parts, { id: "t", layers: [{ part: ids[0]!, scroll: 3 }, ...ids.slice(1)] });
    expect(scene.layers).toHaveLength(5);
    expect(scene.layers[0]!.scroll).toBe(1);
    expect(warnings.some((w) => w.includes("max 5"))).toBe(true);
  });

  it("snaps props without y onto the ground under their centre", () => {
    const { scene } = composeScene(parts, {
      id: "t",
      width: 20,
      height: 10,
      terrain: { groundHeight: 2, hills: [{ x: 10, width: 4, height: 2 }] },
      props: [{ part: "prop_sign", x: 16 }, { part: "prop_sign", x: 12 * 16 }],
    });
    expect(scene.props[0]!.y).toBe(8 * 16);
    expect(scene.props[1]!.y).toBe(6 * 16); // on the plateau
  });

  it("anchors non-sky layers to the ground line unless offsetY is given", () => {
    const { scene } = composeScene(parts, {
      id: "t",
      height: 17,
      terrain: { groundHeight: 3 },
      layers: ["bg_sky_day", "bg_mid_forest", { part: "bg_near_bushes", offsetY: 0 }],
    });
    const ground = mostCommonSurface(scene.tiles, 16);
    expect(ground).toBe(14 * 16);
    expect(scene.layers[0]!.offsetY).toBeUndefined();
    expect(scene.layers[1]!.offsetY).toBe(ground - 17 * 16 + ANCHOR_OVERLAP);
    expect(scene.layers[2]!.offsetY).toBeUndefined();
  });

  it("rejects bad colours but keeps valid hex normalized", () => {
    const { scene, warnings } = composeScene(parts, {
      id: "t",
      layers: [{ part: "bg_far_mountains", color: "7D3F6A", tint: "orange" }],
    });
    expect(scene.layers[0]!.color).toBe("#7d3f6a");
    expect(scene.layers[0]!.tint).toBeUndefined();
    expect(warnings.join()).toMatch(/bad tint/);
  });
});
