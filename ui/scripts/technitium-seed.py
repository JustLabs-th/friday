"""Put the company host names (and the *.apps wildcard) into Technitium DNS.

Safe by default: it only prints what it would do. Add --apply to really do it.
It never changes or deletes a record that already exists; it only adds missing ones.

Before running, create an API token in the Technitium web console
(Administration -> Sessions -> Create Token) and keep it in an environment variable,
so it never appears on the command line or in a file:

    PowerShell:   $env:TECHNITIUM_TOKEN = "<token>"
    Optional:     $env:TECHNITIUM_URL = "http://localhost:5380"
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

BASE = os.environ.get("TECHNITIUM_URL", "http://localhost:5380").rstrip("/")
TOKEN = os.environ.get("TECHNITIUM_TOKEN", "")
APPLY = "--apply" in sys.argv
HELPER = os.path.join(os.path.dirname(__file__), "..", "helper", "src", "main.rs")

# The apps wildcard: every app Liam deploys lands on the Coolify host.
EXTRA = [("*.apps.digitalx.srt", "192.168.100.15", "apps.digitalx.srt")]


def names():
    text = open(HELPER, encoding="utf-8").read()
    block = text.split("const RECORDS", 1)[1].split("];", 1)[0]
    pairs = re.findall(r'\("([a-z0-9.-]+)",\s*"([0-9.]+)"\)', block)
    return [(n, ip, n) for n, ip in pairs] + EXTRA


def api(path, **params):
    params["token"] = TOKEN
    url = f"{BASE}/api/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=20) as r:
        body = json.load(r)
    if body.get("status") != "ok":
        raise RuntimeError(f"{path}: {body.get('errorMessage') or body.get('status')}")
    return body.get("response", {})


def main():
    if not TOKEN:
        sys.exit("Set TECHNITIUM_TOKEN first (see the top of this file).")
    zones = {z["name"].lower() for z in api("zones/list").get("zones", [])}
    print(f"{len(zones)} zones already exist. Mode: {'APPLY' if APPLY else 'dry run (add --apply to change)'}\n")
    for domain, ip, wanted_zone in names():
        # Use the closest existing zone that contains this name, else make a zone for it.
        parts = domain.lstrip("*.").split(".")
        zone = next((".".join(parts[i:]) for i in range(len(parts) - 1) if ".".join(parts[i:]) in zones), None)
        if zone is None:
            zone = wanted_zone
            print(f"+ zone   {zone}")
            if APPLY:
                api("zones/create", zone=zone, type="Primary")
                zones.add(zone)
        have = []
        if zone in zones:
            try:
                recs = api("zones/records/get", domain=domain, zone=zone).get("records", [])
                have = [r["rData"]["ipAddress"] for r in recs if r.get("type") == "A"]
            except RuntimeError:
                have = []
        if ip in have:
            print(f"= record {domain} -> {ip} (already there)")
            continue
        if have:
            print(f"! record {domain} already points to {have}, wanted {ip}: left as it is")
            continue
        print(f"+ record {domain} -> {ip}  (zone {zone})")
        if APPLY:
            api("zones/records/add", domain=domain, zone=zone, type="A", ipAddress=ip, ttl="3600")


if __name__ == "__main__":
    main()
