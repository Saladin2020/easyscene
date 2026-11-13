import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { serveStatic } from "@hono/node-server/serve-static";
import { renderParallaxStrip, renderScene } from "../shared/render.js";
import type { ComposeSceneInput } from "../shared/scene.js";
import type { ExportPresetId, SceneDoc } from "../shared/types.js";
import { DEV_UI_ORIGINS, checkRequest } from "../shared/requestGuard.js";
import { composeAndSave, loadAssets, loadCharacterSheet, saveSceneDoc } from "../lib/compose.js";
import { exportScene } from "../lib/export.js";
import { encodePng } from "../lib/png.js";
import { assertSafeId, getWorkspaceSummary, loadParts, loadScene, partImagePath } from "../lib/workspace.js";

export interface CreateAppOptions {
  workspaceRoot: string;
  webRoot?: string;
  dev?: boolean;
  /** Interface the server listens on; non-loopback hosts require `token`. */
  host?: string;
  token?: string;
}

const TOKEN_COOKIE = "easyscene_token";

function tokenPage(): string {
  return `<!doctype html><meta charset="utf-8"><title>Easy Scene</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Scene token required</h1>
<p>Paste the token printed in the terminal that started Easy Scene.</p>
<form method="get"><input name="token" autocomplete="off" style="width:22rem"> <button>Open</button></form>
</body>`;
}

const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const { workspaceRoot, webRoot, dev, host = "127.0.0.1", token } = options;
  const guard = { bindHost: host, token, extraOrigins: dev ? DEV_UI_ORIGINS : [] };

  // No CORS: the UI is same-origin. Block cross-site writes, DNS rebinding, and
  // (beyond loopback) any request without the token.
  app.use("*", async (c, next) => {
    const queryToken = c.req.query("token");
    const provided = c.req.header("x-easyscene-token") ?? queryToken ?? getCookie(c, TOKEN_COOKIE);
    const denied = checkRequest(guard, {
      method: c.req.method,
      host: c.req.header("host"),
      origin: c.req.header("origin"),
      token: provided,
    });
    if (denied) {
      if (denied.status === 401 && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.html(tokenPage(), 401);
      return c.json({ error: denied.error }, denied.status);
    }
    if (token && queryToken) {
      setCookie(c, TOKEN_COOKIE, queryToken, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, workspaceRoot }));
  app.get("/api/workspace", async (c) => c.json(await getWorkspaceSummary(workspaceRoot)));

  app.get("/api/parts/:id/image", async (c) => {
    const id = c.req.param("id");
    const part = (await loadParts(workspaceRoot)).find((p) => p.id === id);
    if (!part) return c.json({ error: "Part not found" }, 404);
    const buf = await readFile(partImagePath(workspaceRoot, part));
    return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });

  app.get("/api/scenes/:id", async (c) => {
    try {
      return c.json(await loadScene(workspaceRoot, c.req.param("id")));
    } catch (e) {
      return c.json({ error: fail(e) }, 404);
    }
  });

  app.post("/api/scenes", async (c) => {
    try {
      const body = (await c.req.json()) as { scene: SceneDoc; dir?: string };
      return c.json({ ok: true, ...(await saveSceneDoc(workspaceRoot, body.scene, body.dir)) });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  app.post("/api/compose", async (c) => {
    try {
      const body = (await c.req.json()) as ComposeSceneInput & { dir?: string };
      return c.json({ ok: true, ...(await composeAndSave(workspaceRoot, body, body.dir)) });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  app.post("/api/export", async (c) => {
    try {
      const body = (await c.req.json()) as {
        id: string;
        preset?: ExportPresetId;
        dir?: string;
        godotParallax?: "parallax2d" | "legacy";
      };
      const res = await exportScene(workspaceRoot, {
        sceneId: assertSafeId(body.id),
        preset: body.preset,
        dir: body.dir,
        godot: { parallax: body.godotParallax },
      });
      return c.json({ ok: true, ...res });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  app.get("/api/preview/:id", async (c) => {
    try {
      const id = c.req.param("id").replace(/\.png$/, "");
      const doc = await loadScene(workspaceRoot, id);
      const assets = await loadAssets(workspaceRoot, doc);
      const img = c.req.query("mode") === "parallax" ? renderParallaxStrip(doc, assets) : renderScene(doc, assets);
      return c.body(new Uint8Array(encodePng(img)), 200, { "Content-Type": "image/png" });
    } catch (e) {
      return c.json({ error: fail(e) }, 404);
    }
  });

  /** Easy Sprite side-view sheet for the walk preview; only from allowed folders. */
  app.get("/api/character", async (c) => {
    const p = c.req.query("path") ?? "";
    try {
      await loadCharacterSheet(workspaceRoot, p);
      const { resolvePath } = await import("../lib/workspace.js");
      const buf = await readFile(resolvePath(workspaceRoot, p, p));
      return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/png" });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  if (!dev && webRoot) {
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", async (c) => {
      try {
        return c.html((await readFile(path.join(webRoot, "index.html"))).toString("utf8"));
      } catch {
        return c.text("Web UI not built yet. Run npm run build:web or start with --dev.", 503);
      }
    });
  } else if (dev) {
    app.get("/", (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><title>Easy Scene (dev)</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Scene API is running</h1><p>Workspace: <code>${workspaceRoot}</code></p>
<p>Open the Vite UI at <a href="http://127.0.0.1:5174" style="color:#f0c36a">http://127.0.0.1:5174</a></p></body>`),
    );
  }
  return app;
}

/** web/dist next to the package, whether running from src/server (tsx) or dist/ (built). */
export function defaultWebRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../web/dist"), path.resolve(here, "../../web/dist")];
  return candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? candidates[1]!;
}
