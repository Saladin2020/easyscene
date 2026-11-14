#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp, defaultWebRoot } from "./server/app.js";
import { resolveToken } from "./shared/requestGuard.js";
import { renderParallaxStrip, renderScene } from "./shared/render.js";
import type { ComposeLayerInput, ComposePropInput, ComposeSceneInput } from "./shared/scene.js";
import type { TerrainSpec } from "./shared/tiles.js";
import { propCategory, type ExportPresetId } from "./shared/types.js";
import { composeAndSave, loadAssets, resolveCharacters } from "./lib/compose.js";
import { parseCharacterArg, sceneCharacters } from "./shared/characters.js";
import type { SceneCharacter } from "./shared/types.js";
import { exportScene, type ExportResult } from "./lib/export.js";
import { writePng } from "./lib/png.js";
import { getWorkspaceSummary, initWorkspace, loadParts, loadScene, loadScenes, resolveWorkspace, summarizeScene } from "./lib/workspace.js";

const program = new Command();

/** Repeatable `--character path[:x[:facing[:anim[:frame]]]]` → characters with absolute sheet paths. */
function characterArgs(values: string[] | string | undefined): SceneCharacter[] | undefined {
  const list = values === undefined ? [] : Array.isArray(values) ? values : [values];
  if (!list.length) return undefined;
  return list.map((v) => {
    const c = parseCharacterArg(v);
    return { ...c, sheet: path.resolve(c.sheet) };
  });
}

