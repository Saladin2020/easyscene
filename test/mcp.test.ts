import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { access, readFile, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasySceneMcp } from "../src/mcp/server.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const server = createEasySceneMcp(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});

const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);

describe("MCP server", () => {
  it("lists every tool and the operator prompt", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([...MCP_TOOL_NAMES].sort());
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toContain("easyscene-operator");
  });

  it("composes, previews and exports a scene end to end", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.tileSize).toBe(16);
    const bgs = body(await client.callTool({ name: "list_parts", arguments: { kind: "background", band: "sky" } }));
    expect(bgs.parts.every((p: { band: string }) => p.band === "sky")).toBe(true);

    const composed = body(
      await client.callTool({
        name: "compose_scene",
        arguments: {
          id: "mcp_forest",
          layers: ["bg_sky_dusk", "bg_mid_forest", "made_up_layer"],
          terrain: { groundHeight: 3, platforms: [{ x: 5, y: 3, length: 3 }] },
          props: [{ part: "prop_tree_oak", x: 64 }],
        },
      }),
    );
    expect(composed.scene.layers).toBe(2);
    expect(composed.warnings.join()).toMatch(/made_up_layer/);

    const preview = await client.callTool({ name: "render_preview", arguments: { id: "mcp_forest", mode: "parallax" } });
    const content = preview.content as Array<{ type: string; mimeType?: string }>;
    expect(content.some((c) => c.type === "image" && c.mimeType === "image/png")).toBe(true);

    const exported = body(await client.callTool({ name: "export_scene", arguments: { id: "mcp_forest", preset: "godot" } }));
    expect(exported.paths.some((p: string) => p.endsWith("mcp_forest.tscn"))).toBe(true);
    for (const p of exported.paths) await access(p);

    const scenes = body(await client.callTool({ name: "list_scenes", arguments: {} }));
    expect(scenes.scenes.map((s: { id: string }) => s.id)).toContain("mcp_forest");
    const got = body(await client.callTool({ name: "get_scene", arguments: { id: "mcp_forest" } }));
    expect(got.format).toBe("easyscene/1");
  });

  it("returns an error result for unknown scenes instead of throwing", async () => {
    const res = await client.callTool({ name: "get_scene", arguments: { id: "nope" } });
    expect(res.isError).toBe(true);
  });
  it("filters props by category and chains a street of buildings", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.propCategories).toContain("building");
    const blds = body(await client.callTool({ name: "list_parts", arguments: { kind: "prop", category: "building" } }));
    expect(blds.parts.length).toBeGreaterThanOrEqual(8);
    expect(blds.parts.every((p: { category: string }) => p.category === "building")).toBe(true);

    const composed = body(
      await client.callTool({
        name: "compose_scene",
        arguments: {
          id: "mcp_street",
          width: 40,
          tileset: "tiles_street",
          streets: [{ x: 16, items: ["prop_bld_noodle_shop", { part: "prop_bld_shophouse_2f", flipX: true }, "prop_nope"] }],
        },
      }),
    );
    expect(composed.warnings.join()).toMatch(/prop_nope/);
    const scene = body(await client.callTool({ name: "get_scene", arguments: { id: "mcp_street" } }));
    const doc = scene.scene ?? scene;
    expect(doc.props.map((p: { part: string; x: number }) => [p.part, p.x])).toEqual([
      ["prop_bld_noodle_shop", 16],
      ["prop_bld_shophouse_2f", 144],
    ]);
  });

  it("compose_scene places several characters; render_preview and export_scene draw them", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { encodePng } = await import("../src/lib/png.js");
    const { createImage } = await import("../src/shared/raster.js");
    const sheet = createImage(48 * 30, 48 * 3);
    for (let i = 0; i < sheet.data.length; i += 4) {
      const x = (i / 4) % sheet.width;
      const y = Math.floor(i / 4 / sheet.width) % 48;
      if (x % 48 > 18 && x % 48 < 30 && y > 27) sheet.data.set([200, 40, 40, 255], i);
    }
    await mkdir(path.join(root, "sheets"), { recursive: true });
    const file = path.join(root, "sheets", "mcp_walker.png");
    await writeFile(file, encodePng(sheet));
    const composed = body(
      await client.callTool({
        name: "compose_scene",
        arguments: {
          id: "mcp_cast",
          width: 30,
          characters: [
            { sheet: file, x: 40, anim: "walk", patrol: { minX: 20, maxX: 160, speed: 25 } },
            { sheet: file, x: 200, facing: "left", frame: "wave0" },
          ],
        },
      }),
    );
    expect(composed.scene.characters).toBe(2);
    const preview = await client.callTool({ name: "render_preview", arguments: { id: "mcp_cast" } });
    expect(body(preview).characters).toBe(2);
    const exported = body(await client.callTool({ name: "export_scene", arguments: { id: "mcp_cast", preset: "pixi" } }));
    expect(exported.warnings).toEqual([]);
    expect(exported.paths.some((p: string) => p.endsWith("mcp_walker.png"))).toBe(true);
  });

  it("compose_town and towns_from_overworld build exported town streets", async () => {
    const one = body(await client.callTool({ name: "compose_town", arguments: { id: "mcp_kampung", kind: "malay_kampung", seed: 3, town: "kampung_x", map: "world", export: "pixi" } }));
    expect(one.towns[0].scene).toBe("mcp_kampung");
    expect(one.towns[0].exports[0].preset).toBe("pixi");
    const pixi = JSON.parse(await readFile(`${one.towns[0].exports[0].dir}/mcp_kampung.pixi.json`, "utf8"));
    expect(pixi.exits.length).toBeGreaterThan(0);
    expect(pixi.town.kind).toBe("malay_kampung");
    const bad = await client.callTool({ name: "compose_town", arguments: { id: "x", kind: "castle" } });
    expect((bad as { isError?: boolean }).isError).toBe(true);
    const map = {
      id: "world",
      overworld: {
        towns: [
          { id: "ban_a", kind: "thai_town", scene: "town_ban_a", seed: 1, name: { th: "บ้านเอ", en: "Ban A" } },
          { id: "kg_b", kind: "malay_kampung", scene: "town_kg_b", seed: 2, name: { th: "กำปงบี", en: "Kampung B", ms: "Kampung B" } },
        ],
      },
    };
    await writeFile(`${root}/world.json`, JSON.stringify(map));
    const many = body(await client.callTool({ name: "towns_from_overworld", arguments: { map: "world.json", export: "godot,pixi" } }));
    expect(many.towns.map((t: { scene: string }) => t.scene)).toEqual(["town_ban_a", "town_kg_b"]);
    for (const t of many.towns) {
      expect(t.exports.map((e: { preset: string }) => e.preset)).toEqual(["godot", "pixi"]);
      await access(`${t.exports[0].dir}/${t.scene}.scene.json`);
    }
    // night: render_preview night=true and a compose_town export with its night twin
    const nightPrev = await client.callTool({ name: "render_preview", arguments: { id: "mcp_kampung", night: true } });
    const np = JSON.parse((nightPrev as { content: Array<{ text: string }> }).content[0]!.text);
    expect(np.path.endsWith("mcp_kampung_level_night.png")).toBe(true);
    const nightTown = body(await client.callTool({ name: "compose_town", arguments: { id: "mcp_kampung_n", kind: "malay_kampung", seed: 3, export: "pixi", night: true } }));
    const nd = nightTown.towns[0].exports[0].dir;
    expect(JSON.parse(await readFile(`${nd}/mcp_kampung_n.pixi.json`, "utf8")).night).toBe("mcp_kampung_n_night.pixi.json");
    expect(JSON.parse(await readFile(`${nd}/mcp_kampung_n_night.pixi.json`, "utf8")).lighting).toBe("night");
    const nightExport = body(await client.callTool({ name: "export_scene", arguments: { id: "mcp_kampung", preset: "godot", night: true } }));
    expect(nightExport.paths.some((p: string) => p.endsWith("mcp_kampung_night.tscn"))).toBe(true);
    const outside = await client.callTool({ name: "towns_from_overworld", arguments: { map: "/etc/passwd" } });
    expect((outside as { isError?: boolean }).isError).toBe(true);
  }, 120_000);
});
