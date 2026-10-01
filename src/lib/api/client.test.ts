import { z } from "zod";

import { ApiClientError, apiGet } from "./client";

const schema = z.object({ n: z.number() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function caught(p: Promise<unknown>) {
  return p.then(
    () => {
      throw new Error("expected rejection");
    },
    (e: unknown) => e as ApiClientError,
  );
}

describe("apiGet", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("unwraps and validates { data }", async () => {
    fetchMock.mockResolvedValue(json({ data: { n: 1 } }));
    await expect(apiGet("/x", schema)).resolves.toEqual({ n: 1 });
  });

  it("throws a typed error from { error }", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "slow",
            retryAfter: 9,
            provider: "etherscan",
          },
        },
        429,
      ),
    );
    const err = await caught(apiGet("/x", schema));
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: 9,
      provider: "etherscan",
    });
    expect(err.isTransient).toBe(false);
  });

  it("flags transient errors for retry", async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: "TIMEOUT", message: "slow" } }, 504),
    );
    expect((await caught(apiGet("/x", schema))).isTransient).toBe(true);
  });

  it("maps fetch failure to NETWORK", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await caught(apiGet("/x", schema))).code).toBe("NETWORK");
  });

  it("rethrows aborts untouched so TanStack Query can cancel cleanly", async () => {
    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);
    await expect(apiGet("/x", schema)).rejects.toBe(abort);
  });

  it("maps non-JSON and wrong-shape bodies to BAD_RESPONSE", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }));
    expect((await caught(apiGet("/x", schema))).code).toBe("BAD_RESPONSE");

    fetchMock.mockResolvedValue(json({ data: { n: "one" } }));
    expect((await caught(apiGet("/x", schema))).code).toBe("BAD_RESPONSE");
  });
});
