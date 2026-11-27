/** Town life (DSK-5): closed shop twins, seller-behind-counter metadata, interiors, transit parts, pixi shop data. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { explicitNightMask } from "../src/lib/pixelArt.js";
import { sampleDefs } from "../src/lib/sampleParts.js";
import { SHOP_FRONTS } from "../src/lib/sampleTownLife.js";
import { DEMO_INPUTS } from "../src/lib/demoScenes.js";
import { exportScene } from "../src/lib/export.js";
import { loadParts } from "../src/lib/workspace.js";
import { composeScene } from "../src/shared/scene.js";
import type { PartMeta, PropPart } from "../src/shared/types.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let parts: PartMeta[];
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  parts = await loadParts(root);
});
afterAll(() => cleanup());

const defs = () => new Map(sampleDefs().map((d) => [d.meta.id, d]));
const OPEN = Object.keys(SHOP_FRONTS);

describe("open / closed shop twins", () => {
  it("every shop front has a same-size closed twin and they point at each other", () => {
    const D = defs();
    for (const id of OPEN) {
      const o = D.get(id)!.meta as PropPart;
      const closed = o.shop?.closed;
      expect(closed, id).toBeTruthy();
      const c = D.get(closed!)!.meta as PropPart;
      expect(c.shop?.open).toBe(id);
      expect([c.width, c.height]).toEqual([o.width, o.height]);
      expect(c.defaultLayer).toBe("back");
    }
  });

  it.each(OPEN)("%s closed twin covers the front and loses its lit night pixels there", (id) => {
    const D = defs();
    const o = D.get(id)!;
    const c = D.get((o.meta as PropPart).shop!.closed!)!;
    const oi = o.draw();
    const ci = c.draw();
    const f = SHOP_FRONTS[id]!.front(oi.height);
    let changed = 0;
    let total = 0;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      total++;
      const k = (y * oi.width + x) * 4;
      if (oi.data[k] !== ci.data[k] || oi.data[k + 1] !== ci.data[k + 1] || oi.data[k + 2] !== ci.data[k + 2]) changed++;
    }
    expect(changed / total, id).toBeGreaterThan(0.5);
    const lit = (img: typeof oi) => {
      const m = explicitNightMask(img);
      let n = 0;
      if (!m) return 0;
      for (let y = f.y + 4; y < f.y + f.h - 2; y++) for (let x = f.x + 2; x < f.x + f.w - 2; x++) if (m.data[(y * m.width + x) * 4 + 1]! || m.data[(y * m.width + x) * 4 + 2]!) n++;
      return n;
    };
    expect(lit(ci), id).toBeLessThanOrEqual(lit(oi));
  });

  it("stalls carry a counter line and a seller spot behind it", () => {
    const D = defs();
    for (const id of ["prop_bld_fruit_stall", "prop_bld_halal_stall", "prop_bld_market_stall"]) {
      const s = (D.get(id)!.meta as PropPart).shop!;
      expect(s.counterTop, id).toBeGreaterThan(30);
      expect(s.seller!.y, id).toBeGreaterThan(s.counterTop!);
    }
    const halal = D.get("prop_bld_halal_stall")!.meta as PropPart;
    expect(halal.tags).toContain("halal");
  });
});

describe("interiors and transit", () => {
  const INTERIOR = ["shop_interior", "station_hall", "station_platform", "airport_terminal", "airport_apron", "market_day"];
  it.each(INTERIOR)("%s composes with no warnings", (id) => {
    const input = DEMO_INPUTS.find((d) => d.id === id)!;
    const { warnings } = composeScene(parts, input);
    expect(warnings).toEqual([]);
  });

  it("counters are front-layer props with the seller standing behind them", () => {
    const D = defs();
    for (const id of ["prop_int_grocery_counter", "prop_int_station_counter", "prop_int_airport_counter"]) {
      const m = D.get(id)!.meta as PropPart;
      expect(m.defaultLayer, id).toBe("front");
      expect(m.shop?.counterTop).toBe(0);
      expect(m.shop?.seller?.x).toBe(Math.round(m.width / 2));
    }
  });

  it("town-life parts stay secular: no temple / monk / sacred tags", () => {
    for (const d of sampleDefs()) {
      if (!(d.meta.tags ?? []).includes("town-life") && !(d.meta.tags ?? []).includes("interior")) continue;
      for (const bad of ["temple", "monk", "prayer", "quran", "buddha"]) expect(d.meta.tags, d.meta.id).not.toContain(bad);
    }
  });
});

describe("pixi export", () => {
  it("market_day exports both images per shop, the counter line and the seller spot; the loader can swap them", async () => {
    const input = DEMO_INPUTS.find((d) => d.id === "market_day")!;
    const { scene } = composeScene(parts, input);
    const res = await exportScene(root, { scene, preset: "pixi", dir: path.join(root, "tl"), night: true });
    for (const file of ["market_day.pixi.json", "market_day_night.pixi.json"]) {
      const json = JSON.parse(await readFile(path.join(res.dir, file), "utf8"));
      const shops = json.props.filter((p: { shop?: unknown }) => p.shop);
      expect(shops.length).toBe(5);
      const market = shops.find((p: { part: string }) => p.part === "prop_bld_market_stall");
      expect(market.shop.open).toBe(true);
      expect(market.shop.closedImage).toMatch(/prop_bld_market_stall_closed/);
      expect(market.shop.counterTop).toBe(52);
      expect(market.shop.seller.y).toBeGreaterThan(market.y + 52);
      const shut = shops.find((p: { part: string }) => p.part === "prop_bld_noodle_shop_closed");
      expect(shut.shop.open).toBe(false);
      expect(shut.shop.openPart).toBe("prop_bld_noodle_shop");
    }
    const loader = await readFile(path.join(res.dir, "load-scene.js"), "utf8");
    expect(loader).toContain("setShopOpen");
    expect(loader).toContain("counterFronts");
  });
});
