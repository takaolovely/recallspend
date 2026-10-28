/**
 * Tatum Sui data layer — GraphQL only.
 *
 * Why not JSON-RPC: Tatum's Sui mainnet gateway does not serve it. `/_methods`
 * on the gateway lists GraphQL and `sui.rpc.v2.*` gRPC and nothing else, so the
 * `suix_queryTransactionBlocks` in every tutorial 404s here. The gRPC gateway
 * has no address index either: it answers "give me this digest" but not "give me
 * this wallet's history". Address history is the only thing this app needs, so
 * GraphQL is the whole data layer, not a fallback.
 *
 * Cost discipline (this is the shape of a previous 100k-credit accident):
 *
 *   - a Sui GraphQL call bills ~2 credits, not 100 — the Prediction API bill is
 *     what died before, and this app never touches that surface
 *   - every call goes through `spend()` here: priced, logged, capped
 *   - callers must never call this from a page render. Ingest runs once per
 *     wallet, writes the result to Walrus Memory, and every later read of the
 *     ledger comes from memory. A page refresh costs zero credits.
 */

const ENDPOINT = "https://sui-mainnet.gateway.tatum.io/graphql";

/** Credits Tatum bills for one Sui GraphQL call. Priced high on purpose. */
const CREDITS_PER_CALL = 2;
const DAY_MS = 86_400_000;

type Budget = {
  day: string;
  credits: number;
  calls: number;
  refused: number;
  lastError?: string;
};

function budgetState(): Budget {
  const g = globalThis as unknown as { __recallspend_tatum__?: Budget };
  if (!g.__recallspend_tatum__) {
    g.__recallspend_tatum__ = { day: day(), credits: 0, calls: 0, refused: 0 };
  }
  const s = g.__recallspend_tatum__;
  if (s.day !== day()) {
    g.__recallspend_tatum__ = { day: day(), credits: 0, calls: 0, refused: 0 };
    return g.__recallspend_tatum__;
  }
  return s;
}

const day = () => new Date().toISOString().slice(0, 10);

/** Daily cap in credits. 500 credits = 250 calls — far above any demo usage. */
function cap(): number {
  const raw = Number(process.env.TATUM_DAILY_CREDITS);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

export class BudgetExceeded extends Error {
  constructor(spent: number, limit: number) {
    super(
      `Tatum daily budget spent (${spent}/${limit} credits). ` +
        `Ledger reads are served from Walrus Memory; raise TATUM_DAILY_CREDITS to sync more.`,
    );
  }
}

export type SpendSnapshot = {
  day: string;
  credits: number;
  calls: number;
  refused: number;
  cap: number;
  remaining: number;
};

export function budget(): SpendSnapshot {
  const s = budgetState();
  return {
    day: s.day,
    credits: s.credits,
    calls: s.calls,
    refused: s.refused,
    cap: cap(),
    remaining: Math.max(0, cap() - s.credits),
  };
}

function spend(operation: string): void {
  const s = budgetState();
  // Counted before the request. A call that times out still bills, and a loop
  // of failing calls is exactly the accident this guard exists to prevent.
  if (s.credits + CREDITS_PER_CALL > cap()) {
    s.refused += 1;
    throw new BudgetExceeded(s.credits, cap());
  }
  s.credits += CREDITS_PER_CALL;
  s.calls += 1;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    op: operation,
    credits: CREDITS_PER_CALL,
    dayTotal: s.credits,
  });
  // Append-only trail so the number in the UI can be checked against a file.
  try {
    const { appendFileSync } = require("node:fs") as typeof import("node:fs");
    appendFileSync(process.env.TATUM_USAGE_LOG || "/tmp/recallspend-tatum.log", line + "\n");
  } catch {
    /* a meter that crashes the app is worse than a meter that misses a line */
  }
}

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

export async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  operation = "query",
): Promise<T> {
  const key = process.env.TATUM_API_KEY;
  if (!key) throw new Error("TATUM_API_KEY is not set");

  spend(operation);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "content-type": "application/json",
      // Cloudflare in front of Tatum answers 403 "error code: 1010" to Node's
      // default user agent. Without this every call dies at the edge.
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 240);
    const s = budgetState();
    s.lastError = `tatum ${res.status}: ${body}`;
    if (res.status === 402) {
      throw new Error(
        `Tatum credits exhausted (402). The ledger still renders from memory; no re-sync until credits reset.`,
      );
    }
    throw new Error(`tatum ${res.status} on ${operation}: ${body}`);
  }

  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(`graphql ${operation}: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error(`graphql ${operation}: empty data`);
  return json.data;
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export type RawBalanceChange = {
  owner: { address: string } | null;
  coinType: { repr: string } | null;
  amount: string;
};

export type RawTx = {
  digest: string;
  effects: {
    timestamp: string | null;
    status: string | null;
    balanceChanges: { nodes: RawBalanceChange[] } | null;
  } | null;
};

const HISTORY = `
  query History($addr: SuiAddress!, $n: Int!, $after: String) {
    transactions(first: $n, filter: { affectedAddress: $addr }, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        digest
        effects {
          timestamp
          status
          balanceChanges(first: 24) {
            nodes {
              owner { address }
              coinType { repr }
              amount
            }
          }
        }
      }
    }
  }
`;

export type HistoryPage = {
  transactions: RawTx[];
  hasNextPage: boolean;
  endCursor: string | null;
};

/** One page of an address's transaction history — 1 call, ~2 credits. */
export async function historyPage(
  address: string,
  limit = 20,
  after: string | null = null,
): Promise<HistoryPage> {
  const data = await gql<{
    transactions: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
      nodes: RawTx[];
    };
  }>(HISTORY, { addr: address, n: Math.min(Math.max(limit, 1), 50), after }, "history");

  return {
    transactions: data.transactions.nodes ?? [],
    hasNextPage: Boolean(data.transactions.pageInfo?.hasNextPage),
    endCursor: data.transactions.pageInfo?.endCursor ?? null,
  };
}

/** Cheap reachability probe used by /api/health. Costs 2 credits; do not loop it. */
export async function probe(): Promise<{ ok: boolean; error?: string }> {
  try {
    await gql<{ __typename: string }>("{ __typename }", {}, "probe");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const COIN: Record<string, { symbol: string; decimals: number }> = {
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI": {
    symbol: "SUI",
    decimals: 9,
  },
  // Native Sui USDC, issued by Circle and bridged by CCTP.
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC": {
    symbol: "USDC",
    decimals: 6,
  },
};

export function coinInfo(repr: string): { symbol: string; decimals: number } {
  const known = COIN[repr];
  if (known) return known;
  const parts = repr.split("::");
  return { symbol: parts[parts.length - 1] || "TOKEN", decimals: 9 };
}

export { DAY_MS };
