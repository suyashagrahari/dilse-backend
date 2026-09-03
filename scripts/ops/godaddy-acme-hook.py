#!/usr/bin/env python3
"""
DNS-01 hooks for certbot, talking to the GoDaddy API directly.

WHY THIS EXISTS
---------------
`*.subhsandesh.in` can only be validated by DNS-01, and this box used to do
that with the third-party `certbot-dns-godaddy` pip plugin. Certbot was then
upgraded from 2.9.0 to 5.8.0 and became a *snap*, which cannot load pip
plugins — so the authenticator named in the renewal config silently ceased to
exist. Every other certificate here uses the built-in `nginx` authenticator and
kept renewing, which is why only this one lapsed, and why nothing looked wrong
until the certificate actually expired and took the whole site down with it.

Stock certbot plus these two hooks needs no plugin at all, so a certbot upgrade
cannot break it the same way again.

THE ONE THING THAT MAKES THIS FIDDLY
------------------------------------
A certificate for `subhsandesh.in` AND `*.subhsandesh.in` produces TWO
challenges, and both want a TXT record at the SAME name,
`_acme-challenge.subhsandesh.in`. Both values have to be published at once.

GoDaddy's PUT replaces every record at a name, so publishing the second value
naively deletes the first — validation then fails on the domain that already
passed. Hence the state file: each invocation adds its value to the set and
republishes the WHOLE set.

Usage:  godaddy-acme-hook.py auth
        godaddy-acme-hook.py cleanup
Certbot supplies CERTBOT_DOMAIN and CERTBOT_VALIDATION in the environment.
"""

import configparser
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

CREDENTIALS = "/etc/letsencrypt/godaddy.ini"
STATE = "/var/lib/letsencrypt/godaddy-acme-state.json"
RECORD = "_acme-challenge"
TTL = 600
# GoDaddy publishes in seconds, but resolvers need a moment and a failed
# validation costs a full retry, so we poll rather than guess a sleep.
PROPAGATION_TIMEOUT = 240
POLL_EVERY = 10


def log(msg):
    print(f"[godaddy-acme-hook] {msg}", flush=True)


def credentials():
    cp = configparser.ConfigParser()
    # The file certbot's plugin used has no section header.
    with open(CREDENTIALS) as fh:
        cp.read_string("[d]\n" + fh.read())
    return cp["d"]["dns_godaddy_key"].strip(), cp["d"]["dns_godaddy_secret"].strip()


def api(method, path, payload=None):
    key, secret = credentials()
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        "https://api.godaddy.com/v1" + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"sso-key {key}:{secret}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if data else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]


def zone_of(domain):
    """The registrable domain. `_acme-challenge` is relative to it."""
    parts = domain.lstrip("*.").split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else domain


def read_state():
    try:
        with open(STATE) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def write_state(state):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(state, fh)
    os.replace(tmp, STATE)
    os.chmod(STATE, 0o600)


def publish(zone, values):
    """Replace the challenge record with exactly `values` (may be empty)."""
    if values:
        status, body = api(
            "PUT",
            f"/domains/{zone}/records/TXT/{RECORD}",
            [{"data": v, "ttl": TTL} for v in values],
        )
        log(f"PUT {len(values)} value(s) -> HTTP {status}")
    else:
        status, body = api("DELETE", f"/domains/{zone}/records/TXT/{RECORD}")
        log(f"DELETE challenge record -> HTTP {status}")
    if status >= 300:
        log(f"GoDaddy refused the change: {body}")
        return False
    return True


def visible(value):
    """Is this value actually being served? Asked of the authoritative NS, so a
    cached negative answer somewhere else cannot make us give up early."""
    try:
        out = subprocess.run(
            ["dig", "+short", "@ns23.domaincontrol.com", "TXT", f"{RECORD}.{zone}"],
            capture_output=True, text=True, timeout=20,
        ).stdout
    except Exception as e:
        log(f"dig failed ({e}); assuming not yet visible")
        return False
    return value in out


def do_auth():
    value = os.environ["CERTBOT_VALIDATION"]
    state = read_state()
    values = state.get(zone, [])
    if value not in values:
        values.append(value)
    state[zone] = values
    write_state(state)

    log(f"publishing challenge {len(values)} for {os.environ.get('CERTBOT_DOMAIN')}")
    if not publish(zone, values):
        sys.exit(1)

    deadline = time.time() + PROPAGATION_TIMEOUT
    while time.time() < deadline:
        if visible(value):
            log("value is live on the authoritative nameserver")
            # Let's Encrypt queries from several vantage points; a few seconds
            # past first sighting costs nothing and avoids a wasted attempt.
            time.sleep(10)
            return
        time.sleep(POLL_EVERY)
    log("TIMED OUT waiting for the record to appear")
    sys.exit(1)


def do_cleanup():
    value = os.environ.get("CERTBOT_VALIDATION", "")
    state = read_state()
    values = [v for v in state.get(zone, []) if v != value]
    if values:
        state[zone] = values
    else:
        state.pop(zone, None)
    write_state(state)
    # Never fail a cleanup: the certificate is already issued by this point, and
    # exiting non-zero here would make a successful renewal look broken.
    try:
        publish(zone, values)
    except Exception as e:
        log(f"cleanup problem, ignoring: {e}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    zone = zone_of(os.environ.get("CERTBOT_DOMAIN", "subhsandesh.in"))
    if mode == "auth":
        do_auth()
    elif mode == "cleanup":
        do_cleanup()
    else:
        sys.exit("usage: godaddy-acme-hook.py auth|cleanup")