function upscale(img: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, n: number) {
  const out = { width: img.width * n, height: img.height * n, data: new Uint8Array(img.width * n * img.height * n * 4) };
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si = ((Math.floor(y / n) * img.width) + Math.floor(x / n)) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function defaultWorkspace(cliValue?: string): string {
  const fromCli = cliValue?.trim();
  if (fromCli) return resolveWorkspace(fromCli);
  const fromEnv = process.env.EASYSCENE_HOME?.trim() || process.env.EASYSCENE_WORKSPACE?.trim();
  return resolveWorkspace(fromEnv || process.cwd());
}

/** The CLI user named this folder explicitly, so allow it for this process only. */
function allowForThisRun(dir?: string): void {
  if (!dir) return;
  const abs = path.resolve(dir);
  const cur = process.env.EASYSCENE_ALLOWED_DIRS;
  process.env.EASYSCENE_ALLOWED_DIRS = cur ? `${cur}${path.delimiter}${abs}` : abs;
}

const collect = (v: string, prev: string[] = []) => [...prev, v];
const nums = (s: string) => s.split(/[,:x]/).map((n) => Number(n.trim()));

function print(json: boolean | undefined, data: unknown, human: () => void): void {
  if (json) console.log(JSON.stringify(data, null, 2));
  else human();
}

program.name("easyscene").description("Compose side-view pixel-art game scenes locally").version("0.1.0");

program
  .command("init")
  .description("Create parts/scenes/exports folders, sample parts and demo scenes")
  .option("--force-samples", "Regenerate sample parts and demo scenes")
  .option("--workspace <path>", "Workspace directory")
  .action(async (opts: { forceSamples?: boolean; workspace?: string }) => {
    const root = await initWorkspace(defaultWorkspace(opts.workspace), { forceSamples: opts.forceSamples });
    console.log(`Initialized Easy Scene workspace at ${root}`);
    console.log("  parts/    backgrounds · tilesets · props (sample set, CC0)");
    console.log("  scenes/   scene JSON documents");
    console.log("  exports/  PNG / Godot / PixiJS exports");
  });

program
  .command("info")
  .description("Workspace summary")
  .option("--workspace <path>", "Workspace directory")
  .option("--json", "JSON output")
  .action(async (opts: { workspace?: string; json?: boolean }) => {
    const s = await getWorkspaceSummary(defaultWorkspace(opts.workspace));
    const count = (k: string) => s.parts.filter((p) => p.kind === k).length;
    print(opts.json, { root: s.root, config: s.config, parts: { background: count("background"), tileset: count("tileset"), prop: count("prop") }, scenes: s.scenes }, () => {
      console.log(`Easy Scene workspace ${s.root}`);
      console.log(`  tile ${s.config.tileSize}px · viewport ${s.config.viewport.width}x${s.config.viewport.height} · max ${s.config.maxLayers} layers`);
      console.log(`  parts: ${count("background")} backgrounds · ${count("tileset")} tilesets · ${count("prop")} props`);
      console.log(`  scenes: ${s.scenes.map((x) => x.id).join(", ") || "(none)"}`);
    });
  });

program
  .command("parts")
  .description("List part ids (never invent ids — use this)")
  .option("--kind <kind>", "background | tileset | prop")
  .option("--category <cat>", "Prop category: building | street | nature | water | decor")
  .option("--query <q>", "Filter by id, name or tag")
  .option("--workspace <path>", "Workspace directory")
  .option("--json", "JSON output")
  .action(async (opts: { kind?: string; category?: string; query?: string; workspace?: string; json?: boolean }) => {
    const q = opts.query?.toLowerCase() ?? "";
    const parts = (await loadParts(defaultWorkspace(opts.workspace))).filter(
      (p) =>
        (!opts.kind || p.kind === opts.kind) &&
        (!opts.category || (p.kind === "prop" && propCategory(p) === opts.category)) &&
        (!q || [p.id, p.name, ...(p.tags ?? [])].some((s) => s.toLowerCase().includes(q))),
    );
    print(opts.json, parts, () => {
      for (const p of parts) {
        const extra = p.kind === "background" ? `${p.band} scroll ${p.defaultScroll}` : p.kind === "prop" ? `${p.defaultLayer} · ${propCategory(p)}` : `${p.tileSize}px`;
        console.log(`${p.kind.padEnd(10)} ${p.id.padEnd(28)} ${`${p.width}x${p.height}`.padEnd(8)} ${extra.padEnd(18)} ${p.name}`);
      }
    });
  });

program
  .command("scenes")
  .description("List saved scenes")
  .option("--workspace <path>", "Workspace directory")
  .option("--json", "JSON output")
  .action(async (opts: { workspace?: string; json?: boolean }) => {
    const scenes = (await loadScenes(defaultWorkspace(opts.workspace))).map(summarizeScene);
    print(opts.json, scenes, () => scenes.forEach((s) => console.log(`${s.id.padEnd(20)} ${s.width}x${s.height} tiles · ${s.layers} layers · ${s.props} props  ${s.name}`)));
  });

program
  .command("get <id>")
  .description("Print one scene JSON")
  .option("--workspace <path>", "Workspace directory")
  .action(async (id: string, opts: { workspace?: string }) => {
    console.log(JSON.stringify(await loadScene(defaultWorkspace(opts.workspace), id), null, 2));
  });

function parseLayer(spec: string): ComposeLayerInput {
  // part[:scroll]
  const [part, scroll] = spec.split(":");
  return { part: part!.trim(), ...(scroll ? { scroll: Number(scroll) } : {}) };
}

function parseProp(spec: string): ComposePropInput {
  // part@x[,y][,flip][,front|back]
  const [part, rest = "0"] = spec.split("@");
  const bits = rest.split(",").map((b) => b.trim());
  const prop: ComposePropInput = { part: part!.trim(), x: Number(bits[0]) };
  for (const b of bits.slice(1)) {
    if (b === "flip") prop.flipX = true;
    else if (b === "front" || b === "back") prop.layer = b;
    else if (/^-?\d+$/.test(b)) prop.y = Number(b);
    else if (/^#?[0-9a-f]{6}$/i.test(b)) prop.color = b;
  }
  return prop;
}

program
  .command("compose")
  .alias("new")
  .description("Create/overwrite a scene from args; optionally export")
  .requiredOption("--id <id>", "Scene id [a-z0-9_-]+")
  .option("--name <name>", "Display name")
  .option("--width <tiles>", "Map width in tiles (default 60)")
  .option("--height <tiles>", "Map height in tiles (default 17)")
  .option("--layers <ids>", "Background layers back→front: id[:scroll],id[:scroll],…")
  .option("--color <part=hex>", "Recolor a layer's base hue (repeatable)", collect)
  .option("--tint <part=hex[@amount]>", "Multiply-tint a layer (repeatable)", collect)
  .option("--tileset <id>", "Tileset part id")
  .option("--ground <rows>", "Solid ground rows (default 3)")
  .option("--hill <x,w,h>", "Hill plateau in tiles with slopes (repeatable)", collect)
  .option("--pit <x,w>", "Gap in the ground (repeatable)", collect)
  .option("--platform <x,y,len>", "One-way platform, y tiles above ground (repeatable)", collect)
  .option("--prop <part@x[,y][,flip][,front]>", "Place a prop at px x (repeatable)", collect)
  .option("--street <x:part,part,...>", "Chain props edge to edge from px x (repeatable), e.g. 0:prop_bld_noodle_shop,prop_bld_mini_mart", collect)
  .option("--tiles-file <file>", "Text file of tile rows (. # = / \\)")
  .option("--input <file>", "Full compose JSON (ComposeSceneInput); flags override")
  .option("--character <spec>", "Easy Sprite sheet placed in the scene: path[:x[:facing[:anim[:frame]]]] (repeatable)", collect)
  .option("--scenes-dir <dir>", "Where to write the scene JSON (default scenes/)")
  .option("--export <presets>", "Also export: png,godot,pixi or all")
  .option("--out <dir>", "Export parent folder (default exports/)")
  .option("--godot-parallax <mode>", "parallax2d (default) | legacy")
  .option("--workspace <path>", "Workspace directory")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const root = defaultWorkspace(opts.workspace);
    await initWorkspace(root);
    allowForThisRun(opts.scenesDir);
    allowForThisRun(opts.out);
    const base: Partial<ComposeSceneInput> = opts.input ? JSON.parse(await readFile(opts.input, "utf8")) : {};
    const input: ComposeSceneInput = { ...base, id: opts.id };
    if (opts.name) input.name = opts.name;
    if (opts.width) input.width = Number(opts.width);
    if (opts.height) input.height = Number(opts.height);
    if (opts.layers) input.layers = String(opts.layers).split(",").filter(Boolean).map(parseLayer);
    const layers = (input.layers ?? []).map((l) => (typeof l === "string" ? { part: l } : l));
    for (const c of (opts.color as string[] | undefined) ?? []) {
      const [part, hex] = c.split("=");
      const l = layers.find((x) => x.part === part);
      if (l) l.color = hex;
      else console.error(`--color: layer ${part} not in --layers`);
    }
    for (const t of (opts.tint as string[] | undefined) ?? []) {
      const [part, rest = ""] = t.split("=");
      const [hex, amount] = rest.split("@");
      const l = layers.find((x) => x.part === part);
      if (l) Object.assign(l, { tint: hex, ...(amount ? { tintAmount: Number(amount) } : {}) });
      else console.error(`--tint: layer ${part} not in --layers`);
    }
    if (layers.length) input.layers = layers;
    if (opts.tileset) input.tileset = opts.tileset;
    const terrain: Omit<TerrainSpec, "width" | "height"> = { ...(input.terrain ?? {}) };
    if (opts.ground) terrain.groundHeight = Number(opts.ground);
    if (opts.hill) terrain.hills = (opts.hill as string[]).map((h) => { const [x, w, hh] = nums(h); return { x: x!, width: w!, height: hh! }; });
    if (opts.pit) terrain.pits = (opts.pit as string[]).map((p) => { const [x, w] = nums(p); return { x: x!, width: w! }; });
    if (opts.platform) terrain.platforms = (opts.platform as string[]).map((p) => { const [x, y, len] = nums(p); return { x: x!, y: y!, length: len! }; });
    input.terrain = terrain;
    if (opts.tilesFile) input.tiles = (await readFile(opts.tilesFile, "utf8")).split(/\r?\n/).filter((r) => r.length);
    if (opts.prop) input.props = [...(input.props ?? []), ...(opts.prop as string[]).map(parseProp)];
    for (const st of (opts.street as string[] | undefined) ?? []) {
      const [xRaw, list = ""] = st.includes(":") ? st.split(/:(.*)/s) : ["0", st];
      input.streets = [...(input.streets ?? []), { x: Number(xRaw) || 0, items: list.split(",").map((s) => s.trim()).filter(Boolean) }];
    }
    const cliChars = characterArgs(opts.character);
    if (cliChars) input.characters = [...(input.characters ?? []), ...cliChars];

    const res = await composeAndSave(root, input, opts.scenesDir);
    const exports: ExportResult[] = [];
    if (opts.export) {
      const presets = (opts.export === "all" ? ["png", "godot", "pixi"] : String(opts.export).split(",")) as ExportPresetId[];
      for (const preset of presets) {
        exports.push(
          await exportScene(root, {
            scene: res.scene,
            preset,
            dir: opts.out,
            trustedCharacter: true,
            godot: { parallax: opts.godotParallax },
          }),
        );
      }
    }
    print(opts.json, { ...res, exports }, () => {
      console.log(`Scene ${res.scene.id} → ${res.path}`);
      console.log(`  ${res.scene.width}x${res.scene.height} tiles · ${res.scene.layers.length} layers · ${res.scene.props.length} props · ${sceneCharacters(res.scene).length} characters · tileset ${res.scene.tileset}`);
      for (const w of res.warnings) console.log(`  warn: ${w}`);
      for (const e of exports) {
        console.log(`  export ${e.preset} → ${e.dir} (${e.paths.length} files)`);
        for (const w of e.warnings) console.log(`    warn: ${w}`);
      }
    });
  });

