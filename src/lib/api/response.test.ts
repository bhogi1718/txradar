import { z } from "zod";

import { UpstreamError } from "@/lib/chains/errors";

import { fail, handleError, ok, parseQuery } from "./response";

describe("api/response", () => {
  it("ok() wraps data and sets cache headers", async () => {
    const res = ok({ a: 1 }, { maxAge: 60, headers: { "x-cache": "HIT" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    expect(res.headers.get("x-cache")).toBe("HIT");
    await expect(res.json()).resolves.toEqual({ data: { a: 1 } });
  });

  it("ok() defaults to no-store", () => {
    expect(ok({}).headers.get("cache-control")).toBe("no-store");
  });

  it("fail() wraps the error and sets Retry-After when present", async () => {
    const res = fail(429, { code: "RATE_LIMITED", message: "slow down", retryAfter: 7 });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("7");
    await expect(res.json()).resolves.toEqual({
      error: { code: "RATE_LIMITED", message: "slow down", retryAfter: 7 },
    });
  });

  describe("parseQuery", () => {
    const schema = z.object({ n: z.coerce.number().int().min(1) });

    it("returns the parsed value", () => {
      const r = parseQuery(new URLSearchParams("n=5"), schema);
      expect(r).toEqual({ ok: true, value: { n: 5 } });
    });

    it("returns a 400 response with issues", async () => {
      const r = parseQuery(new URLSearchParams("n=0"), schema);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.issues[0].path).toBe("n");
    });
  });

  describe("handleError", () => {
    it("maps UpstreamError to its HTTP status and code", async () => {
      const err = new UpstreamError("RATE_LIMITED", "limit", {
        provider: "etherscan",
        retryAfter: 5,
      });
      const res = handleError(err, () => {});
      expect(res.status).toBe(429);
      await expect(res.json()).resolves.toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "limit",
          provider: "etherscan",
          retryAfter: 5,
        },
      });
    });

    it("maps ZodError to 400", () => {
      const parsed = z.object({ a: z.string() }).safeParse({});
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      expect(handleError(parsed.error, () => {}).status).toBe(400);
    });

    it("hides unknown errors behind a generic 500 and logs them", async () => {
      const log = vi.fn();
      const res = handleError(new Error("db password is hunter2"), log);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL");
      expect(JSON.stringify(body)).not.toMatch(/hunter2/);
      expect(log).toHaveBeenCalledOnce();
    });
  });
});
