import { makeTx } from "@/test/factories";

import { csvFileName, csvNumber, csvText, transactionsToCsv } from "./csv";

const DAY = 24 * 3600 * 1000;
const D1 = Date.UTC(2026, 8, 1);
const BINANCE_14 = "0x28c6c06298d514db089934071355e5743bf21d60";

function parse(csv: string) {
  const [head, ...rows] = csv.trimEnd().split("\r\n");
  const keys = head!.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [keys[i], v])));
}

describe("csvText", () => {
  it("quotes commas, quotes and newlines per RFC 4180", () => {
    expect(csvText("plain")).toBe("plain");
    expect(csvText("a,b")).toBe('"a,b"');
    expect(csvText('say "hi"')).toBe('"say ""hi"""');
    expect(csvText("line\nbreak")).toBe('"line\nbreak"');
    expect(csvText(null)).toBe("");
  });

  it("defuses spreadsheet formula injection", () => {
    expect(csvText('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvText("+1")).toBe("'+1");
    expect(csvText("-cmd")).toBe("'-cmd");
    expect(csvText("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("csvNumber", () => {
  it("never uses exponent notation", () => {
    expect(csvNumber(1e-9)).toBe("0.000000001");
    expect(csvNumber(-0.00000037313)).toBe("-0.00000037313");
    expect(csvNumber(4444444444)).toBe("4444444444");
    expect(csvNumber(1.5)).toBe("1.5");
    expect(csvNumber(0)).toBe("0");
  });

  it("leaves unknown values empty", () => {
    expect(csvNumber(null)).toBe("");
    expect(csvNumber(Number.NaN)).toBe("");
  });
});

describe("transactionsToCsv", () => {
  it("writes a header plus one CRLF row per tx, in order", () => {
    const csv = transactionsToCsv([
      makeTx({ timestamp: D1 }),
      makeTx({ timestamp: D1 + DAY }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toMatch(/^timestamp_utc,chain,hash,direction/);
    expect(lines).toHaveLength(4); // header, 2 rows, trailing empty
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("signs amounts by direction and zeroes failed txs", () => {
    const rows = parse(
      transactionsToCsv([
        makeTx({ direction: "in", value: 2 }),
        makeTx({ direction: "out", value: 1.5, fee: 0.01 }),
        makeTx({ direction: "out", value: 9, status: "failed" }),
      ]),
    );
    expect(rows.map((r) => r.amount)).toEqual(["2", "-1.5", "0"]);
    expect(rows[1]).toMatchObject({ fee: "0.01", fee_asset: "ETH" });
    expect(rows[0]).toMatchObject({ fee: "", fee_asset: "" });
  });

  it("includes counterparty labels, USD at transfer date and explorer links", () => {
    const [row] = parse(
      transactionsToCsv(
        [makeTx({ direction: "in", from: BINANCE_14, value: 2, timestamp: D1 })],
        {
          pricing: { history: [[D1, 100]] },
        },
      ),
    );
    expect(row).toMatchObject({
      counterparty: BINANCE_14,
      counterparty_label: "Binance 14",
      value_usd: "200",
      value_usd_basis: "historical",
      timestamp_utc: "2026-09-01T00:00:00.000Z",
    });
    expect(row!.explorer_url).toMatch(/^https:\/\/etherscan\.io\/tx\/0x/);
  });

  it("is header-only for no transactions", () => {
    expect(transactionsToCsv([]).trimEnd().split("\r\n")).toHaveLength(1);
  });
});

describe("csvFileName", () => {
  it("is descriptive and filesystem-safe", () => {
    expect(
      csvFileName(
        "ethereum",
        "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
        "30d",
        new Date(Date.UTC(2026, 9, 2)),
      ),
    ).toBe("txradar-ethereum-0xd8da6bf2-30d-2026-10-02.csv");
  });
});
