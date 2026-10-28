# RecallSpend

A spending tracker for Sui wallets with **no database**.

Your ledger, the merchant rules learned from your corrections, and your monthly
budgets are all lines in **Walrus Memory on mainnet**. A correction you make on
your phone is still there on your laptop, and still there next month, because it
was never in a `localStorage` blob or our Postgres — it was written to memory.

An agent sits next to the ledger. When it meets a merchant it cannot name, it
buys the label for **0.01 USDC over MPP on Sui mainnet** and writes the payment
into the same ledger, next to your own spending.

Live demo: **https://recallspend.vercel.app**

```
paste a Sui address  ->  Tatum Sui GraphQL reads the history once
                     ->  every outflow becomes a line in Walrus Memory
                     ->  every later page load is served from memory, 0 Tatum credits
```

## Why this exists

Two problems, one mechanism.

**Spending apps forget what you taught them.** You rename "SQ *COFFEE 4412" to
Coffee once, and next month the same merchant is unknown again, because the
label lived in an app's table and the app moved on. Memory fixes that only if it
is the store, not a cache in front of one.

**Agents cannot classify what the chain does not describe.** A Sui transaction
carries an address and an amount. Naming the merchant needs knowledge from
outside the chain. That is a thing worth paying a fraction of a cent for, and
MPP on Sui makes the payment small enough to be honest.

## What is actually stored, and where

Two namespaces on Walrus Memory mainnet (`@mysten-incubation/memwal`):

```
recallspend-ledger   spend lines, correction lines, agent payment lines
recallspend-rules    merchant rules, budget settings
```

Every line is plain text, prefixed, and immutable:

```
spend|wallet=0x8fbd…|id=<digest>:0|dig=<digest>|at=2026-10-06T15:07:23Z
     |amt=0.002144324|sym=SUI|dec=9|to=0xabc…|cat=Fees|by=rule|conf=1.00

fix|wallet=0x8fbd…|id=<digest>:0|cat=Subscriptions|at=2026-10-28T07:58:47Z

rule|wallet=0x8fbd…|target=0xabc…|cat=Food|evidence=3|at=…

pay|wallet=0x8fbd…|dig=<sui digest>|amt=0.01|sym=USDC|to=0x…|for=label:0xabc…
```

**A correction is never an edit.** Walrus Memory rejects the same idempotency
key with different text (409), and that constraint turned out to be the right
design: the observation stays, the correction is appended next to it, and the
app can therefore always show what it thought *before* you taught it otherwise.
That is what makes the accuracy number in the UI possible at all.

## The learning number is a hold-out, not a victory lap

The obvious metric — "how many corrected lines does the app get right" — is
circular, because the correction *is* the answer. It would always read 100%.

So `holdoutScore` in `src/lib/classify.ts` scores only lines you did **not**
correct, filtered to merchants you **did** label elsewhere, and compares the
ruleset from before your first correction against the ruleset now:

```
before = accuracy of (rules that existed before your first fix) on the hold-out
after  = accuracy of (rules now) on the same hold-out
```

If there are no held-out lines, it reports zero and says so, rather than
claiming a perfect score on an empty set.

## The agent's payment is real

```
GET  /api/enrich/preview    -> free: is there a label at all? (never the label)
POST /api/enrich            -> 402 + WWW-Authenticate: Payment, method="sui"
POST /api/enrich (paid)     -> merchant profile + Payment-Receipt (base64url, .reference = digest)

POST /api/agent             -> STEP 1: pays 0.01 USDC, returns label + digest, writes nothing
POST /api/agent/record      -> STEP 2: proves that digest on Sui, then writes the two lines
GET  /api/agent/balance     -> the agent's own USDC and SUI, read from chain
```

Implemented with `@suimpp/mpp` 0.9.0 (`suiServer` / `sui`) over `mppx` 0.15.0.
Settlement is USDC on **Sui mainnet**, not Base — the common x402 provider
(Firecrawl) settles on Base and would fail the "settled on Sui" criterion while
looking correct in a demo.

**Why settle and remember are two requests.** A Vercel function is capped at 60s
and the Walrus Memory relayer takes 20-40s per write. Doing both in one request
produced the worst possible failure: the first real payment settled on chain,
both lines reached memory, and the caller was still told "timeout". Split, a slow
write can only delay step 2 — it can never lose a payment that already happened.
The client keeps the digest in `localStorage` until the write succeeds, so a retry
finishes the job for 0 instead of paying twice.

**Why step 2 re-checks the chain.** Taking a digest from the client means a client
could hand over a digest of something unrelated. `proveUsdcTransfer` reads the
transaction from Sui and requires a USDC balance change from the agent's address
to the seller of at least 0.01. Memory only receives a merchant label when that
transfer exists. The claim "this fact was bought" is therefore checkable by
anyone.

Three settlements on mainnet, all with the same shape:

```
0.01 USDC  8Yy3etB3eQw2qoefTyyFrR4oporCKWbjdrxeQuuGDdxn   Coffee Shop
0.01 USDC  DYASw…j4ES                                      Grocery Store
0.01 USDC  43wZEK…Ec8D                                     Delivery
```

The seller of the label is this app's own directory: labels from corrections other
wallets already made, plus a small **seed directory** (`src/lib/directory.ts`)
so the market is not empty on day one. Every profile carries its provenance and
the UI prints it — a seeded label says `seed directory`, a learned one says
`N corrections`. The alternative, presenting seed data as if several users had
agreed on it, would make the rest of the app untrustworthy.

The free preview exists so the agent does not pay for a lookup with no answer.
It returns `known: true/false` and never the label itself: the answer is what the
payment buys.


