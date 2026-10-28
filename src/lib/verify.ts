/**
 * Prove a payment happened before letting it into memory.
 *
 * The agent flow is split in two requests — settle, then remember — because the
 * memory relayer is slow and a Vercel function is capped at 60s. The split has a
 * cost: the second request takes a transaction digest from the client, and a
 * client could hand over a digest of something unrelated.
 *
 * So the digest is checked against the chain before anything is written. Memory
 * only receives a merchant label when a matching USDC transfer exists on Sui from
 * the agent's own address to the seller. That is the whole reason the ledger can
 * claim the fact was bought rather than inferred.
 */

import { SuiGraphQLClient } from "@mysten/sui/graphql";

const USDC_SUFFIX = "::usdc::USDC";

export type Proof = {
  ok: boolean;
  /** Timestamp of the transaction, used as the line's `at`. */
  at?: string;
  reason?: string;
};

type BalanceNode = {
  owner?: { address?: string } | null;
  coinType?: { repr?: string } | null;
  amount?: string;
};

export async function proveUsdcTransfer(opts: {
  digest: string;
  from: string;
  to: string;
  /** Smallest acceptable amount, in whole USDC (0.01). */
  minAmount: number;
}): Promise<Proof> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(opts.digest)) {
    return { ok: false, reason: "that is not a Sui transaction digest" };
  }

  const client = new SuiGraphQLClient({
    url: process.env.SUI_PUBLIC_GRAPHQL || "https://graphql.mainnet.sui.io/graphql",
    network: "mainnet",
  });

  type TxEffects = {
    status?: string | null;
    timestamp?: string | null;
    balanceChanges?: { nodes?: BalanceNode[] } | null;
  };

  let tx: { effects?: TxEffects | null } | null = null;

  try {
    const res = await client.query({
      query: `
        query Prove($d: String!) {
          transaction(digest: $d) {
            effects {
              status
              timestamp
              balanceChanges { nodes { owner { address } coinType { repr } amount } }
            }
          }
        }`,
      variables: { d: opts.digest },
    });
    tx =
      (res as { data?: { transaction?: { effects?: TxEffects | null } | null } }).data?.transaction ??
      null;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  const effects = tx?.effects;
  if (!effects) return { ok: false, reason: "transaction not found on Sui" };
  if (effects.status && effects.status !== "SUCCESS") {
    return { ok: false, reason: `transaction status is ${effects.status}` };
  }

  const me = opts.from.toLowerCase();
  const seller = opts.to.toLowerCase();
  const raw = Math.round(opts.minAmount * 1_000_000);

  let paid = 0;
  let received = 0;
  for (const n of effects.balanceChanges?.nodes ?? []) {
    if (!n.coinType?.repr?.endsWith(USDC_SUFFIX)) continue;
    const owner = n.owner?.address?.toLowerCase();
    const amount = Number(n.amount ?? 0);
    if (!owner || !Number.isFinite(amount)) continue;
    if (owner === me && amount < 0) paid += -amount;
    if (owner === seller && amount > 0) received += amount;
  }

  if (paid < raw) return { ok: false, reason: `the agent did not pay ${opts.minAmount} USDC in this transaction` };
  if (received < raw) return { ok: false, reason: "the seller did not receive the payment" };

  return { ok: true, at: effects.timestamp ?? undefined };
}
