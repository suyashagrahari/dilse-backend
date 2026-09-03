# The wildcard TLS certificate

## What broke, on 2026-09-03

`subhsandesh.in` expired at **06:10:48 UTC** and every visitor got
`NET::ERR_CERT_DATE_INVALID`. The apps were healthy the whole time — both APIs
answered 200 from behind the dead certificate — so nothing looked wrong from
the inside.

It also stopped inbound email in both environments, which is the part you would
not think to check: SNS validates TLS before it delivers, so
`api.subhsandesh.in` and `stag-api.subhsandesh.in` quietly stopped receiving
creator replies. It shows up only as `NumberOfNotificationsFailed` on the SNS
topic.

## The actual cause

Auto-renewal was configured correctly, and had worked. The renewal config still
says so:

```
authenticator = dns-godaddy
dns_godaddy_credentials = /etc/letsencrypt/godaddy.ini
version = 2.9.0
```

`*.subhsandesh.in` can only be validated by DNS-01 — HTTP-01, which is what
`certbot --nginx` uses, cannot issue a wildcard at all. So this lineage used the
third-party `certbot-dns-godaddy` **pip** plugin to publish the TXT record.

Then certbot was upgraded from 2.9.0 to **5.8.0** and became a **snap**. A snap
cannot load pip plugins, so the authenticator named in that config simply
stopped existing:

```
$ sudo certbot plugins
* apache
* nginx
* standalone      ← no dns-godaddy
```

`certbot renew` then failed for this one certificate every time it tried. Every
other certificate on the box uses the built-in `nginx` authenticator, so
`strapi`, `sentifix` and the rest kept renewing normally — which is exactly why
nobody noticed. The failure was invisible until the certificate expired.

The lesson worth keeping: **a certbot upgrade can silently remove a third-party
authenticator, and the only symptom is one certificate quietly not renewing.**

## The fix that is now in place

Stock certbot, no plugin, driven by two hooks that talk to the GoDaddy API
directly: `/usr/local/bin/godaddy-acme-hook.py`. Because it depends on nothing
but certbot itself and `dig`, a future certbot upgrade cannot break it the same
way.

The renewal command, which certbot has recorded for unattended renewal:

```bash
sudo certbot certonly --non-interactive \
  --cert-name subhsandesh.in \
  -d subhsandesh.in -d '*.subhsandesh.in' \
  --manual --preferred-challenges dns \
  --manual-auth-hook '/usr/local/bin/godaddy-acme-hook.py auth' \
  --manual-cleanup-hook '/usr/local/bin/godaddy-acme-hook.py cleanup' \
  --deploy-hook '/bin/systemctl reload nginx'
```

### The one subtlety in the hook

A certificate for `subhsandesh.in` **and** `*.subhsandesh.in` produces two
challenges, and both want a TXT record at the **same** name,
`_acme-challenge.subhsandesh.in`. Both values must be published simultaneously.

GoDaddy's `PUT` replaces every record at a name, so publishing the second value
naively deletes the first and validation fails on the domain that had already
passed. The hook therefore keeps a state file and republishes the whole
accumulated set on each invocation. This is the detail that makes a hand-rolled
GoDaddy hook fail if you write the obvious version.

The hook also polls the authoritative nameserver until its value is actually
being served, rather than sleeping a guessed interval — a premature validation
costs a full retry.

### Why `--deploy-hook` matters

Certbot writes the new certificate but restarts nothing. Without the deploy
hook a renewal succeeds and nginx carries on serving the old file until
something happens to reload it — so the certificate looks renewed everywhere
except to actual visitors.

## Why the wildcard cannot be dropped

It is load-bearing. `utils/shareUrl.ts` publishes a page's link as
`https://{subdomain}.subhsandesh.in/{shareId}` for any user who has a
subdomain, and those links are already out in people's messages. A certificate
covering only the fixed hostnames would break every one of them, permanently
and silently.

## If you ever need to do it by hand

Only if the GoDaddy API credentials are revoked. Drop the two hook flags and add
nothing — certbot will print a TXT value, wait, and print a second one. Add each
as a **separate** TXT record named `_acme-challenge` (GoDaddy appends the
domain) and keep the first in place when you add the second. Confirm with
`dig +short TXT _acme-challenge.subhsandesh.in` — two strings must come back —
then continue, and finish with `sudo nginx -t && sudo systemctl reload nginx`.

## Checks worth keeping

- `sudo certbot renew --dry-run` after any certbot upgrade. That single command
  would have caught this months early.
- An expiry check that warns with weeks to spare, so the next failure is found
  by a monitor rather than by a customer.
- After any certificate change, re-verify inbound email: SNS gives up after its
  retry window rather than queueing forever. See `docs/ses-inbound-setup.md`.
