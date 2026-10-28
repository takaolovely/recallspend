import { recordLabel } from "@/lib/agent";

export const maxDuration = 60;

/**
 * STEP 2 — remember.
 *
 * Takes the digest of the payment made in step 1, proves it on Sui, then writes
 * the pay line and the rule line. Idempotent, so the client can retry this
 * freely after a timeout without paying twice.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    id?: string;
    digest?: string;
  };
  const wallet = body.wallet?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet) || !body.id || !body.digest) {
    return Response.json({ error: "wallet, id and digest are required" }, { status: 400 });
  }

  try {
    const result = await recordLabel({ wallet, spendId: body.id, digest: body.digest.trim() });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), status: "error" },
      { status: 500 },
    );
  }
}
