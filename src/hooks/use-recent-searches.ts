"use client";

import { useCallback, useSyncExternalStore } from "react";

import { CHAINS, type Chain } from "@/lib/schemas/chain";

export type RecentSearch = { chain: Chain; address: string; at: number };

const KEY = "txradar:recent";
const MAX = 6;
const EVENT = "txradar:recent-change";

function read(): RecentSearch[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentSearch =>
        typeof r === "object" &&
        r !== null &&
        CHAINS.includes((r as RecentSearch).chain) &&
        typeof (r as RecentSearch).address === "string" &&
        typeof (r as RecentSearch).at === "number",
    );
  } catch {
    return [];
  }
}

// useSyncExternalStore needs a referentially stable snapshot between changes.
let cache: { raw: string | null; value: RecentSearch[] } = { raw: null, value: [] };

function getSnapshot(): RecentSearch[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // storage blocked (private mode, sandboxed iframe) — behave as empty
  }
  if (raw !== cache.raw) cache = { raw, value: read() };
  return cache.value;
}

const EMPTY: RecentSearch[] = [];
const getServerSnapshot = () => EMPTY;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function write(list: RecentSearch[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // non-essential convenience; ignore
  }
}

/** Last few wallets looked up, newest first. Per-browser convenience only. */
export function useRecentSearches() {
  const recent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((chain: Chain, address: string) => {
    const rest = read().filter((r) => !(r.chain === chain && r.address === address));
    write([{ chain, address, at: Date.now() }, ...rest].slice(0, MAX));
  }, []);

  const remove = useCallback((chain: Chain, address: string) => {
    write(read().filter((r) => !(r.chain === chain && r.address === address)));
  }, []);

  const clear = useCallback(() => write([]), []);

  return { recent, add, remove, clear };
}
