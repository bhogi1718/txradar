import type { Transaction } from "@/lib/schemas/transaction";

/** A value-0 contract call: the native-list shadow of a token send. */
function isTokenCall(tx: Transaction): boolean {
  return tx.category === "contract-call" && tx.value === 0;
}

/**
 * Sending a token is a call to the token contract: the native list shows
 * it as a value-0 contract call (carrying the gas fee), the token list shows
 * the real amount. Collapse each pair so the transfer appears once, with the
 * amount from the token row and the fee/block/status from the call.
 *
 * - One call can emit several token transfers (a swap sends token A and
 *   receives token B; a batch pays many people). The fee belongs to the
 *   call, so only the first token row of a hash inherits it; the rest get
 *   null. Copying it to every row would double-count gas.
 * - Only the value-0 call row itself is absorbed. Other native rows with
 *   the same hash — an internal ETH refund, a call that also moved ETH —
 *   are real movements and stay.
 */
export function mergeTokenTransfers(
  native: readonly Transaction[],
  tokens: readonly Transaction[],
): Transaction[] {
  const callByHash = new Map<string, Transaction>();
  for (const tx of native) {
    if (isTokenCall(tx) && !callByHash.has(tx.hash)) callByHash.set(tx.hash, tx);
  }

  const absorbed = new Set<Transaction>();
  const enriched = tokens.map((token) => {
    const call = callByHash.get(token.hash);
    if (!call) return token;
    const fee = absorbed.has(call) ? null : call.fee;
    absorbed.add(call);
    return { ...token, fee, blockHeight: call.blockHeight, status: call.status };
  });

  return [...native.filter((tx) => !absorbed.has(tx)), ...enriched];
}
