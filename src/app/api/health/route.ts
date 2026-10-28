import { budget, probe } from "@/lib/tatum";
import { memoryCount } from "@/lib/memory";
import { merchantAddress } from "@/lib/mpp";


/**
 * Health, with the numbers a judge will ask for: how much of the Tatum
 * allowance is left, how many memories exist (the ≥10 gate), and which wallet
 * receives agent payments.
 *
 * `?probe=1` performs one real Tatum call (2 credits). Without it, this endpoint
 * reports state only, so it can be polled without a cost.
 */
export async function GET(req: Request) {
  const doProbe = new URL(req.url).searchParams.get("probe") === "1";

  let memories = 0;
  let memoryError: string | undefined;
  try {
    memories = await memoryCount();
  } catch (err) {
    memoryError = err instanceof Error ? err.message : String(err);
  }

  const tatum = doProbe ? { ...budget(), reachable: await probe() } : budget();

  return Response.json({
    ok: Boolean(!memoryError),
    memories,
    memoryError,
    tatum,
    merchant: merchantAddress(),
    network: "sui:mainnet",
  });
}
