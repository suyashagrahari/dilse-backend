#!/bin/bash
#
# Warn while there is still time to act.
#
# The 2026-09-03 outage was not caused by a certificate expiring — those expire
# on a schedule and that is fine. It was caused by nobody LEARNING that renewal
# had been failing for weeks, because a failed renewal is silent and the site
# looks perfect right up to the last second.
#
# So this checks what visitors actually see — the served certificate, over the
# network, not the file on disk. A renewed file that nginx never reloaded is one
# of the failure modes worth catching, and only a real handshake shows it.
#
# Runs daily. Silent unless something needs attention, so it is safe in cron.

set -uo pipefail

THRESHOLD_DAYS=21
HOSTS="subhsandesh.in api.subhsandesh.in stag-api.subhsandesh.in strapi.subhsandesh.in"
TAG="cert-expiry-check"

problems=""

for host in $HOSTS; do
  end=$(echo | timeout 20 openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

  if [ -z "$end" ]; then
    problems="${problems}${host}: could not read a certificate at all\n"
    continue
  fi

  end_epoch=$(date -d "$end" +%s 2>/dev/null || echo 0)
  now=$(date +%s)
  days=$(( (end_epoch - now) / 86400 ))

  if [ "$end_epoch" -eq 0 ]; then
    problems="${problems}${host}: unparseable expiry '${end}'\n"
  elif [ "$days" -lt 0 ]; then
    problems="${problems}${host}: EXPIRED ${days#-} days ago\n"
  elif [ "$days" -lt "$THRESHOLD_DAYS" ]; then
    problems="${problems}${host}: expires in ${days} days (${end})\n"
  fi

  # The wildcard is load-bearing: published share links are
  # {subdomain}.subhsandesh.in, so a certificate that lost the wildcard breaks
  # links already sitting in people's messages while the site itself looks fine.
  if [ "$host" = "subhsandesh.in" ]; then
    san=$(echo | timeout 20 openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
          | openssl x509 -noout -ext subjectAltName 2>/dev/null)
    case "$san" in
      *'*.subhsandesh.in'*) : ;;
      *) problems="${problems}${host}: certificate no longer covers *.subhsandesh.in\n" ;;
    esac
  fi
done

# Renewal being BROKEN is the thing that actually bit us, and it is visible
# weeks earlier than any expiry date. A dry run exercises the real hooks.
# Scoped to this certificate on purpose. Other projects share this box, and one
# of them fails its own dry run today; a check that reports somebody else's
# breakage every morning is a check that gets ignored.
if ! timeout 300 certbot renew --cert-name subhsandesh.in --dry-run >/tmp/${TAG}-dryrun.log 2>&1; then
  problems="${problems}certbot renew --dry-run FAILED — renewal is broken now, whatever the expiry dates say. See /tmp/${TAG}-dryrun.log\n"
fi

if [ -n "$problems" ]; then
  printf "TLS attention needed:\n%b" "$problems" | logger -t "$TAG" -p daemon.err
  printf "TLS attention needed:\n%b" "$problems" >&2
  exit 1
fi

logger -t "$TAG" -p daemon.info "all checked certificates healthy"
exit 0
