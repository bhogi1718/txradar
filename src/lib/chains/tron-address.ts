import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Tron addresses are Base58Check-encoded 21-byte payloads: 0x41 prefix
 * followed by the 20-byte account id. TronGrid returns the hex form in
 * `raw_data`, so we need both directions.
 *
 * Isomorphic on purpose (no node:crypto, no Buffer): the search form runs
 * the same checksum validation in the browser that the API runs on the server.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP = new Map([...ALPHABET].map((c, i) => [c, i] as const));

const TRON_PREFIX = 0x41;
const PAYLOAD_LENGTH = 21;
const CHECKSUM_LENGTH = 4;

function checksum(payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).subarray(0, CHECKSUM_LENGTH);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);

  let out = "";
  while (n > 0n) {
    const rem = Number(n % 58n);
    n /= 58n;
    out = ALPHABET[rem] + out;
  }
  // Preserve leading zero bytes as leading '1's.
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58Decode(text: string): Uint8Array | null {
  let n = 0n;
  for (const c of text) {
    const v = ALPHABET_MAP.get(c);
    if (v === undefined) return null;
    n = n * 58n + BigInt(v);
  }

  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of text) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** Hex (with or without 0x, 41-prefixed) → base58 "T…" address. */
export function tronHexToBase58(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{42}$/.test(clean) || !clean.toLowerCase().startsWith("41")) {
    throw new TypeError(`Not a Tron hex address: ${hex}`);
  }
  const payload = hexToBytes(clean);
  const full = new Uint8Array(PAYLOAD_LENGTH + CHECKSUM_LENGTH);
  full.set(payload);
  full.set(checksum(payload), PAYLOAD_LENGTH);
  return base58Encode(full);
}

/** base58 "T…" address → lowercase hex with 41 prefix. Null if invalid. */
export function tronBase58ToHex(address: string): string | null {
  const bytes = base58Decode(address);
  if (!bytes || bytes.length !== PAYLOAD_LENGTH + CHECKSUM_LENGTH) return null;
  if (bytes[0] !== TRON_PREFIX) return null;

  const payload = bytes.subarray(0, PAYLOAD_LENGTH);
  const given = bytes.subarray(PAYLOAD_LENGTH);
  if (!bytesEqual(checksum(payload), given)) return null;

  return bytesToHex(payload);
}

/** True only when the string is a well-formed, checksum-valid Tron address. */
export function isValidTronAddress(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) && tronBase58ToHex(address) !== null;
}
