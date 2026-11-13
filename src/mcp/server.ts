#!/usr/bin/env node
/**
 * Easy Scene MCP server (stdio by default; optional Streamable HTTP).
 *
 *   npx tsx src/mcp/server.ts
 *   npx tsx src/mcp/server.ts --http --port 8796
 *
 * Env:
 *   EASYSCENE_WORKSPACE  absolute path to the workspace (default: cwd)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "node:http";
import path from "node:path";
import { z } from "zod";
import { OPERATOR_PROMPT_DESCRIPTION, buildOperatorPrompt } from "../shared/operatorPrompt.js";
import { renderParallaxStrip, renderScene } from "../shared/render.js";
import { DEFAULT_SCROLL, EXPORT_PRESETS, LAYER_BANDS, TILE_CODE_LABELS } from "../shared/types.js";
import { checkRequest, resolveToken } from "../shared/requestGuard.js";
import { characterSprite, composeAndSave, loadAssets, loadCharacterSheet } from "../lib/compose.js";
import { exportScene } from "../lib/export.js";
import { encodePng } from "../lib/png.js";
import { getWorkspaceSummary, loadParts, loadScene, loadScenes, resolveOutDir, resolveWorkspace, summarizeScene } from "../lib/workspace.js";
import { mkdir, writeFile } from "node:fs/promises";

export const MCP_TOOL_NAMES = [
  "workspace_info",
  "list_parts",
  "list_scenes",
  "get_scene",
  "compose_scene",
  "render_preview",
  "export_scene",
] as const;

const SceneIdSchema = z.string().regex(/^[a-z0-9_-]+$/, "Use a-z, 0-9, _ or -");
const HexSchema = z.string().regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Hex color like #ff9a6a");

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function parseArgs(argv: string[]) {
  const out = { http: false, port: 8796, host: "127.0.0.1", workspace: process.env.EASYSCENE_WORKSPACE ?? process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--http") out.http = true;
    else if (a === "--port") out.port = Number(argv[++i] ?? out.port);
    else if (a === "--host") out.host = argv[++i] ?? out.host;
    else if (a === "--workspace") out.workspace = argv[++i] ?? out.workspace;
  }
  return out;
}

const LayerSchema = z.object({
  part: z.string().describe("background part id from list_parts"),
  scroll: z.number().min(0).max(1).optional().describe("Horizontal parallax factor 0..1 (default: part's defaultScroll)"),
  scrollY: z.number().min(0).max(1).optional(),
  color: HexSchema.optional().describe("Recolor the part's recolorBase hue to this hex"),
  tint: HexSchema.optional().describe("Multiply tint toward this hex"),
  tintAmount: z.number().min(0).max(1).optional(),
  offsetY: z.number().int().optional().describe("Extra vertical offset in px (+ = down)"),
});

const PropSchema = z.object({
  part: z.string().describe("prop part id from list_parts"),
  x: z.number().describe("Left edge in px"),
  y: z.number().optional().describe("Baseline in px; omit to snap onto the ground"),
  flipX: z.boolean().optional(),
  layer: z.enum(["back", "front"]).optional(),
  color: HexSchema.optional(),
  tint: HexSchema.optional(),
  tintAmount: z.number().min(0).max(1).optional(),
});

const TerrainSchema = z.object({
  groundHeight: z.number().int().min(0).optional().describe("Solid rows at the bottom (default 3)"),
  hills: z.array(z.object({ x: z.number().int(), width: z.number().int().min(1), height: z.number().int().min(1) })).optional()
    .describe("Plateaus with 45° slopes; x/width/height in tiles"),
  pits: z.array(z.object({ x: z.number().int(), width: z.number().int().min(1) })).optional(),
  platforms: z.array(z.object({ x: z.number().int(), y: z.number().int().min(1), length: z.number().int().min(1) })).optional()
    .describe("One-way platforms; y = tiles above the ground surface"),
});

export function createEasySceneMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easyscene", version: "0.1.0" });

  server.registerTool(
    "workspace_info",
    {
      title: "Workspace info",
      description: "Summarize the Easy Scene workspace: tile size, viewport, layer bands + default scroll, tile codes, export presets, part and scene counts. Call this first.",
      inputSchema: {},
    },
    async () => {
      const s = await getWorkspaceSummary(root);
      return text({
        name: "easyscene",
        root: s.root,
        scenesDir: s.scenesDir,
        exportsDir: s.exportsDir,
        artStyle: s.config.artStyle,
        tileSize: s.config.tileSize,
        viewport: s.config.viewport,
        maxLayers: s.config.maxLayers,
        bands: LAYER_BANDS.map((b) => ({ id: b, defaultScroll: DEFAULT_SCROLL[b] })),
        tileCodes: TILE_CODE_LABELS,
        character: s.config.character,
        exportPresets: EXPORT_PRESETS,
        partCounts: {
          background: s.parts.filter((p) => p.kind === "background").length,
          tileset: s.parts.filter((p) => p.kind === "tileset").length,
          prop: s.parts.filter((p) => p.kind === "prop").length,
        },
        sceneCount: s.scenes.length,
        note: "Compose only — use part ids from list_parts. Layers back→front (sky, far, mid, near), max 5.",
      });
    },
  );

  server.registerTool(
    "list_parts",
    {
      title: "List parts",
      description: "List scene parts: background layers (with band + default scroll), tilesets, and props (with size). Filter by kind, band or query.",
      inputSchema: {
        kind: z.enum(["background", "tileset", "prop"]).optional(),
        band: z.enum(["sky", "far", "mid", "near"]).optional().describe("Background band filter"),
        query: z.string().optional().describe("Case-insensitive match on id, name or tags"),
      },
    },
    async ({ kind, band, query }) => {
      const q = query?.trim().toLowerCase() ?? "";
      const parts = (await loadParts(root)).filter((p) => {
        if (kind && p.kind !== kind) return false;
        if (band && (p.kind !== "background" || p.band !== band)) return false;
        if (q && ![p.id, p.name, ...(p.tags ?? [])].some((s) => s.toLowerCase().includes(q))) return false;
        return true;
      });
      return text({
        total: parts.length,
        parts: parts.map((p) => ({
          id: p.id,
          kind: p.kind,
          name: p.name,
          size: `${p.width}x${p.height}`,
          ...(p.kind === "background" ? { band: p.band, defaultScroll: p.defaultScroll, loopWidth: p.loopWidth } : {}),
          ...(p.kind === "prop" ? { defaultLayer: p.defaultLayer } : {}),
          ...(p.kind === "tileset" ? { tileSize: p.tileSize } : {}),
          recolorBase: p.recolorBase ?? null,
          tags: p.tags,
          sample: Boolean(p.sample),
        })),
      });
    },
  );

  server.registerTool(
    "list_scenes",
    {
      title: "List scenes",
      description: "List saved scenes (id, name, size in tiles, layer/prop counts).",
      inputSchema: { query: z.string().optional() },
    },
    async ({ query }) => {
      const q = query?.trim().toLowerCase() ?? "";
      const scenes = (await loadScenes(root)).filter((s) => !q || s.id.includes(q) || s.name.toLowerCase().includes(q));
      return text({ count: scenes.length, scenes: scenes.map(summarizeScene) });
    },
  );

  server.registerTool(
    "get_scene",
    {
      title: "Get scene",
      description: "Load one saved scene document (layers, tile rows, props, collision).",
      inputSchema: { id: SceneIdSchema },
    },
    async ({ id }) => {
      try {
        return text(await loadScene(root, id));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "compose_scene",
    {
      title: "Compose scene",
      description:
        "Create or overwrite a side-view scene from part ids. Layers back→front (max 5). Terrain from {groundHeight, hills, pits, platforms} or explicit tile rows. Unknown parts are dropped with warnings. Props without y snap onto the ground.",
      inputSchema: {
        id: SceneIdSchema.describe("Scene id slug, e.g. forest_evening"),
        name: z.string().optional(),
        width: z.number().int().min(4).max(1024).optional().describe("Map width in tiles (default 60)"),
        height: z.number().int().min(4).max(256).optional().describe("Map height in tiles (default 17 = 272px)"),
        layers: z.array(z.union([z.string(), LayerSchema])).max(5).optional().describe("Background layers back→front (ids or objects)"),
        tileset: z.string().optional().describe("Tileset part id (default tiles_grass)"),
        terrain: TerrainSchema.optional(),
        tiles: z.array(z.string()).optional().describe("Explicit tile rows using . # = / \\ (wins over terrain)"),
        props: z.array(PropSchema).optional(),
        collision: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), oneWay: z.boolean().optional() })).optional()
          .describe("Extra collision rects in px"),
        character: z.object({ sheet: z.string(), x: z.number().optional() }).optional()
          .describe("Easy Sprite side-view sheet path for previews (must be inside allowed folders)"),
      },
    },
    async (input) => {
      try {
        const res = await composeAndSave(root, input);
        return text({ path: res.path, warnings: res.warnings, scene: summarizeScene(res.scene), tiles: res.scene.tiles });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "render_preview",
    {
      title: "Render preview",
      description: "Render a saved scene to PNG (full level, or parallax strip of 3 camera positions) and return it as an image plus the saved file path.",
      inputSchema: {
        id: SceneIdSchema,
        mode: z.enum(["level", "parallax"]).optional().describe("level = whole map (default); parallax = 3 viewport snapshots"),
        cameraX: z.number().optional().describe("level mode: camera x for parallax offset (default 0)"),
        dir: z.string().optional().describe("Folder for the PNG (default exports/previews)"),
      },
    },
    async ({ id, mode, cameraX, dir }) => {
      try {
        const doc = await loadScene(root, id);
        const assets = await loadAssets(root, doc);
        let character;
        if (doc.character?.sheet) {
          try {
            character = characterSprite(await loadCharacterSheet(root, doc.character.sheet), doc.character.x ?? 96);
          } catch {
            character = undefined;
          }
        }
        const img = mode === "parallax" ? renderParallaxStrip(doc, assets, 3, character) : renderScene(doc, assets, { cameraX, character });
        const outDir = resolveOutDir(root, dir, path.join("exports", "previews"));
        await mkdir(outDir, { recursive: true });
        const file = path.join(outDir, `${id}_${mode ?? "level"}.png`);
        const png = encodePng(img);
        await writeFile(file, png);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ path: file, width: img.width, height: img.height }) },
            { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "export_scene",
    {
      title: "Export scene",
      description: "Export a saved scene: png (layer PNGs + preview), godot (Godot 4.3+ folder: .tscn with Parallax2D + TileMapLayer + TileSet .tres + collision), pixi (layer PNGs + scene JSON). Writes <dir>/<id>-<preset>/.",
      inputSchema: {
        id: SceneIdSchema,
        preset: z.enum(["png", "godot", "pixi"]).optional().describe("Default png"),
        dir: z.string().optional().describe("Parent folder (default workspace exports/)"),
        baseName: SceneIdSchema.optional(),
        godotParallax: z.enum(["parallax2d", "legacy"]).optional().describe("legacy = ParallaxBackground/ParallaxLayer"),
      },
    },
    async ({ id, preset, dir, baseName, godotParallax }) => {
      try {
        const res = await exportScene(root, { sceneId: id, preset, dir, baseName, godot: { parallax: godotParallax } });
        return text(res);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerPrompt(
    "easyscene-operator",
    {
      title: "Easy Scene operator",
      description: OPERATOR_PROMPT_DESCRIPTION,
      argsSchema: { request: z.string().optional() },
    },
    ({ request }) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: buildOperatorPrompt(request) } }],
    }),
  );

  return server;
}

export async function startMcp(options: { workspace: string; http?: boolean; host?: string; port?: number }): Promise<void> {
  const workspace = resolveWorkspace(options.workspace);
  if (options.http) {
    await startHttp(workspace, options.host ?? "127.0.0.1", options.port ?? 8796);
    return;
  }
  const server = createEasySceneMcp(workspace);
  await server.connect(new StdioServerTransport());
}

async function startHttp(workspace: string, host: string, port: number) {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
  const token = resolveToken(host);
  if (token) console.error(`Non-loopback host: send "Authorization: Bearer <token>" — token printed once: ${token}`);

  const httpServer = createServer(async (req, res) => {
    const auth = req.headers.authorization;
    const denied = checkRequest(
      { bindHost: host, token },
      {
        method: req.method ?? "GET",
        host: req.headers.host,
        origin: req.headers.origin,
        token: auth?.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-easyscene-token"] as string | undefined),
      },
    );
    if (denied) {
      res.writeHead(denied.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: denied.error }));
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "easyscene", transport: "streamable-http", endpoint: `http://${host}:${port}/mcp`, workspace }));
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      if (req.method === "POST") {
        let transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          const mcp = createEasySceneMcp(workspace);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id: string) => {
              sessions.set(id, transport!);
            },
          });
          transport.onclose = () => {
            const id = transport!.sessionId;
            if (id) sessions.delete(id);
          };
          await mcp.connect(transport);
        }
        await transport.handleRequest(req, res);
        return;
      }
      if (req.method === "GET" || req.method === "DELETE") {
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing mcp-session-id" }));
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
    }
  });
  httpServer.listen(port, host, () => {
    console.error(`Easy Scene MCP (HTTP) http://${host}:${port}/mcp`);
    console.error(`Workspace ${workspace}`);
  });
}

function entryIndex(): number {
  return process.argv.findIndex((arg) => /(?:^|[/\\])mcp[/\\]server\.(?:ts|js|mjs)$/i.test(arg));
}

if (entryIndex() >= 0) {
  await startMcp(parseArgs(process.argv.slice(entryIndex() + 1)));
}
