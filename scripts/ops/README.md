# Box scripts

These run on the EC2 host, not in the app. They are tracked here because the
copies on the box are the only ones that exist otherwise, and the 2026-09-03
outage was caused by exactly that kind of invisible, box-only configuration
drifting out from under us.

Installed at:

| Repo | On the box | Mode |
|------|-----------|------|
| `godaddy-acme-hook.py` | `/usr/local/bin/godaddy-acme-hook.py` | `700 root:root` |
| `cert-expiry-check.sh` | `/usr/local/bin/cert-expiry-check.sh` | `750 root:root` |

`cert-expiry-check.sh` is run daily by `/etc/cron.d/cert-expiry-check` at 04:17,
deliberately not near the certbot renewal timer, so a warning is never a race
against a fix already in flight.

To update either one:

```bash
scp -i ~/Desktop/Suyash/subhsandesh.pem scripts/ops/<file> ubuntu@13.207.193.62:/tmp/<file>
ssh -i ~/Desktop/Suyash/subhsandesh.pem ubuntu@13.207.193.62 \
  'sudo install -o root -g root -m 700 /tmp/<file> /usr/local/bin/<file> && rm /tmp/<file>'
```

After changing the hook, always prove it before trusting it:

```bash
sudo certbot renew --cert-name subhsandesh.in --dry-run
```

Background and the full story: `docs/tls-wildcard-renewal.md`.

## Note on the shared box

Other projects live here — `sentifix.dev`, `sentifix.online`,
`api.sentifix.online`, `grittt.online`, `strapi.subhsandesh.in`. As of
2026-09-03, `api.sentifix.online` fails its own `certbot renew --dry-run` and
expires 2026-10-10. That is not this project's certificate, which is why the
daily check is scoped with `--cert-name subhsandesh.in` — a check that reports
someone else's breakage every morning is a check that gets ignored. It is worth
telling whoever owns it, though: it is the same silent failure that took this
site down.
