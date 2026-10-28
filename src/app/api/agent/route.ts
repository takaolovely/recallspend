import { payForLabel } from "@/lib/agent";
import { PRICE_USDC } from "@/lib/mpp";
import { budget } from "@/lib/tatum";

export const maxDuration = 60;

/**
 * STEP 1 — settle.
 *
 * Pays 0.01 USDC on Sui and returns the label plus the digest. Writes nothing to
 * memory: the write is slow and gets its own request (/api/agent/record), so a
 * relayer stall can never turn a settled payment into an error.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wallet?: string; id?: string };
  const wallet = body.wallet?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet) || !body.id) {
    return Response.json({ error: "wallet and id are required" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  try {
    const result = await payForLabel({ wallet, spendId: body.id, origin });
    return Response.json({ ...result, price: result.price ?? PRICE_USDC, tatum: budget() });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), status: "error" },
      { status: 500 },
    );
  }
}
