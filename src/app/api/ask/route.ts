import { ask } from "@/lib/ask";

/** Answers come from memory. No model call, so no tokens and no key needed. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wallet?: string; q?: string };
  const wallet = body.wallet?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet)) {
    return Response.json({ error: "bad wallet" }, { status: 400 });
  }
  if (!body.q?.trim()) return Response.json({ error: "q is required" }, { status: 400 });

  try {
    return Response.json(await ask(wallet, body.q));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
