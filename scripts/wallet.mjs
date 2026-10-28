import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { readFileSync } from "node:fs";

const addr = process.argv[2];
const client = new SuiGraphQLClient({
  url: "https://graphql.mainnet.sui.io/graphql",
  network: "mainnet",
});

const res = await client.query({
  query: `
    query B($a: SuiAddress!) {
      address(address: $a) {
        balances(first: 10) {
          nodes { coinType { repr } totalBalance }
        }
      }
    }`,
  variables: { a: addr },
});
console.log(JSON.stringify(res, null, 1).slice(0, 1500));

// also the last few tx digests
const txs = await client.query({
  query: `
    query T($a: SuiAddress!) {
      transactions(first: 5, filter: { affectedAddress: $a }) {
        nodes { digest effects { timestamp status } }
      }
    }`,
  variables: { a: addr },
});
console.log(JSON.stringify(txs, null, 1).slice(0, 1200));
