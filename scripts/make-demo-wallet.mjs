/**
 * Build the demo wallet judges paste.
 *
 * The agent's own wallet must not double as the demo: the panel shows the payer
 * address, so using one account for both makes the whole thing look like the app
 * paying itself. This creates a separate user wallet, funds it from the agent,
 * and makes three real outflows to three addresses the seller knows but the user
 * does not — which is exactly the state the "Get label" button exists for.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey, encodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

const AGENT_KEY = "/home/ubuntu/.hermes/keys/hackathon-2026/sui-private.key";
const DEMO_KEY = "/home/ubuntu/.hermes/keys/hackathon-2026/demo-user.key";
const FUND_SUI = 20_000_000; // 0.02 SUI
const SPEND = 1_500_000; // 0.0015 SUI per merchant

const client = new SuiGrpcClient({
  baseUrl: "https://fullnode.mainnet.sui.io:443",
  network: "mainnet",
});

const agent = Ed25519Keypair.fromSecretKey(
  decodeSuiPrivateKey(fs.readFileSync(AGENT_KEY, "utf8").trim()).secretKey,
);

let demo;
if (fs.existsSync(DEMO_KEY)) {
  demo = Ed25519Keypair.fromSecretKey(
    decodeSuiPrivateKey(fs.readFileSync(DEMO_KEY, "utf8").trim()).secretKey,
  );
  console.log("demo wallet exists:", demo.toSuiAddress());
} else {
  const secret = crypto.randomBytes(32);
  demo = Ed25519Keypair.fromSecretKey(secret);
  fs.writeFileSync(DEMO_KEY, encodeSuiPrivateKey(secret, "ED25519"), { mode: 0o600 });
  console.log("demo wallet created:", demo.toSuiAddress());
}

const merchants = [
  {
    label: "Coffee Shop",
    category: "Food",
    address: "0x93f29c7281b3351ce82db9962623a2c1a6e1ae8ee485680dda0cea646cc049de",
  },
  {
    label: "Delivery",
    category: "Transport",
    address: "0x5dfb70cf9636857306f059d719a8f4266111e28704d1072c6abe068e51d93044",
  },
  {
    label: "Grocery Store",
    category: "Groceries",
    address: "0x4d4737df14b2899feac53d430aa58a7716680b6240ccf323d0b376adf6017372",
  },
];

async function send(signer, to, amount, gas = 5_000_000) {
  const tx = new Transaction();
  tx.setGasBudget(gas);
  const [coin] = tx.splitCoins(tx.gas, [amount]);
  tx.transferObjects([coin], to);
  const res = await client.signAndExecuteTransaction({ signer, transaction: tx });
  if (res.$kind !== "Transaction") throw new Error(`failed: ${JSON.stringify(res).slice(0, 300)}`);
  console.log("  tx", res.Transaction.digest);
  return res.Transaction.digest;
}

console.log("funding demo wallet from agent…");
await send(agent, demo.toSuiAddress(), FUND_SUI);
await new Promise((r) => setTimeout(r, 4000));

console.log("creating merchant outflows…");
for (const m of merchants) {
  m.digest = await send(demo, m.address, SPEND);
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("\nDEMO_WALLET=" + demo.toSuiAddress());
for (const m of merchants) {
  console.log(`SEED  { address: "${m.address}", label: "${m.label}", category: "${m.category}" }`);
}
