# Getting a creator's reply to appear in the panel

Outbound threading works now, with no setup. This document is only about the
other direction: making a reply the creator sends show up in
`/admin/drafts` and `/admin/threads` on its own.

---

## What is already true

Every follow-up goes out as:

```
From:     SubhSandesh <feedback@subhsandesh.in>
Reply-To: feedback@subhsandesh.in
```

So **a reply already goes to `feedback@subhsandesh.in`.** That needs no code and
no DNS change. It needs exactly one thing:

- [ ] **`feedback@subhsandesh.in` must exist as a real mailbox or alias** at
      whichever provider hosts `subhsandesh.in` mail (the same place
      `support@subhsandesh.in` lives).

If it does not exist, every reply bounces, and the footer on every follow-up —
"Reply to this email if you would rather we did not write again" — is a promise
we are not keeping. **Check this first; it matters more than anything else
below.**

---

## Why SES cannot simply receive that address

The obvious answer is "point the MX record at SES". It does not work here.

`feedback@subhsandesh.in` is on the **apex domain**, and the apex MX already
points at the company mail provider. Those same records deliver
`support@subhsandesh.in`, `verify@subhsandesh.in` and personal mailboxes.
There is one MX record set per hostname, so handing the apex to SES hands SES
**all company mail** — and SES Email Receiving is not a mailbox, so that mail
would become undeliverable rather than merely redirected.

That is a fact about the DNS, not a limitation of the code.

---

## The shape that works

Receive on a **subdomain**, whose MX is free, and have the real mailbox forward
into it.

```
   creator hits Reply
            │
            ▼
   feedback@subhsandesh.in        ← their existing mail provider. A human can
   (real mailbox, apex MX)          read it here. Nothing breaks if you stop.
            │
            │  forwarding rule (one setting at the provider)
            ▼
   inbox@reply.subhsandesh.in     ← MX points at SES. Subdomain only, so the
   (SES Email Receiving)            apex is untouched.
            │
            ▼
   SNS topic  →  POST /api/webhooks/ses-inbound/<token>
            │
            ▼
   the reply appears in the conversation
```

A forwarded copy keeps the original `In-Reply-To` and `References` headers,
which is what the matching ladder needs. Some providers rewrite `From` to the
forwarding mailbox, which is why the sender is read from `Reply-To` first —
see `senderOf` in `src/controllers/sesInbound.controller.ts`.

### Steps

1. **Verify the subdomain in SES.** SES → Verified identities → Create
   identity → Domain → `reply.subhsandesh.in`. Publish the DKIM CNAMEs it
   gives you.

2. **Publish the MX for the subdomain only.** Host `reply`, value:
   ```
   10 inbound-smtp.us-east-1.amazonaws.com
   ```
   Do **not** touch the apex MX.

3. **Create an SNS topic**, e.g. `ses-inbound-replies`. Note its ARN.

4. **Create a receipt rule set** in SES → Email receiving:
   - Recipient condition: `inbox@reply.subhsandesh.in`
   - Action: **Publish to Amazon SNS topic** → the topic above
   - Encoding: **UTF-8** (Base64 changes what arrives and the parser expects
     UTF-8)
   - Enable the rule set — an SES rule set that is not the *active* one does
     nothing.

   > The SNS action carries the whole message in the notification, which is
   > what the webhook parses. If you choose the **S3** action instead, the mail
   > goes to a bucket and the notification arrives with no `content` — the
   > webhook logs exactly that and stores nothing.
   >
   > SNS payloads are capped around 150 KB. A reply with a large attachment
   > exceeds it and will not arrive. That is acceptable for replies; if it ever
   > matters, the answer is the S3 action plus a fetch, which is not built.

