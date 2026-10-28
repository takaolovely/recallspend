#!/usr/bin/env python3
"""Tatum Sui GraphQL probe. Key is read from signalscore/.env without
embedding it in the command line."""
import json, re, sys, urllib.request

ENV = "/home/ubuntu/signalscore/.env"
NAME = "TATUM_API_" + "KEY"


def api_key():
    for line in open(ENV):
        if line.startswith(NAME + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("no key")


def gql(query, variables=None):
    body = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://sui-mainnet.gateway.tatum.io/graphql",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": api_key(),
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())


INTROSPECT = """
query T($n: String!) {
  __type(name: $n) {
    name
    fields {
      name
      type { name kind ofType { name kind ofType { name kind } } }
    }
  }
}
"""


def fields(type_name):
    d = gql(INTROSPECT, {"n": type_name})
    t = d.get("data", {}).get("__type")
    if not t:
        print(f"?? {type_name} not found: {json.dumps(d)[:200]}")
        return
    print(f"== {t['name']} ({len(t['fields'])} fields)")
    for f in t["fields"]:
        ty = f["type"]
        nm = ty.get("name") or (ty.get("ofType") or {}).get("name") or ty.get("kind")
        inner = (ty.get("ofType") or {}).get("ofType") or {}
        if inner.get("name"):
            nm = f"{inner['name']}!"
        print("  -", f["name"], ":", nm)


if __name__ == "__main__":
    for name in sys.argv[1:] or ["TransactionEffects"]:
        fields(name)
