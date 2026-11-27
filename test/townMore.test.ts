/** DSK-6: vehicles, house styles, civic buildings / offices and the ตลาดนัดมือสอง flea market. */
import { describe, expect, it } from "vitest";
import { nightMaskImage } from "../src/lib/pixelArt.js";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { DEMO_INPUTS } from "../src/lib/demoScenes.js";
import { THAI_SIGNS } from "../src/lib/thaiSignText.js";
import type { PropPart } from "../src/shared/types.js";

const defs = sampleDefs().filter((d) => (d.meta as PropPart).tags?.includes("dsk6"));
const byId = new Map(sampleDefs().map((d) => [d.meta.id, d]));
const meta = (id: string) => byId.get(id)!.meta as PropPart;

const VEHICLES = ["prop_car_pickup", "prop_tuktuk", "prop_scooter_teal", "prop_songthaew", "prop_bus_city", "prop_truck_cargo", "prop_car_taxi"];
const HOUSES = ["prop_bld_house_thai_wood", "prop_bld_house_modern", "prop_bld_house_kampung", "prop_bld_shophouse_chinese", "prop_bld_shophouse_stationery", "prop_bld_shophouse_clothes"];
const CIVIC = ["prop_bld_hospital", "prop_bld_police", "prop_bld_post_office", "prop_bld_bank", "prop_bld_district_office", "prop_bld_company_office"];
const FLEA = ["prop_bld_flea_clothes", "prop_bld_flea_clothes_red", "prop_bld_flea_junk", "prop_clothes_rack", "prop_flea_banner"];

describe("DSK-6 asset set", () => {
  it("has every requested part, drawn at its declared size with solid pixels", () => {
    expect(defs.map((d) => d.meta.id).sort()).toEqual([...VEHICLES, ...HOUSES, ...CIVIC, ...FLEA].sort());
    for (const d of defs) {
      const img = d.draw();
      const m = d.meta as PropPart;
      expect([img.width, img.height], m.id).toEqual([m.width, m.height]);
      let opaque = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i]) opaque++;
      expect(opaque / (img.width * img.height), m.id).toBeGreaterThan(0.25);
    }
  });

  it("vehicles face right (headlight on the right half, tail light on the left) and declare it", () => {
    for (const id of VEHICLES) {
      expect(meta(id).facing, id).toBe("right");
      const img = byId.get(id)!.draw();
      let warmX = 0, warm = 0, redX = 0, red = 0;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const [r, g, b] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
        if (r === 0xff && g === 0xf8 && b === 0xdc) { warmX += x; warm++; } // WARM[4] headlight
        if (r === 0xe8 && g === 0x60 && b === 0x4a) { redX += x; red++; } // RED[4] tail light
      }
      expect(warm, `${id} headlight`).toBeGreaterThan(0);
      expect(warmX / warm, id).toBeGreaterThan(img.width / 2);
      if (red) expect(redX / red, id).toBeLessThan(img.width / 2);
    }
  });

  it("buildings are modular (16 px footprint) and light their windows at night", () => {
    for (const id of [...HOUSES, ...CIVIC, "prop_bld_flea_clothes", "prop_bld_flea_junk"]) {
      const m = meta(id);
      expect(m.category, id).toBe("building");
      expect(m.width % 16, id).toBe(0);
      const img = byId.get(id)!.draw();
      if (!id.startsWith("prop_bld_flea")) expect(nightMaskImage(img), `${id} night mask`).toBeDefined();
    }
  });

  it("flea market stalls put the seller behind the table (counterTop + seller)", () => {
    for (const id of ["prop_bld_flea_clothes", "prop_bld_flea_clothes_red", "prop_bld_flea_junk"]) {
      expect(meta(id).shop, id).toMatchObject({ counterTop: 50, seller: { x: 48, y: 72 } });
      expect(meta(id).tags).toContain("flea-market");
    }
  });

  it("signs are Thai words in Thai script", () => {
    for (const k of ["hospital", "police", "post", "bank", "district", "company", "flea", "clothes", "fabric", "stationery"] as const) {
      expect(THAI_SIGNS[k].text, k).toMatch(/^[\u0E00-\u0E7F ]+$/);
      expect(THAI_SIGNS[k].rows.length).toBe(THAI_SIGNS[k].height);
    }
  });

  it("demo scenes place the new parts", () => {
    for (const [id, parts] of [["flea_market", ["prop_bld_flea_clothes", "prop_bld_flea_junk", "prop_flea_banner"]], ["civic_street", CIVIC], ["houses_street", HOUSES]] as const) {
      const d = DEMO_INPUTS.find((x) => x.id === id)!;
      const used = [...(d.streets ?? []).flatMap((s) => s.items), ...(d.props ?? []).map((p) => p.part)];
      for (const p of parts) expect(used, `${id} uses ${p}`).toContain(p);
    }
  });
});
