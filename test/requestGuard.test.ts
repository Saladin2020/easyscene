import { describe, expect, it } from "vitest";
import { DEV_UI_ORIGINS, checkRequest, isLoopbackHost, tokenRequired } from "../src/shared/requestGuard.js";

const local = { bindHost: "127.0.0.1" };
const lan = { bindHost: "0.0.0.0", token: "secret-token" };

describe("isLoopbackHost", () => {
  it.each(["127.0.0.1", "localhost", "::1", "[::1]", "127.1.2.3"])("%s is loopback", (h) =>
    expect(isLoopbackHost(h)).toBe(true),
  );
  it.each(["0.0.0.0", "192.168.1.5", "evil.example"])("%s is not", (h) => expect(isLoopbackHost(h)).toBe(false));
  it("requires a token only off loopback", () => {
    expect(tokenRequired("127.0.0.1")).toBe(false);
    expect(tokenRequired("0.0.0.0")).toBe(true);
  });
});

describe("checkRequest on loopback", () => {
  it("allows same-origin and origin-less requests", () => {
    expect(checkRequest(local, { method: "POST", host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787" })).toBeNull();
    expect(checkRequest(local, { method: "POST", host: "localhost:8787" })).toBeNull();
    expect(checkRequest(local, { method: "GET", host: "127.0.0.1:8787", origin: "https://evil.example" })).toBeNull();
  });

  it("blocks cross-origin writes", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(checkRequest(local, { method, host: "127.0.0.1:8787", origin: "https://evil.example" })?.status).toBe(403);
    }
    expect(checkRequest(local, { method: "POST", host: "127.0.0.1:8787", origin: "null" })?.status).toBe(403);
  });

  it("blocks non-loopback Host headers (DNS rebinding)", () => {
    expect(checkRequest(local, { method: "GET", host: "evil.example:8787" })?.status).toBe(403);
    expect(checkRequest(local, { method: "GET", host: "" })?.status).toBe(403);
  });

  it("allows the Vite dev origin only when allowlisted", () => {
    const req = { method: "POST", host: "127.0.0.1:8787", origin: "http://127.0.0.1:5174" };
    expect(checkRequest(local, req)?.status).toBe(403);
    expect(checkRequest({ ...local, extraOrigins: DEV_UI_ORIGINS }, req)).toBeNull();
  });
});

describe("checkRequest off loopback", () => {
  const host = "192.168.1.5:8787";
  it("requires the right token", () => {
    expect(checkRequest(lan, { method: "GET", host })?.status).toBe(401);
    expect(checkRequest(lan, { method: "GET", host, token: "wrong" })?.status).toBe(401);
    expect(checkRequest(lan, { method: "GET", host, token: "secret-token" })).toBeNull();
  });

  it("still blocks cross-origin writes with a valid token", () => {
    expect(
      checkRequest(lan, { method: "POST", host, token: "secret-token", origin: "https://evil.example" })?.status,
    ).toBe(403);
    expect(checkRequest(lan, { method: "POST", host, token: "secret-token", origin: `http://${host}` })).toBeNull();
  });

  it("fails closed when no token is configured", () => {
    expect(checkRequest({ bindHost: "0.0.0.0" }, { method: "GET", host, token: "anything" })?.status).toBe(401);
  });
});
