import { enrichSpend } from "@/lib/agent";
import { budget } from "@/lib/tatum";

export const maxDuration = 60;

/** Agent loop: buy one label, write one pay line + one rule line. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wallet?: string; id?: string };
  const wallet = body.wallet?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet) || !body.id) {
    return Response.json({ error: "wallet and id are required" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  try {
    const result = await enrichSpend({ wallet, spendId: body.id, origin });
    return Response.json({ ...result, tatum: budget() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
