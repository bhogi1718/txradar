import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { summarizeCounterparties } from "@/lib/analytics/counterparties";
import type { Transaction } from "@/lib/schemas/transaction";
import { makeTx } from "@/test/factories";

import { CounterpartiesPanel } from "./counterparties-panel";
import { CounterpartyInspector } from "./counterparty-inspector";
import { TransactionsTable } from "./transactions-table";

const ROOT = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";
const C = "0x00000000000000000000000000000000000000cc";
const BINANCE_14 = "0x28c6c06298d514db089934071355e5743bf21d60";

const histories: Record<string, Transaction[]> = {
  [ROOT]: [
    makeTx({ direction: "in", from: A, to: ROOT, value: 3 }),
    makeTx({ direction: "out", from: ROOT, to: A, value: 1 }),
    makeTx({ direction: "in", from: BINANCE_14, to: ROOT, value: 2 }),
  ],
  [A]: [
    makeTx({ direction: "out", from: A, to: ROOT, value: 3 }),
    makeTx({ direction: "out", from: A, to: B, value: 5 }),
    makeTx({ direction: "out", from: A, to: B, value: 1 }),
    makeTx({ direction: "in", from: C, to: A, value: 2 }),
  ],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    const address = url.searchParams.get("address")!;
    const body = {
      data: {
        chain: "ethereum",
        address,
        transactions: histories[address] ?? [],
        fetchedAt: new Date().toISOString(),
        cached: false,
      },
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function withQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const fetchedAddresses = () =>
  fetchMock.mock.calls.map(([u]) =>
    new URL(String(u), "http://localhost").searchParams.get("address"),
  );

describe("CounterpartyInspector", () => {
  it("is closed with an empty trail", () => {
    render(
      withQuery(
        <CounterpartyInspector
          chain="ethereum"
          root={ROOT}
          trail={[]}
          onTrailChange={() => {}}
        />,
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the relationship from the root's side and the counterparty's own activity", async () => {
    render(
      withQuery(
        <CounterpartyInspector
          chain="ethereum"
          root={ROOT}
          trail={[A]}
          onTrailChange={() => {}}
        />,
      ),
    );
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/with this wallet/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByText("Transactions").nextSibling).toHaveTextContent("2"),
    );
    // A's own history loads and offers its other counterparties (not the root)
    expect(await within(dialog).findByTitle(`Follow to ${B}`)).toBeInTheDocument();
    expect(within(dialog).queryByTitle(`Follow to ${ROOT}`)).not.toBeInTheDocument();
  });

  it("follows the money one hop deeper and jumps back via the breadcrumb", async () => {
    const onTrailChange = vi.fn();
    const { rerender } = render(
      withQuery(
        <CounterpartyInspector
          chain="ethereum"
          root={ROOT}
          trail={[A]}
          onTrailChange={onTrailChange}
        />,
      ),
    );
    await userEvent.click(await screen.findByTitle(`Follow to ${B}`));
    expect(onTrailChange).toHaveBeenLastCalledWith([A, B]);

    rerender(
      withQuery(
        <CounterpartyInspector
          chain="ethereum"
          root={ROOT}
          trail={[A, B]}
          onTrailChange={onTrailChange}
        />,
      ),
    );
    const path = await screen.findByRole("navigation", { name: /drill-down path/i });
    expect(within(path).getByText("0xd8…6045")).toBeInTheDocument();
    expect(within(path).getByText("0x00…00bb")).toHaveAttribute("aria-current", "page");

    await userEvent.click(within(path).getByText("0x00…00aa"));
    expect(onTrailChange).toHaveBeenLastCalledWith([A]);
  });

  it("doesn't scan a known exchange until asked", async () => {
    render(
      withQuery(
        <CounterpartyInspector
          chain="ethereum"
          root={ROOT}
          trail={[BINANCE_14]}
          onTrailChange={() => {}}
        />,
      ),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Binance 14")).toBeInTheDocument();
    await waitFor(() => expect(fetchedAddresses()).toContain(ROOT));
    expect(fetchedAddresses()).not.toContain(BINANCE_14);

    await userEvent.click(within(dialog).getByRole("button", { name: /scan anyway/i }));
    await waitFor(() => expect(fetchedAddresses()).toContain(BINANCE_14));
  });
});

describe("CounterpartiesPanel", () => {
  it("lists counterparties busiest first and opens one on click", async () => {
    const onOpen = vi.fn();
    render(
      <CounterpartiesPanel
        counterparties={summarizeCounterparties(histories[ROOT]!)}
        symbol="ETH"
        onOpen={onOpen}
      />,
    );
    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveAttribute("title", `Inspect ${A}`);
    expect(within(rows[1]!).getByText("Binance 14")).toBeInTheDocument();

    await userEvent.click(rows[0]!);
    expect(onOpen).toHaveBeenCalledWith(A);
  });
});

describe("TransactionsTable drill-down and export", () => {
  it("opens the inspector from a counterparty cell", async () => {
    const onOpen = vi.fn();
    render(
      <TransactionsTable
        data={histories[ROOT]!}
        chain="ethereum"
        pricing={{}}
        onOpenCounterparty={onOpen}
      />,
    );
    await userEvent.click(screen.getAllByTitle(`Inspect ${A}`)[0]!);
    expect(onOpen).toHaveBeenCalledWith(A);
  });

  it("exports all filtered rows in the current sort order, not just the visible page", async () => {
    const onExport = vi.fn();
    const many = Array.from({ length: 30 }, (_, i) =>
      makeTx({ timestamp: 1000 + i, value: i }),
    );
    render(
      <TransactionsTable data={many} chain="ethereum" pricing={{}} onExport={onExport} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /amount/i })); // sort by amount, desc first
    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    const exported = onExport.mock.calls[0]![0] as Transaction[];
    expect(exported).toHaveLength(30); // page size is 25
    expect(exported[0]!.value).toBe(29);
    expect(exported[29]!.value).toBe(0);
  });
});
