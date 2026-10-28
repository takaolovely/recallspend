import { preview } from "@/lib/agent";


/**
 * Free preview so an agent never pays for a lookup that has no answer.
 * Returning "known: false" costs nothing and saves the 0.01 USDC.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim().toLowerCase();
  if (!address) return Response.json({ error: "address is required" }, { status: 400 });
  return Response.json(await preview(address));
}
