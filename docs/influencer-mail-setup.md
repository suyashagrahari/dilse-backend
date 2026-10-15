# Influencer email: setup

The chat on **/admin/influencers/:id** sends mail as
`influencer-support@subhsandesh.in` and shows the influencer's replies in the
same conversation. Sending works as soon as SES works. Seeing replies in the
app needs **one** of the inbound routes below. Until one of them is set up, the
panel says **"Replies won't appear here automatically"** and offers a paste box.
It never fails silently.

The apex MX (`subhsandesh.in`) stays with GoDaddy. Nothing here changes it.

## How it fits together

```
admin presses Send ─► SES (From: influencer-support@subhsandesh.in,
                           Reply-To: INFLUENCER_REPLY_TO_EMAIL or the From,
                           footer "Ref: INF-XXXXXXXX")
                     └► EmailThread{kind:"influencer"} + AdminAuditLog "influencer.mail_sent"

influencer replies ─► influencer-support@ (GoDaddy mailbox)
                        ├─ A. IMAP poller reads it (INFLUENCER_IMAP_*)     ─┐
                        └─ B. GoDaddy forwards a copy ─► influencer@reply.  │
                              subhsandesh.in ─► SES ─► SNS ─► webhook      ─┤
                   or ─► C. Reply-To is influencer@reply.subhsandesh.in     │
                              directly ─► SES ─► SNS ─► webhook            ─┤
                                                                            ▼
                        inboundIngest: recipient is an influencer address?
                          → matchInfluencerInbound: headers → footer Ref → sender
                          → appended to their thread, marked unread (badge on the list)
```

## 1. Sending (required)

1. **Mailbox.** In GoDaddy (Email & Office), create the mailbox
   `influencer-support@subhsandesh.in`. A real mailbox, not an alias, if you
   want route A; an alias into `support@` works for route A-shared (below).
2. **SES identity.** Nothing to do if the domain identity `subhsandesh.in` is
   verified in SES (it is — `billing@` and `verify@` rely on it). Check in
   SES → Identities that `subhsandesh.in` shows *Verified*. If you only have
   per-address identities, add `influencer-support@subhsandesh.in` and click
   the link SES mails to it.
3. **IAM.** The SES key's policy must allow `ses:SendEmail` for the domain
   identity (same as for feedback mail; see `docs/ses-setup.md`).
4. **Env** (server, prod and staging):
   ```
   INFLUENCER_FROM_EMAIL=influencer-support@subhsandesh.in   # default
   INFLUENCER_FROM_NAME=SubhSandesh Creators                 # default
   ```

## 2. Getting replies into the app (pick one)

### A. Poll the mailbox over IMAP (simplest, no DNS)

```
INFLUENCER_IMAP_USER=influencer-support@subhsandesh.in
INFLUENCER_IMAP_PASSWORD=<the mailbox password>
# INFLUENCER_IMAP_HOST defaults to IMAP_HOST (imap.secureserver.net for GoDaddy)
```

Opened read-only: nothing is marked read, moved or deleted — a person can keep
using the mailbox. Replies appear within `IMAP_POLL_SECONDS` (default 120 s).

*Shared variant:* if `influencer-support@` is an **alias** into `support@`,
skip the vars above and add it to the existing filter instead:
`IMAP_FILTER_TO=feedback@subhsandesh.in,influencer-support@subhsandesh.in`.

### B. Forward a copy to SES (seconds, keeps the mailbox copy)

Requires SES receiving on `reply.subhsandesh.in`, already set up for feedback
mail (`docs/ses-inbound-setup.md`).

1. SES → Email receiving → your active rule set → the rule that publishes to
   the inbound SNS topic → add recipient `influencer@reply.subhsandesh.in`.
2. GoDaddy → `influencer-support@` mailbox → Forwarding → forward a copy to
   `influencer@reply.subhsandesh.in`.
3. Env: `INFLUENCER_INBOUND_ADDRESSES=influencer@reply.subhsandesh.in`

### C. Ask for replies on the SES subdomain directly (no GoDaddy hop)

Step B.1, then `INFLUENCER_REPLY_TO_EMAIL=influencer@reply.subhsandesh.in`.
Mail still comes FROM `influencer-support@`, but replies go straight to SES.
Nobody sees them in GoDaddy — the app is the only inbox.

Use a different local part per environment (`influencer-staging@reply…`) if
staging and prod share the receiving domain, as `SES_REPLY_TO_EMAIL` does.

## 3. Check it

1. Open `/admin/influencers/<your own test influencer>` → the **Email** panel's
   status line names the live route (`IMAP`, `SES webhook`) or says it is not
   configured.
2. Generate → Welcome → edit → Send. The bubble shows **sent**.
3. Reply from the influencer's inbox. Within the ETA the reply appears on the
   left, the list card shows a red dot, and the server logs
   `route: influencer, matched by: headers`.

## Matching (why a reply finds its chat)

Mail addressed to an influencer address is matched by
`matchInfluencerInbound` (`threadStore.service.ts`):

1. `In-Reply-To` / `References` against ids we hold (SES rewrites Message-ID;
   we store the reconstructed `<id@email.amazonses.com>`).
2. The footer reference `Ref: INF-XXXXXXXX`, found in the subject or quoted
   history — survives stripped headers and a different sender address.
3. The newest influencer thread for the sender address.
4. A known influencer with no thread yet → their thread is opened.
5. Otherwise an *Unmatched* thread in `/admin/threads`, never dropped.

Mail not addressed to an influencer address uses the general ladder, which
never reaches into influencer threads.

## Env reference

| Var | Default | Purpose |
| --- | --- | --- |
| `INFLUENCER_FROM_EMAIL` | `influencer-support@subhsandesh.in` | From address |
| `INFLUENCER_FROM_NAME` | `SubhSandesh Creators` | Display name |
| `INFLUENCER_REPLY_TO_EMAIL` | *(= From)* | Where replies are asked to go (route C) |
| `INFLUENCER_INBOUND_ADDRESSES` | — | Extra recipient addresses that mean "influencer mail" (route B) |
| `INFLUENCER_IMAP_HOST/PORT/USER/PASSWORD/MAILBOX` | host/port from `IMAP_*` | Route A |
| `INFLUENCER_MAIL_STUB` | off | `1` = record sends without sending. Ignored when `APP_ENV=production` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | `gpt-4o-mini` | Drafting (same as the other drafters) |
