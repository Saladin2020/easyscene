import { describe, expect, it } from "vitest";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { normalizeScene } from "../src/shared/scene.js";
import { composeTown, TOWN_KINDS, townSpecsFromOverworld } from "../src/shared/townGen.js";

const parts = sampleDefs().map((d) => d.meta);
const has = (ids: string[], id: string) => ids.includes(id);

describe("town scene presets (overworld towns)", () => {
  it.each(TOWN_KINDS)("%s composes with no warnings, exits back to the overworld and the street inside the map", (kind) => {
    const { scene, warnings } = composeTown(parts, { id: `t_${kind}`, kind, seed: 3, town: "x", map: "world", name: { th: "ทดสอบ", en: "Test" } });
    expect(warnings).toEqual([]);
    expect(scene.exits?.map((e) => e.side)).toEqual(kind === "malay_kampung" ? ["left"] : ["left", "right"]);
    expect(scene.exits?.every((e) => e.to === "world" && e.at === "x")).toBe(true);
    expect(scene.town).toMatchObject({ kind, id: "x", map: "world" });
    expect(scene.name).toBe("ทดสอบ · Test");
    const mapW = scene.width * scene.tileSize;
    const blds = scene.props.filter((p) => p.part.startsWith("prop_bld_"));
    expect(blds.length).toBeGreaterThanOrEqual(3);
    for (const p of blds) expect(p.x + 64).toBeLessThanOrEqual(mapW);
    // the arrival point at the left edge is open street, not inside a building
    expect(Math.min(...blds.map((p) => p.x))).toBeGreaterThanOrEqual(48);
  });

  it("is deterministic per seed", () => {
    const a = composeTown(parts, { id: "a", kind: "thai_town", seed: 9 }).scene;
    const b = composeTown(parts, { id: "a", kind: "thai_town", seed: 9 }).scene;
    const c = composeTown(parts, { id: "a", kind: "thai_town", seed: 10 }).scene;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.props)).not.toBe(JSON.stringify(c.props));
  });

  it("keeps each culture's landmarks; the kampung sells halal food only and ends at the sea", () => {
    const ids = (kind: (typeof TOWN_KINDS)[number]) => composeTown(parts, { id: "k", kind, seed: 1 }).scene.props.map((p) => p.part);
    const kampung = ids("malay_kampung");
    expect(has(kampung, "prop_bld_mosque_wooden")).toBe(true);
    expect(has(kampung, "prop_bld_malay_house")).toBe(true);
    expect(has(kampung, "prop_bld_noodle_shop")).toBe(false);
    expect(has(kampung, "prop_kolek_boat")).toBe(true);
    const k = composeTown(parts, { id: "k", kind: "malay_kampung", seed: 1 }).scene;
    expect(k.tiles.at(-1)!.endsWith(".")).toBe(true);
    expect(has(ids("thai_town"), "prop_bld_wat_sala")).toBe(true);
    expect(has(ids("chinese_town"), "prop_bld_chinese_shrine")).toBe(true);
    expect(ids("brick_city").some((p) => p.startsWith("prop_bld_brick_"))).toBe(true);
    expect(has(ids("rural_village"), "prop_bld_thai_house")).toBe(true);
  });

  it("exits and town metadata survive normalizeScene; bad exits are dropped with a warning", () => {
    const { scene } = composeTown(parts, { id: "n", kind: "rural_village", seed: 2, town: "t1" });
    const again = normalizeScene(parts, scene).scene;
    expect(again.exits).toEqual(scene.exits);
    expect(again.town).toEqual(scene.town);
    const bad = normalizeScene(parts, { ...scene, exits: [{ side: "up", to: "" } as never] });
    expect(bad.scene.exits).toBeUndefined();
    expect(bad.warnings.join("\n")).toMatch(/exit/i);
  });

  it("reads town specs from an Easy Tilemap overworld map, one per scene", () => {
    const { specs, warnings } = townSpecsFromOverworld({
      id: "world",
      overworld: {
        towns: [
          { id: "a", kind: "malay_kampung", scene: "town_a", seed: 5, name: { th: "ก", en: "A", ms: "A" } },
          { id: "b", kind: "thai_town", scene: "town_a" },
          { id: "c", kind: "castle", scene: "town_c" },
        ],
      },
    });
    expect(specs).toEqual([{ id: "town_a", kind: "malay_kampung", seed: 5, name: { th: "ก", en: "A", ms: "A" }, town: "a", map: "world" }]);
    expect(warnings.join("\n")).toMatch(/castle/);
  });
});

describe("town annex (DSK-6 `more`)", () => {
  const parts = sampleDefs().map((d) => d.meta);
  const kinds = ["thai_town", "chinese_town", "malay_kampung", "rural_village"] as const;
  it.each(kinds)("%s: keeps the old street and appends houses / civic buildings / vehicles", (kind) => {
    const spec = { id: `t_${kind}`, kind, seed: 211353, town: "t", map: "world" };
    const a = composeTown(parts, spec).scene!;
    const b = composeTown(parts, { ...spec, more: true }).scene!;
    expect(b.width).toBeGreaterThan(a.width);
    const key = (p: { part: string; x: number }) => `${p.part}@${p.x}`;
    const bKeys = new Set(b.props.map(key));
    for (const p of a.props.filter((p) => !p.part.startsWith("prop_bld_") || p.x < a.width * 16 - 200)) {
      if (["prop_flag_pole", "prop_power_pole_end", "prop_power_pole", "prop_fish_rack", "prop_fisher_hut", "prop_kolek_boat"].includes(p.part)) continue; // end-of-street props move
      if (kind === "rural_village" && !p.part.startsWith("prop_bld_")) continue; // scatter spans the whole (wider) village
      expect(bKeys.has(key(p)), `${kind} keeps ${key(p)}`).toBe(true);
    }
    const added = b.props.map((p) => p.part).filter((p) => !a.props.some((q) => q.part === p));
    expect(added.some((p) => /house_|shophouse_|hospital|police|post_office|bank|district|flea/.test(p)), kind).toBe(true);
    expect(added.some((p) => /car_|tuktuk|songthaew|scooter/.test(p)), kind).toBe(true);
    for (const p of b.props) expect(p.x + 1, `${p.part} inside`).toBeLessThan(b.width * 16);
  });
  it("Chinese town gets the ตลาดนัดมือสอง with its sellers' stalls", () => {
    const b = composeTown(parts, { id: "c", kind: "chinese_town", seed: 5, more: true }).scene!;
    const ids = b.props.map((p) => p.part);
    for (const p of ["prop_flea_banner", "prop_bld_flea_clothes", "prop_bld_flea_junk", "prop_bld_flea_clothes_red", "prop_clothes_rack", "prop_bld_hospital", "prop_bld_police"]) expect(ids).toContain(p);
  });
  it("overworld towns can opt in per town", () => {
    const { specs } = townSpecsFromOverworld({ id: "w", overworld: { towns: [{ id: "a", kind: "thai_town", scene: "sa", more: true }, { id: "b", kind: "thai_town", scene: "sb" }] } });
    expect(specs.map((s) => !!s.more)).toEqual([true, false]);
  });
});
