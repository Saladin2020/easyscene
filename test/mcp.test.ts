import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { access } from "node:fs/promises";
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
});
