/**
 * A second payment to a merchant that already has a bought label.
 *
 * Without one, the Learned rules card and the Generalisation score describe two
 * different things: the card counts the line the rule came from as "applied to 1
 * other payment" (it is not another payment), and the score has no held-out line
 * to measure. One repeat payment makes both statements true and identical.
 */
import fs from "node:fs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

const DEMO_KEY = "/home/ubuntu/.hermes/keys/hackathon-2026/demo-user.key";
const GROCERY = "0x4d4737df14b2899feac53d430aa58a7716680b6240ccf323d0b376adf6017372";
const SPEND = 1_500_000;

const client = new SuiGrpcClient({
  baseUrl: "https://fullnode.mainnet.sui.io:443",
  network: "mainnet",
});

const demo = Ed25519Keypair.fromSecretKey(
  decodeSuiPrivateKey(fs.readFileSync(DEMO_KEY, "utf8").trim()).secretKey,
);

const tx = new Transaction();
tx.setGasBudget(2_500_000);
const [coin] = tx.splitCoins(tx.gas, [SPEND]);
tx.transferObjects([coin], GROCERY);
const res = await client.signAndExecuteTransaction({ signer: demo, transaction: tx });
if (res.$kind !== "Transaction") throw new Error(JSON.stringify(res).slice(0, 300));
console.log("repeat payment tx:", res.Transaction.digest);
