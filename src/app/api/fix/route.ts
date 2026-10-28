import { correctSpend } from "@/lib/ledger";
import { isCategory } from "@/lib/classify";

export const maxDuration = 60;

/** One tap, two memory writes, no credit spend. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    id?: string;
    category?: string;
    label?: string;
  };

  const wallet = body.wallet?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet)) {
    return Response.json({ error: "bad wallet" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
  if (!body.category || !isCategory(body.category)) {
    return Response.json({ error: "unknown category" }, { status: 400 });
  }

  try {
    const result = await correctSpend({
      wallet,
      id: body.id,
      category: body.category,
      label: body.label?.trim() || undefined,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
