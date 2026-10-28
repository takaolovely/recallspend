import { syncWallet } from "@/lib/ledger";
import { budget } from "@/lib/tatum";

export const maxDuration = 60;

/**
 * The only endpoint that spends credits.
 *
 * Hard limits, because a sync button is a loaded gun: 4 pages × 20 transactions
 * = at most 5 Tatum calls (10 credits) per press, and the daily cap refuses
 * anything past 500. Re-pressing is cheap because every extracted line already
 * in memory is skipped before any write.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wallet?: string; sinceDays?: number };
  const wallet = body.wallet?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet)) {
    return Response.json({ error: "wallet must be a 0x-prefixed 32-byte Sui address" }, { status: 400 });
  }

  const sinceDays = Math.min(Math.max(Number(body.sinceDays) || 90, 1), 365);

  try {
    const result = await syncWallet(wallet, { sinceDays, maxPages: 4 });
    return Response.json({ ...result, tatum: budget() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, tatum: budget() }, { status: 500 });
  }
}