5. **Set two env vars on the box** (`/opt/dilse/.env.dev.backend` for dev):
   ```
   SES_INBOUND_TOKEN=<a long random string — treat it as a secret>
   SES_INBOUND_TOPIC_ARN=arn:aws:sns:us-east-1:769638986416:ses-inbound-replies
   ```
   Generate the token with `openssl rand -hex 32`.

   **With `SES_INBOUND_TOKEN` unset the webhook answers 404 to everything.**
   That is the default, and it is deliberate: this is the only publicly
   reachable route in the feature, and what it writes is displayed as a named
   customer's own words.

6. **Subscribe the topic to the webhook.** SNS → the topic → Create
   subscription → Protocol HTTPS → Endpoint:
   ```
   https://stag-api.subhsandesh.in/api/webhooks/ses-inbound/<the token>
   ```
   Leave "Enable raw message delivery" **off** — the signature is on the SNS
   envelope, and raw delivery removes it.

   The subscription confirms itself: SNS posts a `SubscriptionConfirmation`,
   and the webhook visits the `SubscribeURL` for you.

7. **Add the forwarding rule** at the mail provider:
   `feedback@subhsandesh.in` → also deliver to `inbox@reply.subhsandesh.in`.
   Keep delivering to the mailbox as well, so a human can still read it.

8. **The IAM policy needs nothing new.** Receiving is done by SES itself
   publishing to SNS, not by our credentials. The `ses:SendEmail` policy in
   `docs/ses-setup.md` is still the whole of it.

---

## Until then

The panel does not wait for any of this. Each conversation offers **"Paste a
reply they sent"**: paste the reply out of the `feedback@` mailbox and it joins
the thread, quote-stripped the same way the webhook would do it.

A pasted message is labelled **pasted** wherever it appears, and the action is
recorded in the admin audit log against whoever typed it — a message attributed
to a customer that a colleague actually typed must never be indistinguishable
from one that arrived.

---

## How a reply finds its conversation

Four rungs, tried in order — `matchInboundThread` in
`src/services/threadStore.service.ts`:

| # | Evidence | When it fires |
|---|---|---|
| 1 | `In-Reply-To` / `References` names an id we hold | The client behaved. Exact. |
| 2 | Same sender **and** same base subject | Rung 1 could not fire — usually the first reply, where our own id is only a reconstruction. |
| 3 | Same sender, newest open conversation, within 45 days | The client rewrote the subject entirely. |
| 4 | Nothing matched | Stored as its own **Unmatched** conversation. Never dropped. |

Rung 2 exists because of one SES behaviour worth knowing:

> "If you provide a `Message-ID` header, Amazon SES overrides the header with
> its own value." — SES documentation

So we never learn the `Message-ID` of anything we send. The API returns SES's
own id, and the delivered header is that id with the region's SES domain glued
on — reliable in practice, but observed rather than documented. Every outbound
id is therefore stored as `reconstructed`, the subject line is kept as an
independent fallback, and the moment a real reply arrives we have its true id
and the chain becomes exact from there on. The panel shows which state a
conversation is in.

---

## Checking it works

```bash
# 1. Send yourself a follow-up from /admin/drafts (a draft you own).
# 2. Reply to it from the recipient mailbox.
# 3. On the box:
docker logs <container> 2>&1 | grep -i "inbound reply"
#    → Stored an inbound reply from you@example.com (matched by: headers)
```

`matched by:` tells you which rung fired. `headers` on the very first reply
means the reconstructed id was right. `subject` means it was not, and the
fallback did its job — which is the expected and acceptable outcome, not a bug.

If nothing is logged at all, in order: is the rule set **active**; is the
subscription **Confirmed** in the SNS console; does the endpoint URL carry the
right token; did the provider actually forward.

---

## Still open

- **DMARC.** `_dmarc` TXT → `v=DMARC1; p=none; rua=mailto:suyashagrahari@subhsandesh.in`.
  SES flags its absence as High. Unrelated to threading, still worth doing.
- **A do-not-contact flag.** The footer offers an opt-out and there is nothing
  behind it: a reply saying "stop emailing me" is stored and readable, but
  nothing prevents the next follow-up. Right now the per-draft and per-person
  guards are what stand in for it.
