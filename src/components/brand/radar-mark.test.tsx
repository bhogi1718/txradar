import { render, screen } from "@testing-library/react";

import { RadarMark } from "./radar-mark";

describe("RadarMark", () => {
  it("renders an accessible SVG with the brand title", () => {
    render(<RadarMark />);
    expect(screen.getByRole("img", { name: "TxRadar" })).toBeInTheDocument();
  });

  it("only animates when sweeping is enabled", () => {
    const { container, rerender } = render(<RadarMark />);
    expect(container.querySelector(".animate-radar-sweep")).toBeNull();

    rerender(<RadarMark sweeping />);
    expect(container.querySelector(".animate-radar-sweep")).not.toBeNull();
  });
});
