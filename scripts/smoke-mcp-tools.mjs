/** Stdio MCP smoke test: start the server like an MCP client would and call a few tools. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyscene-smoke-"));

// node + the tsx CLI directly (spawning "npx" fails on Windows without a shell)
const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [tsx, "src/mcp/server.ts", "--workspace", ws],
  cwd: process.cwd(),
  env: { ...process.env },
});
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);
const tools = await client.listTools();
console.log("tools", tools.tools.map((t) => t.name).join(", "));
const info = await client.callTool({ name: "workspace_info", arguments: {} });
console.log("workspace_ok", (info.content?.[0]?.text ?? "").includes("tileSize"));
const listed = await client.callTool({ name: "list_parts", arguments: { kind: "prop" } });
console.log("props", JSON.parse(listed.content?.[0]?.text ?? "{}").total);
let failed = false;
const body = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");
const town = body(await client.callTool({ name: "compose_town", arguments: { id: "smoke_kampung", kind: "malay_kampung", seed: 2, town: "kg", map: "world", export: "pixi" } }));
console.log("compose_town", town.towns?.[0]?.scene, "width", town.towns?.[0]?.width, "exports", town.towns?.[0]?.exports?.map((e) => `${e.preset}:${e.files}`).join(" "));
if (!town.towns?.[0]?.exports?.[0]?.files) failed = true;
const night = await client.callTool({ name: "render_preview", arguments: { id: "smoke_kampung", night: true } });
console.log("render_preview night", night.content?.[1]?.type === "image", body(night).path?.endsWith("_night.png"));
if (!body(night).path?.endsWith("_night.png")) failed = true;
writeFileSync(path.join(ws, "world.json"), JSON.stringify({ id: "world", overworld: { towns: [
  { id: "ban_a", kind: "thai_town", scene: "town_ban_a", seed: 1, name: { th: "บ้านเอ", en: "Ban A" } },
  { id: "tl_b", kind: "chinese_town", scene: "town_tl_b", seed: 2, name: { th: "ตลาดบี", en: "Talat B" } },
  { id: "na_c", kind: "rural_village", scene: "town_na_c", seed: 3, name: { th: "บ้านนาซี", en: "Ban Na C" } },
] } }));
const many = body(await client.callTool({ name: "towns_from_overworld", arguments: { map: "world.json", export: "godot" } }));
console.log("towns_from_overworld", many.towns?.map((t) => `${t.scene}(${t.kind})`).join(", "));
if (many.towns?.length !== 3) failed = true;
await client.close();
rmSync(ws, { recursive: true, force: true });
console.log(failed ? "MCP smoke FAILED" : "MCP smoke OK");
process.exit(failed ? 1 : 0);