program
  .command("export")
  .description("Export a saved scene")
  .requiredOption("--id <id>", "Scene id")
  .option("--preset <presets>", "png | godot | pixi | all (comma list ok)", "png")
  .option("--out <dir>", "Parent folder (default exports/)")
  .option("--base-name <name>", "Folder/file stem (default scene id)")
  .option("--character <spec>", "Replace the scene's characters: path[:x[:facing[:anim[:frame]]]] (repeatable)", collect)
  .option("--godot-parallax <mode>", "parallax2d (default) | legacy")
  .option("--scenes-dir <dir>", "Scene folder (default scenes/)")
  .option("--workspace <path>", "Workspace directory")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const root = defaultWorkspace(opts.workspace);
    allowForThisRun(opts.out);
    allowForThisRun(opts.scenesDir);
    const presets = (opts.preset === "all" ? ["png", "godot", "pixi"] : String(opts.preset).split(",")) as ExportPresetId[];
    const results: ExportResult[] = [];
    for (const preset of presets) {
      results.push(
        await exportScene(root, {
          sceneId: opts.id,
          preset,
          dir: opts.out,
          baseName: opts.baseName,
          scenesDir: opts.scenesDir,
          characters: characterArgs(opts.character),
          trustedCharacter: true,
          godot: { parallax: opts.godotParallax },
        }),
      );
    }
    print(opts.json, results, () => {
      for (const r of results) {
        console.log(`Export ${r.preset} → ${r.dir}`);
        for (const p of r.paths) console.log(`  ${path.relative(r.dir, p)}`);
        for (const w of r.warnings) console.log(`  warn: ${w}`);
      }
    });
  });

