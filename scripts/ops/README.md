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

## `deploy.sh` — the blue-green deploy the workflows call

Lives at `/opt/dilse/scripts/deploy.sh` on the box and is invoked over SSH by
both repos' Actions workflows. **This copy is a mirror, not the source of
truth** — the box's copy is what actually runs.

### Why it is tracked here at all

It was not tracked anywhere. The monorepo root (`~/Desktop/Suyash/gifts`) is not
a git repository — only `client/` and `server/` are — so `scripts/deploy.sh`
there was an untracked local file, and it had already drifted from the box's:

```
box   1bf9cad1df100ff4ad5ce0e4cb366ac6   ← the one that runs
local acf97b62ad00b54c9ea2f243fa02e8a7   ← untracked, different
```

`docker pull` sat at line 140 on the box and line 71 locally. This copy was
taken FROM the box, so it reflects what runs.

### Update it

```bash
# read what is actually running, so a local edit cannot silently win
scp -i ~/Desktop/Suyash/subhsandesh.pem \
  ubuntu@13.207.193.62:/opt/dilse/scripts/deploy.sh /tmp/deploy.live.sh

# ... edit /tmp/deploy.live.sh ...

bash -n /tmp/deploy.live.sh                    # syntax, locally, first
scp -i ~/Desktop/Suyash/subhsandesh.pem /tmp/deploy.live.sh ubuntu@13.207.193.62:/tmp/
ssh -i ~/Desktop/Suyash/subhsandesh.pem ubuntu@13.207.193.62 \
  'bash -n /tmp/deploy.live.sh && sudo cp -a /opt/dilse/scripts/deploy.sh \
     /opt/dilse/scripts/deploy.sh.bak-$(date +%Y%m%d-%H%M%S) && \
   sudo install -m 0755 -o ubuntu -g ubuntu /tmp/deploy.live.sh /opt/dilse/scripts/deploy.sh'
```

Back up before overwriting. Timestamped backups accumulate in that directory.

### The `docker pull` retry

Added 2026-09-03 after a dev deploy failed on:

```
commit failed: rename .../ingest/<id>/data .../blobs/sha256/<id>:
no such file or directory
```

containerd racing its own GC and removing the ingest dir mid-write. Not disk
(25G free, 13% inodes) and not a bad image — the same tag pulled cleanly on the
next attempt. Under `set -e` one failure aborted the deploy, which is safe but
leaves a good build undeployed until someone notices.

Three attempts, 5s apart. It deliberately does **not** clear containerd's
ingest directory: frontend and backend deploys are separate concurrency groups
and do overlap, so `rm -rf .../ingest/*` could destroy the other service's
in-flight pull. If retries stop being enough, diagnose rather than escalate.

Verified before installing, with a stubbed `docker` that fails a chosen number
of times: 0/1/2 failures proceed, 3 failures exit 1 **without** reaching the
container stop/start steps — which is the property that matters.
