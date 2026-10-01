import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { summarizeExposure } from "@/lib/analytics/entities";
import { summarizeTokens } from "@/lib/analytics/tokens";
import { makeTx } from "@/test/factories";

import { EntitiesPanel } from "./entities-panel";
import { TokensPanel } from "./tokens-panel";
import { TransactionsTable } from "./transactions-table";

const BINANCE_14 = "0x28c6c06298d514db089934071355e5743bf21d60";
const USDT = {
  symbol: "USDT",
  contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
};
const SPAM = {
  symbol: "ha138 com",
  contract: "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy",
  decimals: 6,
};
const DAY = 24 * 3600 * 1000;
const D1 = Date.UTC(2026, 8, 1);

describe("EntitiesPanel", () => {
  it("lists labeled counterparties with exchange share and filters on click", async () => {
    const onSelect = vi.fn();
    const exposure = summarizeExposure([
      makeTx({ direction: "in", from: BINANCE_14, value: 3 }),
      makeTx({ direction: "in", from: "0xsomeone", value: 1 }),
    ]);
    render(<EntitiesPanel exposure={exposure} symbol="ETH" onSelect={onSelect} />);

    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /75% of ETH volume/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Binance 14/ }));
    expect(onSelect).toHaveBeenCalledWith("Binance 14");
  });

  it("explains the empty case without implying the wallet is clean", () => {
    render(<EntitiesPanel exposure={summarizeExposure([makeTx()])} symbol="ETH" />);
    expect(screen.getByText(/unlabeled doesn.t mean unknown/i)).toBeInTheDocument();
  });
});

describe("TokensPanel", () => {
  it("shows net per token with USD and flags unpriced tokens as unverified", () => {
    const tokens = summarizeTokens(
      [
        makeTx({ chain: "tron", asset: USDT, direction: "in", value: 10 }),
        makeTx({ chain: "tron", asset: USDT, direction: "out", value: 4 }),
        makeTx({ chain: "tron", asset: SPAM, direction: "in", value: 1000 }),
      ],
      { [USDT.contract]: 1 },
    );
    render(<TokensPanel tokens={tokens} />);

    const usdt = screen.getByRole("button", { name: /USDT/ });
    expect(within(usdt).getByText("+6")).toBeInTheDocument();
    expect(within(usdt).getByText("+$6.00")).toBeInTheDocument();

    const spam = screen.getByRole("button", { name: /ha138 com/ });
    expect(within(spam).getByText(/unverified/)).toBeInTheDocument();
    expect(within(spam).getByText("no price")).toBeInTheDocument();
    expect(screen.getByText(/usually spam airdrops/)).toBeInTheDocument();
  });
});

describe("TransactionsTable enrichment", () => {
  it("tags labeled counterparties, shows per-row symbols and prices by transfer date", () => {
    const data = [
      makeTx({ direction: "in", from: BINANCE_14, value: 2, timestamp: D1 + DAY }),
      makeTx({
        chain: "ethereum",
        asset: {
          symbol: "USDC",
          contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          decimals: 6,
        },
        direction: "out",
        to: "0xabc",
        value: 50,
        timestamp: D1,
      }),
    ];
    render(
      <TransactionsTable
        data={data}
        chain="ethereum"
        pricing={{
          history: [
            [D1, 100],
            [D1 + DAY, 110],
          ],
          current: 999,
          tokens: { "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1 },
        }}
      />,
    );

    expect(screen.getByText("Binance 14")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    // native: priced on its own day (2 × 110), not today's 999
    const historical = screen.getByText("$220.00");
    expect(historical).toHaveAttribute(
      "title",
      expect.stringMatching(/^At the .* price$/),
    );
    // token: today's price, marked with an asterisk
    expect(screen.getByText("$50.00").closest("span")).toHaveAttribute(
      "title",
      "At today's price",
    );
  });

  it("marks tokens without a price as unverified in the amount cell", () => {
    render(
      <TransactionsTable
        data={[makeTx({ chain: "tron", asset: SPAM, direction: "in", value: 1000 })]}
        chain="tron"
        pricing={{ tokens: {} }}
      />,
    );
    expect(screen.getByTitle(/no market price; possibly a spam token/)).toHaveTextContent(
      "ha138 com",
    );
  });

  it("keeps rows distinct when one tx carries several token transfers", () => {
    const hash = "0xsame";
    render(
      <TransactionsTable
        data={[
          makeTx({ hash, asset: USDT, value: 1 }),
          makeTx({ hash, asset: SPAM, value: 2 }),
        ]}
        chain="tron"
        pricing={{}}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  });
});
