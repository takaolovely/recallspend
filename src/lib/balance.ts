import { SuiGraphQLClient } from "@mysten/sui/graphql";

/**
 * Wallet balance from the public Sui GraphQL endpoint, not Tatum.
 *
 * Balances are not the judged integration and they change constantly, so
 * spending Tatum credits on them would be the same mistake in miniature that
 * killed a previous allowance. The public endpoint is free and this value is
 * cached for a minute per server instance.
 *
 * Tatum GraphQL is still the source for address history — the part the
 * hackathon actually scores — because only it gives paginated transaction
 * history in one query.
 */

export type Balance = {
  symbol: string;
  amount: number;
  decimals: number;
};

/**
 * Coin matching by suffix, not by exact string.
 *
 * The same coin has several spellings on Sui: `0x2::sui::SUI` and the fully
 * padded `0x000…002::sui::SUI` are the same coin type, and GraphQL returns the
 * padded one. An exact-match map silently produced an empty balance list.
 */
const COINS = [
  { match: "::sui::SUI", symbol: "SUI", decimals: 9 },
  {
    match: "::usdc::USDC",
    symbol: "USDC",
    decimals: 6,
  },
];

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; balances: Balance[] }>();

export async function balances(wallet: string): Promise<Balance[]> {
  const hit = cache.get(wallet);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.balances;

  const client = new SuiGraphQLClient({
    url: process.env.SUI_PUBLIC_GRAPHQL || "https://graphql.mainnet.sui.io/graphql",
    network: "mainnet",
  });

  const res = await client.query({
    query: `
      query Balances($a: SuiAddress!) {
        address(address: $a) {
          balances(first: 20) {
            nodes { coinType { repr } totalBalance }
          }
        }
      }`,
    variables: { a: wallet },
  });

  const nodes =
    (res as { data?: { address?: { balances?: { nodes?: Array<{ coinType?: { repr?: string }; totalBalance?: string }> } } } })
      .data?.address?.balances?.nodes ?? [];

  const out: Balance[] = [];
  for (const n of nodes) {
    const repr = n.coinType?.repr;
    if (!repr) continue;
    const meta = COINS.find((c) => repr.endsWith(c.match));
    if (!meta) continue;
    const raw = Number(n.totalBalance ?? 0);
    if (!Number.isFinite(raw)) continue;
    out.push({ symbol: meta.symbol, amount: raw / Math.pow(10, meta.decimals), decimals: meta.decimals });
  }

  // Stable order: USDC first because it is the spending currency, then SUI.
  out.sort((a, b) => (a.symbol === "USDC" ? -1 : b.symbol === "USDC" ? 1 : 0));
  cache.set(wallet, { at: Date.now(), balances: out });
  return out;
}
