#!/usr/bin/env python3
"""Balances of the hackathon wallet."""
import json, sys
sys.path.insert(0, "/home/ubuntu/recallspend/scripts")
from probe import gql

ADDR = "0x8fbd10bdc30b5a998bdfbf26d7bae87314b4bdeaa4be53dbbfc5ca88f84e37ca"
SUI = "0x2::sui::SUI"
USDC = ("0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7"
        "::usdc::USDC")

Q = """
query B($a: SuiAddress!, $c: String!) {
  address(address: $a) { balance(coinType: $c) { coinType { repr } totalBalance } }
}
"""

for t in (SUI, USDC):
    d = gql(Q, {"a": ADDR, "c": t})
    print(t.split("::")[-1], "->", json.dumps(d.get("data") or d.get("errors"))[:300])
