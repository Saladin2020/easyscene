import { describe, expect, it } from "vitest";
import { BUILDING_INTERIORS, interiorOf } from "../src/shared/buildingInteriors.js";
import { sampleDefs } from "../src/lib/sampleParts.js";
import type { PropPart } from "../src/shared/types.js";

describe("building interiors catalog", () => {
  it("maps shops, houses and civic buildings, and leaves stalls and religious buildings alone", () => {
    expect(interiorOf("prop_bld_noodle_shop")?.scene).toBe("int_noodle");
    expect(interiorOf("prop_bld_roti_teashop")?.halal).toBe(true);
    expect(interiorOf("prop_bld_shophouse_grocery")?.scene).toBe("shop_interior");
    expect(interiorOf("prop_bld_hospital")?.scene).toBe("int_hospital");
    expect(interiorOf("prop_bld_house_thai_wood")?.kind).toBe("house");
    expect(interiorOf("prop_bld_malay_house")?.type).toBe("house_teal");
    expect(interiorOf("prop_bld_fruit_stall")).toBeUndefined();
    expect(interiorOf("prop_bld_halal_stall")).toBeUndefined();
    expect(interiorOf("prop_bld_wat_sala")).toBeUndefined();
    expect(interiorOf("prop_bld_mosque_wooden")).toBeUndefined();
    expect(interiorOf("prop_bld_chinese_shrine")).toBeUndefined();
    expect(BUILDING_INTERIORS.length).toBeGreaterThanOrEqual(18);
  });

  it("stamps interior on open building samples, not on closed twins or stalls", () => {
    const byId = new Map(sampleDefs().map((d) => [d.meta.id, d.meta as PropPart]));
    expect(byId.get("prop_bld_noodle_shop")!.interior).toBe("int_noodle");
    expect(byId.get("prop_bld_hospital")!.interior).toBe("int_hospital");
    expect(byId.get("prop_bld_shophouse_grocery")!.interior).toBe("shop_interior");
    expect(byId.get("prop_bld_house_modern")!.interior).toBe("int_house_modern");
    expect(byId.get("prop_bld_noodle_shop_closed")!.interior).toBeUndefined();
    expect(byId.get("prop_bld_fruit_stall")!.interior).toBeUndefined();
    expect(byId.get("prop_bld_wat_sala")!.interior).toBeUndefined();
  });
});
