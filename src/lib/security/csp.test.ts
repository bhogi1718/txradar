import { buildCsp, createNonce } from "./csp";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split("; ").map((d) => {
      const [name = "", ...values] = d.split(" ");
      return [name, values];
    }),
  );
}

describe("buildCsp", () => {
  it("locks scripts to the nonce", () => {
    const d = directives(buildCsp("abc"));
    expect(d.get("script-src")).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(d.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("only allows eval in development", () => {
    expect(directives(buildCsp("abc", { dev: true })).get("script-src")).toContain(
      "'unsafe-eval'",
    );
    expect(buildCsp("abc")).not.toContain("unsafe-eval");
  });

  it("keeps the browser on this origin and blocks framing", () => {
    const d = directives(buildCsp("abc"));
    expect(d.get("connect-src")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
  });

  it("never puts a nonce in style-src (it would disable 'unsafe-inline')", () => {
    expect(directives(buildCsp("abc")).get("style-src")?.join(" ")).not.toContain(
      "nonce",
    );
  });
});

describe("createNonce", () => {
  it("is base64 of 16 random bytes and differs per call", () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(a).not.toBe(createNonce());
  });
});
