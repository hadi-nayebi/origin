import { afterEach, describe, expect, test, vi } from "vitest";

import { request } from "./api";

describe("API request headers", () => {
  afterEach(() => vi.unstubAllGlobals());

  test.each([
    new Headers({ Authorization: "Bearer token" }),
    [["Authorization", "Bearer token"]] as [string, string][],
    { Authorization: "Bearer token" },
  ])("preserves every RequestInit header representation", async (headers) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const normalized = new Headers(init?.headers);
      expect(normalized.get("authorization")).toBe("Bearer token");
      expect(normalized.get("content-type")).toBe("application/json");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(request<{ ok: boolean }>("/api/example", { headers })).resolves.toEqual({
      ok: true,
    });
  });

  test("does not overwrite an explicit content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("content-type")).toBe("application/merge-patch+json");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await request("/api/example", {
      headers: new Headers({ "Content-Type": "application/merge-patch+json" }),
    });
  });
});
