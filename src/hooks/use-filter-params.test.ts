import { act, renderHook } from "@testing-library/react";

import { DEFAULT_FILTERS } from "@/lib/analytics/filters";

import { useFilterParams } from "./use-filter-params";

vi.mock("next/navigation", () => ({ usePathname: () => "/ethereum/0xabc" }));

describe("useFilterParams", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, "", "/ethereum/0xabc");
    replaceState = vi.spyOn(window.history, "replaceState");
  });
  afterEach(() => replaceState.mockRestore());

  it("starts from the server-parsed filters without touching the URL", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULT_FILTERS));
    expect(result.current[0]).toEqual(DEFAULT_FILTERS);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("merges patches and mirrors only non-defaults into the URL", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULT_FILTERS));
    act(() => result.current[1]({ dir: "out" }));
    act(() => result.current[1]({ q: "uni" }));

    expect(result.current[0]).toMatchObject({ dir: "out", q: "uni", range: "all" });
    expect(window.location.search).toBe("?dir=out&q=uni");

    act(() => result.current[1]({ dir: "all", q: "" }));
    expect(window.location.search).toBe("");
  });

  it("never updates the URL during render (only after commit)", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULT_FILTERS));
    let calledDuringSetter = false;
    replaceState.mockImplementation(() => {});
    act(() => {
      result.current[1]({ dir: "in" });
      calledDuringSetter = replaceState.mock.calls.length > 0;
    });
    expect(calledDuringSetter).toBe(false);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });
});
