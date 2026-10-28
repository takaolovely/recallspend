/**
 * The seller's inventory.
 *
 * Two things can name a merchant address:
 *
 *   1. a correction another wallet already made, folded in at read time from
 *      Walrus Memory (see `registry()` in agent.ts)
 *   2. this seed directory, which is what makes the market non-empty on day one
 *
 * Every entry carries its provenance and the UI prints it. A label that came
 * from a seeded demo entry says exactly that. The alternative — quietly
 * presenting seed data as if several users had agreed on it — is the one thing
 * that would make the rest of this app untrustworthy.
 *
 * Why a seed at all: the market is user corrections, and a brand new deployment
 * has none. Without a seed the agent would charge 0.01 USDC and receive
 * `label: null`, which is the worst possible demo: money moving for nothing.
 */

export type SeedLabel = {
  address: string;
  label: string;
  category: string;
  /** Printed verbatim in the UI, so a judge can tell seed from learned. */
  source: string;
};

export const SEED: SeedLabel[] = [
  {
    address: "0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256",
    label: "Coffee Shop",
    category: "Food",
    source: "seed directory",
  },
  {
    address: "0x93f29c7281b3351ce82db9962623a2c1a6e1ae8ee485680dda0cea646cc049de",
    label: "Coffee Shop",
    category: "Food",
    source: "seed directory",
  },
  {
    address: "0x5dfb70cf9636857306f059d719a8f4266111e28704d1072c6abe068e51d93044",
    label: "Delivery",
    category: "Transport",
    source: "seed directory",
  },
  {
    address: "0x4d4737df14b2899feac53d430aa58a7716680b6240ccf323d0b376adf6017372",
    label: "Grocery Store",
    category: "Groceries",
    source: "seed directory",
  },
];

export function seedLabel(address: string): SeedLabel | null {
  const a = address.toLowerCase();
  return SEED.find((s) => s.address.toLowerCase() === a) ?? null;
}
