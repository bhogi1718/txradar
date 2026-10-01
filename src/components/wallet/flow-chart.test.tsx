import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { makeTx } from "@/test/factories";

import { FlowChart } from "./flow-chart";

describe("FlowChart", () => {
  it("shows an empty message when nothing moved", () => {
    render(<FlowChart txs={[]} symbol="ETH" />);
    expect(screen.getByText(/no value moved/i)).toBeInTheDocument();
  });

  it("describes totals for assistive tech and lets you switch scale", async () => {
    const day = Date.UTC(2026, 8, 1);
    render(
      <FlowChart
        symbol="ETH"
        txs={[
          makeTx({ timestamp: day, direction: "in", value: 2 }),
          makeTx({ timestamp: day + 86_400_000, direction: "out", value: 0.5 }),
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: /2 ETH in and 0.5 ETH out/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/log scale/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Linear" }));
    expect(screen.queryByText(/log scale/)).not.toBeInTheDocument();
  });
});
