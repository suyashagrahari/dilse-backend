# Renewing the wildcard TLS certificate

## What broke, on 2026-09-03

The certificate for `subhsandesh.in` expired at **06:10:48 UTC**, and every
visitor got `NET::ERR_CERT_DATE_INVALID`. The apps were fine throughout — both
APIs answered 200 behind the bad certificate. It was TLS alone.

It also silently broke inbound email: SNS validates TLS before delivering, so
`api.subhsandesh.in` and `stag-api.subhsandesh.in` stopped receiving creator
replies. That shows up as `NumberOfNotificationsFailed` on the SNS topic, not as
anything visible in the app.

## Why it was not renewed automatically, and never has been

Certificate Transparency shows the whole history:

```
2026-03-06 -> 2026-06-04   *.subhsandesh.in subhsandesh.in
2026-06-05 -> 2026-09-03   *.subhsandesh.in subhsandesh.in
```

Renewed by hand, roughly a day either side of expiry, twice. Never once
unattended. Meanwhile `cdn.` and `strapi.` renew themselves without trouble.

The reason is the wildcard. Let's Encrypt will only validate `*.subhsandesh.in`
by **DNS-01** — proving control of the zone by publishing a TXT record. HTTP-01,
which is what `certbot --nginx` uses and what auto-renews, cannot issue a
wildcard at all. So `certbot renew` on this box has nothing it can do without
either a human or an API key for the DNS provider, and DNS for this domain is at
GoDaddy (`ns23/ns24.domaincontrol.com`) — there is no Route 53 zone.

## Why the wildcard cannot simply be dropped

It is load-bearing. `utils/shareUrl.ts` builds a published page's link as
`https://{subdomain}.subhsandesh.in/{shareId}` for any user who has a subdomain.
Those links are already out in people's WhatsApp messages. A certificate that
covers only the fixed hostnames would break every one of them, permanently and
silently. So the wildcard has to stay, and DNS-01 with it.

---

## Renewing it now (~5 minutes)

### 1. Find the lineage name

```bash
ssh -i ~/.ssh/subhsandesh_ec2 ubuntu@13.207.193.62
sudo certbot certificates
```

Note the **Certificate Name** for the `*.subhsandesh.in` entry. It is almost
certainly `subhsandesh.in`; if it has a `-0001` suffix, use that instead
everywhere below. Getting this right is what keeps nginx pointing at the file
certbot writes — nginx refers to `/etc/letsencrypt/live/<lineage>/`, so issuing
under a new lineage name would leave nginx serving the old, expired file.

### 2. Ask for the certificate

```bash
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  --cert-name subhsandesh.in \
  -d 'subhsandesh.in' \
  -d '*.subhsandesh.in' \
  --agree-tos \
  --no-eff-email
```

### 3. Publish BOTH TXT records before pressing Enter

Certbot will print two different values for the **same** record name:

```
_acme-challenge.subhsandesh.in
```

One is for the apex, one for the wildcard. **Both must exist at the same time.**
This is the step that usually goes wrong: people add the first value, press
Enter, and validation fails because the second is missing — or they replace the
first record with the second instead of adding a second record beside it.

In GoDaddy → Domain → DNS → Add record:

| Type | Name              | Value                  | TTL      |
|------|-------------------|------------------------|----------|
| TXT  | `_acme-challenge` | *(first value shown)*  | 600 (or the minimum offered) |
| TXT  | `_acme-challenge` | *(second value shown)* | 600      |

Enter `_acme-challenge` as the name, not the full hostname — GoDaddy appends the
domain itself.

Then, from another terminal, confirm both are visible before continuing:

```bash
dig +short TXT _acme-challenge.subhsandesh.in
```

Two quoted strings must come back. Only then press Enter in certbot.

### 4. Reload nginx

Certbot writes the new file but does not restart anything.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Verify from off the box

```bash
echo | openssl s_client -connect subhsandesh.in:443 -servername subhsandesh.in 2>/dev/null \
  | openssl x509 -noout -dates -ext subjectAltName
```

`notAfter` should be about 90 days out, and the SAN list must still contain
**both** `subhsandesh.in` and `*.subhsandesh.in`. If the wildcard is missing, a
share link on a user subdomain will still fail — reissue rather than leave it.

### 6. Delete the two TXT records

They are single-use, and leaving them makes the next renewal harder to reason
about.

---

## Making this stop happening

The manual route above buys 90 days and then fails in exactly the same way, at a
time nobody chooses. Two ways out, in order of preference:

**A. Give certbot an API key for GoDaddy's DNS.** A DNS-01 plugin publishes and
removes the TXT records itself, so `certbot renew` works unattended and the
existing systemd timer handles it. Create a key at
`developer.godaddy.com/keys` (Production, not OTE), then the plugin's credentials
file goes on the box with mode `600`. This is the smallest change that actually
fixes the cause.

**B. Move the zone to Route 53 and use `certbot-dns-route53`.** More disruptive —
it moves all DNS, including the MX records that carry company mail, and the
`reply.subhsandesh.in` MX that inbound email depends on. Worth it only if there
are other reasons to move.

Either way, add a check that the certificate has more than 20 days left, so the
next failure is noticed by a monitor rather than by a customer.

## Whatever the fix, re-check inbound email afterwards

Expired TLS makes SNS drop deliveries, and SNS gives up after its retry window
rather than queueing forever. After the certificate is valid again, confirm the
subscriptions are still healthy and that a real reply arrives — see
`docs/ses-inbound-setup.md`.
