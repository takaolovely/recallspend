#!/usr/bin/env python3
"""Assemble .env from the quarantine folder. Never prints values."""
import os, re

K = "/home/ubuntu/.hermes/keys/hackathon-2026"
out = {}

def rd(p):
    return open(p).read().strip()

out["WALRUS_DELEGATE_KEY"] = rd(f"{K}/walrus-delegate.key")
out["WALRUS_ACCOUNT_ID"] = rd(f"{K}/walrus-account.txt")
out["MPP_RECIPIENT"] = "0x8fbd10bdc30b5a998bdfbf26d7bae87314b4bdeaa4be53dbbfc5ca88f84e37ca"
out["TATUM_DAILY_CREDITS"] = "500"
out["MEMWAL_SERVER_URL"] = "https://relayer.memory.walrus.xyz"

# Tatum key lives in the SignalScore env; copy, do not retype.
for line in open("/home/ubuntu/signalscore/.env"):
    if line.startswith("TATUM_API_" + "KEY="):
        out["TATUM_API_KEY"] = line.split("=", 1)[1].strip()

path = "/home/ubuntu/recallspend/.env"
with open(path, "w") as f:
    for k, v in out.items():
        f.write(f"{k}={v}\n")
os.chmod(path, 0o600)

print("wrote", path)
for k, v in out.items():
    print(f"  {k}: {len(v)} chars")
