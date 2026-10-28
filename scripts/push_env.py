#!/usr/bin/env python3
"""Push .env values to Vercel production. Values are never printed."""
import subprocess, os

env = {}
for line in open("/home/ubuntu/recallspend/.env"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        env[k] = v

# The agent payer key has to exist on the host too: locally it is read from the
# 0600 file, and production has no such file.
keyfile = "/home/ubuntu/.hermes/keys/hackathon-2026/sui-private.key"
env["AGENT_SUI_KEY"] = open(keyfile).read().strip()
env["SUI_RPC_URL"] = "https://fullnode.mainnet.sui.io:443"

targets = ["production", "preview", "development"]
for name, value in env.items():
    for t in targets:
        # --force overwrites an existing value instead of prompting.
        p = subprocess.run(
            ["vercel", "env", "add", name, t, "--force"],
            input=value + "\n",
            text=True,
            capture_output=True,
            cwd="/home/ubuntu/recallspend",
        )
        ok = p.returncode == 0
        print(f"{name:<22} {t:<12} {'ok' if ok else 'FAIL ' + p.stderr.strip()[:80]}")
