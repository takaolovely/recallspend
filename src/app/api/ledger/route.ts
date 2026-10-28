import { loadLedger } from "@/lib/ledger";
import { budget } from "@/lib/tatum";
import { balances } from "@/lib/balance";

/** Reads only memory. Zero Tatum credits, by construction. */
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet")?.trim().toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{64}$/.test(wallet)) {
    return Response.json({ error: "wallet must be a 0x-prefixed 32-byte Sui address" }, { status: 400 });
  }

  try {
    // Balance comes from the free public endpoint and is cached a minute; a
    // failure there must not take the ledger down with it, but it is reported
    // rather than swallowed so a broken balance is visible instead of "0.00".
    const [ledger, balResult] = await Promise.all([
      loadLedger(wallet),
      balances(wallet)
        .then((b) => ({ balances: b, error: undefined as string | undefined }))
        .catch((e) => ({ balances: [] as Awaited<ReturnType<typeof balances>>, error: String(e?.message ?? e) })),
    ]);
    return Response.json({
      ledger,
      balances: balResult.balances,
      balanceError: balResult.error,
      tatum: budget(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
