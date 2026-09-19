import { z } from "zod";

import { UpstreamError } from "./errors";
import { fetchJson } from "./http";

const schema = z.object({ ok: z.boolean() });

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

async function expectUpstream(promise: Promise<unknown>, code: UpstreamError["code"]) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe(code);
  return err as UpstreamError;
}

describe("fetchJson", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed data on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(fetchJson("https://x.test", { provider: "x", schema })).resolves.toEqual(
      { ok: true },
    );
  });

  it("sends accept header, custom headers and a timeout signal", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await fetchJson("https://x.test", {
      provider: "x",
      schema,
      headers: { "X-Key": "k" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ accept: "application/json", "X-Key": "k" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("forwards the Next.js revalidate hint only when given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await fetchJson("https://x.test", { provider: "x", schema });
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty("next");

    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await fetchJson("https://x.test", { provider: "x", schema, revalidate: 300 });
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ next: { revalidate: 300 } });
  });

  it("maps 429 to RATE_LIMITED with Retry-After", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({}, { status: 429, headers: { "retry-after": "12" } }),
    );
    const err = await expectUpstream(
      fetchJson("https://x.test", { provider: "x", schema }),
      "RATE_LIMITED",
    );
    expect(err.retryAfter).toBe(12);
    expect(err.httpStatus).toBe(429);
  });

  it("maps other non-2xx to UPSTREAM_ERROR", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 503 }));
    const err = await expectUpstream(
      fetchJson("https://x.test", { provider: "x", schema }),
      "UPSTREAM_ERROR",
    );
    expect(err.status).toBe(503);
    expect(err.httpStatus).toBe(502);
  });

  it("maps a body that fails schema validation to SCHEMA_MISMATCH", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: "yes" }));
    const err = await expectUpstream(
      fetchJson("https://x.test", { provider: "x", schema }),
      "SCHEMA_MISMATCH",
    );
    expect(err.message).toMatch(/ok:/);
  });

  it("maps non-JSON to SCHEMA_MISMATCH", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    await expectUpstream(
      fetchJson("https://x.test", { provider: "x", schema }),
      "SCHEMA_MISMATCH",
    );
  });

  it("maps an abort/timeout to TIMEOUT", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expectUpstream(
      fetchJson("https://x.test", { provider: "x", schema, timeoutMs: 5 }),
      "TIMEOUT",
    );
  });

  it("maps other fetch failures to NETWORK", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expectUpstream(
      fetchJson("https://x.test", { provider: "x", schema }),
      "NETWORK",
    );
  });
});
