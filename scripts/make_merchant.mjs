/**
 * Create the merchant wallet that receives agent payments.
 *
 * It must be a different address from the payer. If the agent paid itself, the
 * Sui balance change for that owner would net to roughly minus the gas, and a
 * verifier that looks for a positive balance change on the recipient would see
 * nothing to verify. A separate wallet also means the money is not burned: it
 * sits somewhere we control and can be swept or reused for the next demo.
 *
 * The key is written 0600 outside the repo and never printed.
 */
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";

const path = "/home/ubuntu/.hermes/keys/hackathon-2026/merchant.key";

if (existsSync(path)) {
  const kp = Ed25519Keypair.deriveKeypair(readFileSync(path, "utf8").trim());
  console.log("existing merchant:", kp.toSuiAddress());
} else {
  const kp = Ed25519Keypair.generate();
  writeFileSync(path, kp.getSecretKey() + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  console.log("new merchant:", kp.toSuiAddress());
}
