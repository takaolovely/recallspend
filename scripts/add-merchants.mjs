/**
 * Add two more unbought merchants to the demo wallet.
 *
 * Why: the demo wallet had exactly one uncategorised row left, and both the
 * manual test and the judge need one. Buying the label consumes the row, so a
 * single spare is not enough — after the screen recording nothing would be left
 * for a judge to click.
 *
 * These are addresses this project creates, never addresses that appear in
 * someone else's history. Keys are written 0600 outside the repo so the money
 * can be swept back later.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey, encodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

const DEMO_KEY = "/home/ubuntu/.hermes/keys/hackathon-2026/demo-user.key";
const OUT_DIR = "/home/ubuntu/.hermes/keys/hackathon-2026";
const SPEND = 1_500_000; // 0.0015 SUI, same shape as the existing demo rows

const client = new SuiGrpcClient({
  baseUrl: "https://fullnode.mainnet.sui.io:443",
  network: "mainnet",
});

const demo = Ed25519Keypair.fromSecretKey(
  decodeSuiPrivateKey(fs.readFileSync(DEMO_KEY, "utf8").trim()).secretKey,
);
console.log("demo wallet:", demo.toSuiAddress());

const SPECS = [
  { file: "merchant-test.key", label: "Noodle Stall", category: "Food" },
  { file: "merchant-judge.key", label: "Parking Garage", category: "Transport" },
];

async function send(to, amount, gas = 8_000_000) {
  const tx = new Transaction();
  tx.setGasBudget(gas);
  const [coin] = tx.splitCoins(tx.gas, [amount]);
  tx.transferObjects([coin], to);
  const res = await client.signAndExecuteTransaction({ signer: demo, transaction: tx });
  if (res.$kind !== "Transaction") throw new Error(`failed: ${JSON.stringify(res).slice(0, 300)}`);
  return res.Transaction.digest;
}

for (const spec of SPECS) {
  const path = `${OUT_DIR}/${spec.file}`;
  let kp;
  if (fs.existsSync(path)) {
    kp = Ed25519Keypair.fromSecretKey(
      decodeSuiPrivateKey(fs.readFileSync(path, "utf8").trim()).secretKey,
    );
    console.log(`${spec.file} exists:`, kp.toSuiAddress());
  } else {
    const secret = crypto.randomBytes(32);
    kp = Ed25519Keypair.fromSecretKey(secret);
    fs.writeFileSync(path, encodeSuiPrivateKey(secret, "ED25519"), { mode: 0o600 });
    console.log(`${spec.file} created:`, kp.toSuiAddress());
  }

  spec.address = kp.toSuiAddress();
  spec.digest = await send(spec.address, SPEND);
  console.log("  tx", spec.digest, "→", spec.address);
  await new Promise((r) => setTimeout(r, 2000));
}

console.log("\nSEED entries:");
for (const s of SPECS) {
  console.log(
    `  { address: "${s.address}", label: "${s.label}", category: "${s.category}" }  // ${s.file}`,
  );
}
