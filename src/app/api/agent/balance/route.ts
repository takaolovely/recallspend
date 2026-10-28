import { agentWallet } from "@/lib/agent";
import { PRICE_USDC } from "@/lib/mpp";

export const maxDuration = 30;

/**
 * The agent's Sui account, read fresh.
 *
 * Used by the payments panel so the balance on screen is the balance on chain.
 * `?fresh=1` bypasses the 60s cache — it is set right after a payment, when a
 * stale number would read as "the payment did not go through".
 */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    const wallet = await agentWallet({ fresh });
    if (!wallet) {
      return Response.json({ error: "AGENT_SUI_KEY is not configured" }, { status: 503 });
    }
    return Response.json({
      ...wallet,
      price: PRICE_USDC,
      network: "sui:mainnet",
      currency: "USDC",
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
