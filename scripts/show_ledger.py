import json, sys

d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/led.json"))
l = d.get("ledger") or {}
print("totals:", l.get("totals"))
print("spends:", len(l.get("spends", [])))
for s in l.get("spends", [])[:8]:
    print(
        f"  {s['at'][:16]} {s['amount']} {s['symbol']} to={s['to'][:14]} "
        f"cat={s['category']} by={s['by']} conf={s['confidence']}"
    )
print("months:", json.dumps(l.get("months", []))[:400])
print("learning:", l.get("learning"))
print("tatum:", d.get("tatum") or d)