## Cost discipline

Tatum's Sui gateway does **not** serve legacy JSON-RPC. `/_methods` lists
GraphQL and `sui.rpc.v2.*` gRPC, and only the gRPC host has no address index —
so address history is GraphQL or nothing.

A previous project in this repo family burned a 100,000-credit Tatum allowance
in an afternoon because a page view made ~96 calls at 100 credits each. The
rules here, from the first commit:

| rule | where |
|---|---|
| a page render never calls Tatum | `/api/ledger` reads memory only |
| one sync = at most 4 pages = 10 credits | `syncWallet({ maxPages: 4 })` |
| credits are priced and capped per day (500) | `src/lib/tatum.ts` |
| every call appended to `/tmp/recallspend-tatum.log` | `spend()` |
| re-sync skips lines already in memory | `seen` set before any write |
| N lines = one bulk write, not N | `rememberSpends` |

Measured on the deployed build, 28 Oct 2026:

```
first sync of a 20-line wallet   3 Tatum calls  6 credits   ~30s (1 bulk Walrus write)
re-sync, nothing new             3 Tatum calls  6 credits   4.2s   wrote 0
page load after sync             0 Tatum calls  0 credits
```

## What broke, and what the fix was

Written down because these are the parts that cost time.

1. **A 100% accuracy number that was circular.** First version scored corrected
   lines against the correction. Replaced with the hold-out above.
2. **One correction relabelled every gas line.** Fee rows have no counterparty,
   and the rule was keyed on the placeholder `"—"`, so correcting one fee
   rewrote all twenty. Fees now never produce a merchant rule.
3. **Seven sequential Walrus writes exceeded the serverless budget.** A sync
   that had actually succeeded surfaced as a timeout. Bulk write fixed it.
4. **The merchant was built at module scope**, so `next build` ran it without
   `MPP_RECIPIENT`, baked an unconfigured null, and production answered 503
   forever. Env is read per request now.
5. **`MPP_SECRET_KEY` is required** to sign challenges; without it
   `Mppx.create()` throws at request time.
6. **The payment path had never run.** `Ed25519Keypair.deriveKeypair()` accepts a
   mnemonic and nothing else; the key on this host is a bech32 `suiprivkey1…`
   export, so the first real attempt failed with "Invalid mnemonic" — which reads
   like a broken key rather than the wrong parser. It now accepts both shapes.
7. **The digest was read from a header that does not exist.** The code looked for
   `x-payment-digest`; the receipt is in `Payment-Receipt` as base64url with
   `.reference` holding the digest. The first settlement therefore produced a
   0.01 USDC line with no proof attached, which is the opposite of the point.
8. **Tatum returns address history oldest-first.** `first: n, after:` walks from
   the beginning of an account's history, so a wallet with more than four pages
   synced its oldest eighty transactions and never saw today's spending. It only
   looked correct because the first test wallet had four transactions. Now pages
   walk backwards with `last` + `before`.
9. **Every sync ended on a 429.** Tatum's free tier allows 3 requests per second
   and a sync reads up to four pages back to back, so the fourth always failed
   and the reported error made a working sync look broken. Retried with a pause.
10. **Settling and remembering in one request exceeded 60s.** See above: the money
    moved, the memory was written, and the caller was told it timed out. Split in
    two, with the digest kept client-side until the write lands.


## Stack

```
Next.js 16 (App Router, cacheComponents)
@mysten-incubation/memwal   Walrus Memory SDK
@mysten/sui                 signing + public GraphQL
@suimpp/mpp + mppx          MPP over Sui USDC
Tailwind 4
```

No database, no ORM, no session store.

## Environment

```text
WALRUS_DELEGATE_KEY     Walrus Memory delegate key (server only)
WALRUS_ACCOUNT_ID       Walrus Memory account object id
TATUM_API_KEY           Tatum, Sui GraphQL
MPP_RECIPIENT           wallet that receives the 0.01 USDC
MPP_SECRET_KEY          signs MPP challenges
AGENT_SUI_KEY           the agent's payer key (server only)
TATUM_DAILY_CREDITS     500
```

## Run

```bash
npm install
npm run dev            # http://localhost:3000
npm run build
```

Health check with the numbers a judge asks for:

```bash
curl -s https://recallspend.vercel.app/api/health
# {"ok":true,"memories":22,"tatum":{...},"merchant":"0x8fbd…","network":"sui:mainnet"}
```

## Limits, stated

- One Walrus Memory account serves every wallet, separated by a `wallet=` field
  rather than by namespace. Multi-tenant isolation is a field, not a boundary.
- The digest store for replay protection is in-memory, so a restart forgets
  which payment digests it has already seen.
- Recall is a similarity search with no cursor; reads ask for up to 400 lines
  and filter client-side.
- Merchant labels are only as good as the corrections behind them. An address
  nobody has labelled returns `known: false` for free.
- The seed directory is **demo data**. Four addresses are labelled in code so the
  market is not empty on day one; the UI says `seed directory` next to them so
  nobody mistakes a seed for a user correction. A real correction always outranks
  a seed.
- One line in the first wallet's payment log has **no digest**. It was written
  before the receipt parser was fixed, and memory is append-only, so it stays as
  evidence of the bug rather than being quietly rewritten.
- A purchase takes 40-70 seconds end to end: ~20s to settle on Sui, then 20-40s
  for the relayer. The UI narrates both steps instead of showing a spinner.
- The demo wallet (`0xf42e7b…8ed`) is a throwaway key funded from the agent. Its
  transactions are real, its merchant labels are seeded, and it exists so the
  payer in the panel is visibly a different account from the user.

