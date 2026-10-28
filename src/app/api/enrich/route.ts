import { PRICE_USDC, merchant } from "@/lib/mpp";
import { registry } from "@/lib/agent";

/**
 * The paid endpoint.
 *
 *   POST with no credential -> 402 + WWW-Authenticate challenge (Sui, USDC)
 *   POST with a paid digest -> the profile, plus a Payment-Receipt header
 *
 * A judge can curl this and see a real 402 on Sui mainnet rather than a mock.
 *
 * The merchant is built inside the handler, not at module scope. At module
 * scope it ran during `next build`, where MPP_RECIPIENT does not exist, so the
 * unconfigured null was baked into the deployment and production answered 503
 * forever. Env has to be read when the request arrives.
 */
async function answer(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { address?: string };
  const address = body.address?.trim().toLowerCase();
  if (!address) return Response.json({ error: "address is required" }, { status: 400 });

  // Read after payment on purpose: paying buys the current profile, and a
  // profile can change between the preview and the charge.
  const reg = await registry();
  const profile =
    reg.get(address) ??
    ({ address, label: null, category: null, sources: 0, confidence: 0 } as const);

  return Response.json({ profile, price: PRICE_USDC, network: "sui:mainnet", currency: "USDC" });
}

export async function POST(req: Request) {
  let merchantHandler;
  try {
    merchantHandler = merchant().charge({ amount: PRICE_USDC });
  } catch (err) {
    return Response.json(
      { error: `merchant not configured: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  try {
    return await merchantHandler(answer)(req);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