program
  .command("render")
  .description("Render a scene preview PNG")
  .requiredOption("--id <id>", "Scene id")
  .requiredOption("--out <file>", "Output .png")
  .option("--mode <mode>", "level | parallax | viewport", "level")
  .option("--camera <x>", "Camera x for viewport/level mode", "0")
  .option("--character <spec>", "Replace the scene's characters: path[:x[:facing[:anim[:frame]]]] (repeatable)", collect)
  .option("--scale <n>", "Integer nearest-neighbour upscale (e.g. 3)", "1")
  .option("--workspace <path>", "Workspace directory")
  .action(async (opts) => {
    const root = defaultWorkspace(opts.workspace);
    const doc = await loadScene(root, opts.id);
    const assets = await loadAssets(root, doc);
    const camX = Number(opts.camera);
    const list = characterArgs(opts.character) ?? sceneCharacters(doc);
    const resolved = await resolveCharacters(root, list, { trusted: true });
    for (const w of resolved.warnings) console.error(`warn: ${w}`);
    const characters = resolved.characters.map((c) => c.sprite);
    const legacy = !doc.characters?.length && !opts.character && characters.length === 1;
    const viewportY = Math.max(0, doc.height * doc.tileSize - doc.viewport.height);
    let img =
      opts.mode === "parallax"
        ? renderParallaxStrip(doc, assets, 3, legacy ? characters[0] : characters)
        : opts.mode === "viewport"
          ? renderScene(doc, assets, { cameraX: camX, cameraY: viewportY, width: doc.viewport.width, height: doc.viewport.height, characters })
          : renderScene(doc, assets, { cameraX: camX, characters });
    const scale = Math.max(1, Math.floor(Number(opts.scale) || 1));
    if (scale > 1) img = upscale(img, scale);
    await writePng(path.resolve(opts.out), img);
    console.log(`Rendered ${img.width}x${img.height} → ${path.resolve(opts.out)}`);
  });

