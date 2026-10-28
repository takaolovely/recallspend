/**
 * Retract the fabricated "Coffee Shop" label from the wallets it touched.
 *
 * Why this is a write and not a delete: Walrus Memory is append-only. The rule,
 * the 0.01 USDC payment and this retraction all stay readable, in order. Anyone
 * auditing the ledger can see exactly what the app claimed, when, and why it
 * stopped claiming it.
 */
import fs from "node:fs";
import { MemWal } from "@mysten-incubation/memwal";

const env = Object.fromEntries(
  fs
    .readFileSync("/home/ubuntu/recallspend/.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const NS = "recallspend-ledger";
const client = MemWal.create({
  key: env.WALRUS_DELEGATE_KEY,
  accountId: env.WALRUS_ACCOUNT_ID,
  serverUrl: env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  namespace: NS,
});

const TARGET = "0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256";
const REASON = "fabricated demo seed, not a real merchant";

const wallets = [
  // the real user's wallet the label was wrongly applied to
  "0xa8e63d9bf2518d23b9ae7f92782372a86c102763351471bbdd75a1aabc02c8d2",
  // the agent's own wallet, labelled by the same seed during testing
  "0x8fbd10bdc30b5a998bdfbf26d7bae87314b4bdeaa4be53dbbfc5ca88f84e37ca",
];

for (const wallet of wallets) {
  const at = new Date().toISOString();
  const line = ["void", `wallet=${wallet}`, `target=${TARGET}`, `reason=${REASON}`, `at=${at}`].join(
    "|",
  );
  const res = await client.rememberAndWait(line, NS, {
    idempotencyKey: `void:${wallet}:${TARGET}`,
  });
  console.log(wallet.slice(0, 12), "->", res.blob_id);
}
console.log("done");
