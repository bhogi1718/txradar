import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WalletSearch } from "./wallet-search";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("WalletSearch", () => {
  beforeEach(() => push.mockReset());

  it("detects the chain live and navigates to the canonical wallet URL", async () => {
    const user = userEvent.setup();
    render(<WalletSearch />);

    await user.type(
      screen.getByLabelText("Wallet address"),
      "0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045",
    );
    expect(screen.getByText("Ethereum")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /scan/i }));
    expect(push).toHaveBeenCalledWith(
      "/ethereum/0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    );
  });

  it("routes Bitcoin and Tron addresses to their chains", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WalletSearch />);
    await user.type(
      screen.getByLabelText("Wallet address"),
      "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun{Enter}",
    );
    expect(push).toHaveBeenLastCalledWith(
      "/bitcoin/bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun",
    );
    unmount();

    render(<WalletSearch />);
    await user.type(
      screen.getByLabelText("Wallet address"),
      "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy{Enter}",
    );
    expect(push).toHaveBeenLastCalledWith("/tron/TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy");
  });

  it("explains an empty submit", async () => {
    const user = userEvent.setup();
    render(<WalletSearch />);
    await user.click(screen.getByRole("button", { name: /scan/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/paste a wallet address/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("gives a chain-specific hint for an incomplete address", async () => {
    const user = userEvent.setup();
    render(<WalletSearch />);
    const input = screen.getByLabelText("Wallet address");
    await user.type(input, "0xd8dA6BF2{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(/looks like a ethereum address/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects text that matches no chain and clears the error on edit", async () => {
    const user = userEvent.setup();
    render(<WalletSearch />);
    const input = screen.getByLabelText("Wallet address");
    await user.type(input, "hello world{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /not a bitcoin, ethereum or tron/i,
    );

    await user.type(input, "!");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("focuses on '/' from anywhere on the page", async () => {
    const user = userEvent.setup();
    render(<WalletSearch />);
    await user.keyboard("/");
    expect(screen.getByLabelText("Wallet address")).toHaveFocus();
  });
});