program
  .command("mcp")
  .description("Start the MCP server (stdio by default; --http for remote clients)")
  .option("--http", "Serve Streamable HTTP instead of stdio")
  .option("-p, --port <port>", "HTTP port", "8796")
  .option("--host <host>", "HTTP host", "127.0.0.1")
  .option("--workspace <path>", "Workspace directory")
  .action(async (opts: { http?: boolean; port: string; host: string; workspace?: string }) => {
    const { startMcp } = await import("./mcp/server.js");
    await startMcp({ workspace: defaultWorkspace(opts.workspace), http: Boolean(opts.http), host: opts.host, port: Number(opts.port) });
  });

async function runServe(opts: { port: string; host: string; open: boolean; dev?: boolean; workspace?: string }): Promise<void> {
  const workspaceRoot = defaultWorkspace(opts.workspace);
  await initWorkspace(workspaceRoot);
  const port = Number(opts.port);
  const host = opts.host;
  const webRoot = defaultWebRoot();
  const hasWebBuild = await pathExists(path.join(webRoot, "index.html"));
  const useDev = Boolean(opts.dev) || !hasWebBuild;
  if (!opts.dev && !hasWebBuild) {
    console.log("web/dist missing — starting in --dev mode (Vite).");
    console.log("Tip: npm run build  for a single-port production UI.");
  }
  const token = resolveToken(host);
  const app = createApp({ workspaceRoot, webRoot, dev: useDev, host, token });
  serve({ fetch: app.fetch, hostname: host, port }, (info) => {
    const apiUrl = `http://${host}:${info.port}`;
    console.log(`Easy Scene API   ${apiUrl}`);
    console.log(`Workspace        ${workspaceRoot}`);
    if (token) console.log(`Token            ${token}\n  Non-loopback host: open http://<this-machine-ip>:${info.port}/?token=<token>`);
    if (useDev) {
      const viteBin = path.join(pkgRoot, "node_modules", "vite", "bin", "vite.js");
      console.log("Starting Vite UI on http://127.0.0.1:5174 ...");
      const child = spawn(process.execPath, [viteBin, "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", "5174"], {
        cwd: path.join(pkgRoot, "web"),
        stdio: "inherit",
        env: { ...process.env, EASYSCENE_API: apiUrl },
      });
      child.on("exit", (code) => {
        if (code) process.exitCode = code;
      });
      if (opts.open) setTimeout(() => void open("http://127.0.0.1:5174"), 1200);
    } else {
      const uiUrl = token ? `${apiUrl}/?token=${token}` : apiUrl;
      console.log(`Web UI           ${token ? `${apiUrl}/?token=<token>` : apiUrl}`);
      if (opts.open) void open(uiUrl);
    }
  });
}

for (const name of ["serve", "desktop"]) {
  program
    .command(name)
    .description(name === "serve" ? "Start local web UI and API" : "Start the UI and open it in your browser")
    .option("-p, --port <port>", "Port", "8788")
    .option("--host <host>", "Host", "127.0.0.1")
    .option("--no-open", "Do not open the browser")
    .option("--dev", "Run API and Vite dev UI on :5174")
    .option("--workspace <path>", "Workspace directory (default: EASYSCENE_HOME or cwd)")
    .action(async (opts) => {
      await runServe({ port: opts.port, host: opts.host, open: opts.open, dev: opts.dev, workspace: opts.workspace });
    });
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
