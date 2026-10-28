#!/usr/bin/env python3
"""Rewrite mirror URLs in the lockfile to the public registry.

The integrity hashes are content hashes of the tarballs, which are identical on
both registries, so a host swap is safe. Doing it as a rewrite instead of a
reinstall avoids a full node_modules rebuild for a URL change.
"""
import re, sys

path = "/home/ubuntu/recallspend/package-lock.json"
s = open(path).read()
before = s.count("mirrors.tencentyun.com")
s = re.sub(r"https?://mirrors\.tencentyun\.com/npm", "https://registry.npmjs.org", s)
open(path, "w").write(s)
print(f"rewrote {before} urls")
print("remaining mirror refs:", s.count("mirrors.tencentyun.com"))
print("public refs:", s.count("registry.npmjs.org"))
