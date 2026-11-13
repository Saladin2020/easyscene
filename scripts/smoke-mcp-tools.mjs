/** Stdio MCP smoke test: start the server like an MCP client would and call a few tools. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/mcp/server.ts"],
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
await client.close();
process.exit(0);
