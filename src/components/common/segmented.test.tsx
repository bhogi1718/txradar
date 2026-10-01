import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { Segmented } from "./segmented";

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("b");
  return (
    <Segmented
      aria-label="Pick"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      options={[
        { value: "a", label: "A", count: 3 },
        { value: "b", label: "B" },
        { value: "c", label: "C", disabled: true },
        { value: "d", label: "D" },
      ]}
    />
  );
}

describe("Segmented", () => {
  it("exposes radiogroup semantics with one checked option in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Pick" })).toBeInTheDocument();
    const b = screen.getByRole("radio", { name: "B" });
    expect(b).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /A/ })).toHaveAttribute("tabindex", "-1");
  });

  it("renders counts", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: /A/ })).toHaveTextContent("3");
  });

  it("selects on click", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "D" }));
    expect(onChange).toHaveBeenCalledWith("d");
    expect(screen.getByRole("radio", { name: "D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("moves with arrow keys, skipping disabled, wrapping at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("radio", { name: "B" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "D" })).toHaveFocus(); // skipped disabled C

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /A/ })).toHaveFocus(); // wrapped

    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: /A/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
