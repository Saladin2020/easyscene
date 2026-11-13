import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Local-only request guard shared by the web API and the MCP HTTP server.
 *
 * - Host header must be loopback when bound to loopback (blocks DNS rebinding).
 * - Mutating requests with an Origin must be same-origin (or an allowlisted dev origin).
 * - When bound to a non-loopback host (e.g. 0.0.0.0 for iPad/LAN), every request needs the token.
 */

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return LOOPBACK_NAMES.has(h) || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Hostname part of a Host header (`127.0.0.1:8787`, `[::1]:8787`, `localhost`). */
function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0] ?? "";
}

export interface GuardConfig {
  /** Interface the server is bound to (`127.0.0.1`, `0.0.0.0`, …). */
  bindHost: string;
  /** Required when bindHost is not loopback. */
  token?: string;
  /** Extra allowed browser origins, e.g. the Vite dev server. */
  extraOrigins?: string[];
}

export interface GuardInput {
  method: string;
  host?: string | null;
  origin?: string | null;
  token?: string | null;
}

export function tokenRequired(bindHost: string): boolean {
  return !isLoopbackHost(bindHost);
}

export function resolveToken(bindHost: string): string | undefined {
  if (!tokenRequired(bindHost)) return undefined;
  return process.env.EASYSCENE_TOKEN?.trim() || randomBytes(18).toString("base64url");
}

function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Returns null when allowed, otherwise an HTTP status + reason. */
export function checkRequest(
  cfg: GuardConfig,
  req: GuardInput,
): { status: 401 | 403; error: string } | null {
  const host = req.host ?? "";

  if (tokenRequired(cfg.bindHost)) {
    if (!cfg.token || !req.token || !sameToken(req.token, cfg.token)) {
      return { status: 401, error: "Missing or invalid Easy Scene token" };
    }
  } else if (!host || !isLoopbackHost(hostnameOf(host))) {
    return { status: 403, error: "Host not allowed" };
  }

  if (!SAFE_METHODS.has(req.method.toUpperCase()) && req.origin) {
    let originHost = "";
    try {
      originHost = new URL(req.origin).host.toLowerCase();
    } catch {
      return { status: 403, error: "Bad Origin" };
    }
    const sameOrigin = originHost === host.toLowerCase();
    const allowlisted = (cfg.extraOrigins ?? []).includes(req.origin.toLowerCase());
    if (!sameOrigin && !allowlisted) {
      return { status: 403, error: "Cross-origin request blocked" };
    }
  }

  return null;
}

/** Vite dev UI origins (it proxies /api to the API server). */
export const DEV_UI_ORIGINS = ["http://127.0.0.1:5174", "http://localhost:5174"];
