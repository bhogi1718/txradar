import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SectionBoundary } from "./section-boundary";

let shouldThrow = true;

function Flaky() {
  if (shouldThrow) throw new Error("chart exploded");
  return <p>chart ok</p>;
}

describe("SectionBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught errors; keep test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("contains a render error to its section and leaves siblings alone", () => {
    render(
      <>
        <SectionBoundary name="flow timeline">
          <Flaky />
        </SectionBoundary>
        <p>table still here</p>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The flow timeline couldn't be displayed.",
    );
    expect(screen.getByText("table still here")).toBeInTheDocument();
  });

  it("logs the error with the section name", () => {
    render(
      <SectionBoundary name="summary">
        <Flaky />
      </SectionBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      "[summary]",
      expect.objectContaining({ message: "chart exploded" }),
      expect.anything(),
    );
  });

  it("recovers on 'Try again' once the problem is gone", async () => {
    render(
      <SectionBoundary name="summary">
        <Flaky />
      </SectionBoundary>,
    );
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("chart ok")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
