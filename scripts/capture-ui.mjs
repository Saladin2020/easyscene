/**
 * Headless Chrome (CDP) screenshot of a page — used for README shots of the UI.
 *
 *   node scripts/capture-ui.mjs [url] [out.png] [--wait "<js expression>"] [--eval "<js>"] [--size 1500x1100]
 *
 * Defaults: http://127.0.0.1:8788/  →  docs/assets/ui-editor.png, waiting for the editor canvas.
 * Chrome: CHROME_PATH, else google-chrome / chromium on Linux, Chrome on Windows/macOS.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const waitExpr = flag("--wait", "document.querySelector('.stage-wrap canvas') && document.querySelector('.parallax-box canvas') ? 'ok' : ''");
const evalExpr = flag("--eval", "");
const [W, H] = flag("--size", "1500x1100").split("x").map(Number);
const URL = args[0] || "http://127.0.0.1:8788/";
const OUT = path.resolve(args[1] || "docs/assets/ui-editor.png");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) throw new Error("Chrome not found — set CHROME_PATH");

const PORT = 9300 + Math.floor(Math.random() * 400);
const profile = await mkdtemp(path.join(os.tmpdir(), "easyscene-chrome-"));
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${W},${H}`,
    "--no-first-run",
    "--no-default-browser-check",
    URL,
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`CDP not ready: ${url}`);
}

try {
  await sleep(800);
  const targets = await waitJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find((t) => t.type === "page") ?? targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      const onMsg = (ev) => {
        const data = JSON.parse(String(ev.data));
        if (data.id !== msgId) return;
        ws.removeEventListener("message", onMsg);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  await send("Runtime.enable");
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    const { result } = await send("Runtime.evaluate", { expression: waitExpr, returnByValue: true });
    ready = Boolean(result.value);
    if (!ready) await sleep(250);
  }
  if (!ready) console.warn("wait condition never became true; capturing anyway");
  if (evalExpr) await send("Runtime.evaluate", { expression: evalExpr, awaitPromise: true });
  await sleep(1500);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(OUT, Buffer.from(shot.data, "base64"));
  ws.close();
  console.log(`Wrote ${OUT}`);
} finally {
  chrome.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
