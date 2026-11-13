# Easy Scene MCP

MCP tools so an AI agent (Cursor, Claude Desktop, Grok bot, the Indie Studio team, …) can **compose, preview and export** side-view scenes from existing parts — without opening the web UI. The agent does **not** generate art.

## Transports

| Mode | When to use | Start |
|---|---|---|
| **stdio** (default) | Cursor, Claude Desktop, local agents | `npm run mcp` or `npx tsx src/cli.ts mcp` |
| **Streamable HTTP** | Remote / HTTP MCP clients | `npm run mcp:http` → `http://127.0.0.1:8796/mcp` · any port: `npx tsx src/mcp/server.ts --http --port 18796` |

Workspace root: `EASYSCENE_WORKSPACE` or `--workspace <path>` (default: cwd).  
HTTP on a non-loopback `--host` requires `Authorization: Bearer <token>` (printed at startup, or fixed via `EASYSCENE_TOKEN`).

Cursor `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "easyscene": {
      "command": "npx",
      "args": ["tsx", "/path/to/easyscene/src/mcp/server.ts"],
      "env": { "EASYSCENE_WORKSPACE": "/path/to/easyscene" }
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `workspace_info` | tile size, viewport, layer bands + default scroll, tile codes, export presets, counts. Call first. |
| `list_parts` | backgrounds (band, scroll, loop width) · tilesets · props (size, default layer). Filter `kind`, `band`, `query`. |
| `list_scenes` | saved scenes |
| `get_scene` | one scene document |
| `compose_scene` | create/overwrite a scene: `layers`, `tileset`, `terrain {groundHeight, hills, pits, platforms}` or `tiles` rows, `props`, `collision`, `character` |
| `render_preview` | PNG of the whole level (`mode: level`) or 3 camera snapshots (`mode: parallax`); returns the image inline + its path |
| `export_scene` | `png` · `godot` · `pixi` into `<dir>/<id>-<preset>/` |

Prompt: `easyscene-operator` (rules + flow).

## Recommended flow

```text
workspace_info → list_parts → compose_scene → render_preview (look at it) → export_scene
```

Example `compose_scene` arguments:

```json
{
  "id": "forest_evening",
  "name": "Forest evening",
  "width": 72,
  "layers": [
    "bg_sky_dusk",
    { "part": "bg_far_mountains", "color": "#6a4f8a" },
    { "part": "bg_mid_forest", "tint": "#ff9a6a", "tintAmount": 0.25 },
    "bg_near_bushes"
  ],
  "tileset": "tiles_grass",
  "terrain": { "groundHeight": 3, "hills": [{ "x": 30, "width": 6, "height": 2 }], "platforms": [{ "x": 19, "y": 3, "length": 5 }] },
  "props": [{ "part": "prop_house", "x": 150 }, { "part": "prop_tree_pine", "x": 520, "flipX": true }]
}
```

Props without `y` snap onto the ground under their centre. Unknown part ids are dropped and listed in `warnings`.
