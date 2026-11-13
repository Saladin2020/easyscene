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
| `list_parts` | backgrounds (band, scroll, loop width) · tilesets · props (size, default layer, category). Filter `kind`, `band`, `category` (`building` · `street` · `nature` · `water` · `decor`), `query`. |
| `list_scenes` | saved scenes |
| `get_scene` | one scene document |
| `compose_scene` | create/overwrite a scene: `layers`, `tileset`, `terrain {groundHeight, hills, pits, platforms}` or `tiles` rows, `streets` (rows of props chained edge to edge), `props`, `collision`, `character` |
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

### Streets of buildings

`streets` lays props side by side: each item starts where the previous one ends (`x += width`), from a start `x` snapped down to the 16 px grid. Building parts are 16-px multiples wide, so a street lands on the grid and has no gaps or overlaps. `gap` adds space between every item, `gapBefore` before one item. Items can be ids or `{ part, flipX, color, tint, tintAmount, layer, gapBefore }`. Streets are expanded into ordinary `props` (drawn before the loose `props`), so saved scenes stay plain `easyscene/1`.

```json
{
  "id": "my_soi",
  "width": 60,
  "layers": ["bg_sky_day", "bg_far_temple_hill", "bg_mid_tropical"],
  "tileset": "tiles_street",
  "terrain": { "groundHeight": 3, "pits": [{ "x": 48, "width": 12 }] },
  "streets": [
    { "x": 0, "items": ["prop_bld_thai_house", "prop_bld_noodle_shop", "prop_bld_shophouse_3f", { "part": "prop_bld_shophouse_2f", "color": "#7fb0c0" }, "prop_bld_mini_mart"] },
    { "x": 0, "items": [{ "part": "prop_power_pole_end", "flipX": true }, "prop_power_pole", "prop_power_pole_end"] }
  ],
  "props": [{ "part": "prop_motorbike", "x": 300 }, { "part": "prop_pier", "x": 760 }]
}
```

Power poles are 240 px wide with the wires running to both edges at matching heights, so a row of `prop_power_pole` reads as one line; cap each end with `prop_power_pole_end` (flip the left one).
