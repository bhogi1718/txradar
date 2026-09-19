import { sharedCache, TtlCache } from "./cache";

describe("TtlCache", () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000;
  });

  it("returns undefined for missing or expired keys", () => {
    const cache = new TtlCache<number>({ now });
    expect(cache.get("a")).toBeUndefined();

    cache.set("a", 1, 100);
    expect(cache.get("a")).toEqual({ value: 1, hit: true, ageMs: 0 });

    clock += 100;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("ignores non-positive TTLs", () => {
    const cache = new TtlCache<number>({ now });
    cache.set("a", 1, 0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the oldest entries past maxEntries", () => {
    const cache = new TtlCache<number>({ now, maxEntries: 2 });
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.set("c", 3, 1000);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")?.value).toBe(2);
    expect(cache.get("c")?.value).toBe(3);
  });

  it("re-setting a key refreshes its recency", () => {
    const cache = new TtlCache<number>({ now, maxEntries: 2 });
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.set("a", 10, 1000); // a is now newest
    cache.set("c", 3, 1000); // evicts b
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.value).toBe(10);
  });

  describe("getOrLoad", () => {
    it("loads once and serves hits afterwards", async () => {
      const cache = new TtlCache<string>({ now });
      const load = vi.fn(async () => "v");

      expect(await cache.getOrLoad("k", 500, load)).toEqual({
        value: "v",
        hit: false,
        ageMs: 0,
      });
      expect(await cache.getOrLoad("k", 500, load)).toEqual({
        value: "v",
        hit: true,
        ageMs: 0,
      });
      expect(load).toHaveBeenCalledTimes(1);

      clock += 500;
      await cache.getOrLoad("k", 500, load);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("coalesces concurrent loads for the same key", async () => {
      const cache = new TtlCache<string>({ now });
      let resolve!: (v: string) => void;
      const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

      const a = cache.getOrLoad("k", 500, load);
      const b = cache.getOrLoad("k", 500, load);
      expect(load).toHaveBeenCalledTimes(1);

      resolve("v");
      expect((await a).value).toBe("v");
      expect((await b).value).toBe("v");
    });

    it("does not cache a rejected load and allows retry", async () => {
      const cache = new TtlCache<string>({ now });
      const load = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("ok");

      await expect(cache.getOrLoad("k", 500, load)).rejects.toThrow("boom");
      expect(cache.get("k")).toBeUndefined();
      expect((await cache.getOrLoad("k", 500, load)).value).toBe("ok");
    });
  });

  it("sharedCache returns the same instance per name", () => {
    expect(sharedCache("x")).toBe(sharedCache("x"));
    expect(sharedCache("x")).not.toBe(sharedCache("y"));
  });
});
