#!/usr/bin/env python3
"""Show the real shape of balance changes for one address."""
import json, sys
sys.path.insert(0, "/home/ubuntu/recallspend/scripts")
from probe import gql

Q = """
query H($addr: SuiAddress!, $n: Int!) {
  transactions(first: $n, filter: { affectedAddress: $addr }) {
    nodes {
      digest
      effects {
        timestamp
        status
        balanceChanges(first: 10) {
          nodes { owner { address } coinType { repr } amount }
        }
      }
    }
  }
}
"""

addr = sys.argv[1] if len(sys.argv) > 1 else "0x8fbd10bdc30b5a998bdfbf26d7bae87314b4bdeaa4be53dbbfc5ca88f84e37ca"
d = gql(Q, {"addr": addr, "n": 4})
if "errors" in d:
    print(json.dumps(d["errors"])[:800])
else:
    print(json.dumps(d, indent=1)[:2500])
