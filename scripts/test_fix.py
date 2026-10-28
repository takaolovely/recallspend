"""Correct one line through the API and show the learning panel move."""
import json, sys, urllib.request

BASE = "http://127.0.0.1:8421"
W = "0x8fbd10bdc30b5a998bdfbf26d7bae87314b4bdeaa4be53dbbfc5ca88f84e37ca"


def get(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=60) as r:
        return json.loads(r.read())


def post(path, body):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


led = get(f"/api/ledger?wallet={W}")["ledger"]
rows = led["spends"]
if not rows:
    raise SystemExit("no rows")

target = rows[0]
print("before:", target["id"], target["category"], target["amount"], target["symbol"])

res = post("/api/fix", {"wallet": W, "id": target["id"], "category": "Subscriptions", "label": "Walrus Memory"})
print("fix:", json.dumps(res)[:200])

led2 = get(f"/api/ledger?wallet={W}")["ledger"]
print("after totals:", led2["totals"])
print("learning:", led2["learning"])
print("rules:", json.dumps(led2["rules"])[:300])
for s in led2["spends"][:3]:
    print("  row:", s["category"], s["by"], s["confidence"], "original=", s["original"])
