import { loadLedger } from "@/lib/ledger";
import { budget } from "@/lib/tatum";


/** Reads only memory. Zero Tatum credits, by construction. */
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet")?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet)) {
    return Response.json({ error: "wallet must be a 0x-prefixed 32-byte Sui address" }, { status: 400 });
  }

  try {
    const ledger = await loadLedger(wallet);
    return Response.json({ ledger, tatum: budget() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
