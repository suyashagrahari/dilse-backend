# Amazon SES setup — `feedback@subhsandesh.in`

What has to exist in AWS before `/admin/drafts` can send a follow-up email.

Region: **us-east-1** (US East, N. Virginia). Everything below must be in that
region — SES identities are per-region, and a domain verified in one region is
invisible to another.

Until this is done the feature still works: drafts list, reasons compute, emails
generate. Only **Send** is disabled, and the panel says so rather than failing
quietly.

---

## 1. Verify the domain (not just the address)

SES → **Identities** → *Create identity* → **Domain** → `subhsandesh.in`.

Leave **Easy DKIM** on, RSA_2048. AWS gives three CNAME records:

```
<token1>._domainkey.subhsandesh.in  CNAME  <token1>.dkim.amazonses.com
<token2>._domainkey.subhsandesh.in  CNAME  <token2>.dkim.amazonses.com
<token3>._domainkey.subhsandesh.in  CNAME  <token3>.dkim.amazonses.com
```

Publish all three at the DNS host. Verification usually completes in minutes and
can take up to 72 hours.

**Why the domain and not `feedback@subhsandesh.in` alone.** Verifying a single
address requires a real mailbox at that address to receive and click a
confirmation link, and it covers only that one address. A verified domain covers
every address on it, so the next sending address needs no AWS work at all.

### This does not conflict with Resend

Resend already sends the OTP, contact-reply and feedback-reply mail for this
domain. The two coexist:

- **DKIM** — each provider signs with its own selector, and any number of
  `_domainkey` CNAMEs can be published side by side.
- **SPF** — only relevant if you set a custom MAIL FROM below. SES's default
  MAIL FROM is an `amazonses.com` subdomain, which needs nothing from you.
- **DMARC** — if `_dmarc.subhsandesh.in` exists, SES mail passes it through the
  DKIM signature above once the domain shows *Verified*.

---

## 2. IAM: one user, one permission

SES → nothing to do here. Go to **IAM** → *Users* → *Create user* (no console
access), then attach an inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendOnlyAsFeedbackAddress",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:us-east-1:769638986416:identity/subhsandesh.in",
      "Condition": {
        "StringEquals": {
          "ses:FromAddress": "feedback@subhsandesh.in"
        }
      }
    },
    {
      "Sid": "AllowConfigurationSets",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:us-east-1:769638986416:configuration-set/*"
    }
  ]
}
```

### Both statements are required, and the second one is not optional

The first version of this document had only the identity statement, and every
send failed with:

```
not authorized to perform 'ses:SendEmail' on resource
'arn:aws:ses:us-east-1:769638986416:configuration-set/my-first-configuration-set'
```

When a configuration set applies to a send — and one does as soon as the identity
has a DEFAULT configuration set, which the SES setup wizard creates — SES
authorises `ses:SendEmail` against **two** resources: the identity and the
configuration set. Allowing only the identity denies every send, and the error
names the configuration set rather than the identity, which sends you looking in
the wrong place.

The configuration-set statement carries no condition on purpose. A configuration
set grants nothing by itself: SES still demands authorisation on the identity,
and that is what statement 1 restricts. So the `feedback@` guardrail is intact
while bounce and complaint tracking keeps working.

Then *Security credentials* → **Create access key** → Application running outside
AWS. Copy the key id and secret once; the secret is never shown again.

**Do not reuse the S3 key.** That key has no SES permission, which is why the
server deliberately does not fall back to it: a fallback would turn a clear
"SES is not configured" into an `AccessDenied` at send time. Equally, this key
should not gain S3 access — if it leaks, the blast radius is "can send email as
feedback@", not "can read the media bucket".

The `Condition` block is the part worth keeping. Without it the key can send as
any address on the domain, including `verify@` and `support@`, which would let a
leaked nudge-sending key impersonate sign-in email.

---

## 3. Environment variables

```
SES_REGION=us-east-1
SES_ACCESS_KEY_ID=<from step 2>
SES_SECRET_ACCESS_KEY=<from step 2>
SES_FROM_EMAIL=feedback@subhsandesh.in
SES_FROM_NAME=SubhSandesh
SES_CONFIGURATION_SET=          # optional, see step 5
```

On the production box these belong beside the existing secrets. In GitHub
Actions they are repository secrets referenced from the deploy workflow, exactly
as `S3_ACCESS_KEY_ID` already is.

`SES_REGION` defaults to `us-east-1` and `SES_FROM_EMAIL` to
`feedback@subhsandesh.in`, so in practice only the two credentials are required.

---

## 4. Production access — already granted

The account dashboard shows **50,000 emails per 24-hour period** and **14 per
second**. Those are production limits; the sandbox is 200 per 24 hours at 1 per
second. So:

- Mail can go to any recipient, verified or not. This matters — in the sandbox
  every recipient must be individually verified, which for this feature means
  every real user, and sends would fail with a `MessageRejected` naming the
  unverified address.
- The quota is far above anything this panel can produce. It sends one email at a
  time, by hand, with a one-per-draft and one-per-person-per-week guard.

---

## 5. Optional: a configuration set for bounces

Not required to send. Worth having before this is used much, because bounces and
complaints are what decide whether mail from the domain keeps being delivered —
and this is the only unsolicited mail the platform sends.

SES → **Configuration sets** → create one (e.g. `draft-followups`) → add an
event destination for **Bounce**, **Complaint** and **Delivery**, pointing at an
SNS topic or CloudWatch. Then set `SES_CONFIGURATION_SET=draft-followups`.

Leave the variable empty if you skip this. It must not be set to the name of a
configuration set that does not exist — SES rejects the entire send in that case,
which is why the code omits the field rather than passing an empty string.

---

## 6. Verifying it works

With the variables set and the server restarted:

1. `/admin/drafts` should no longer show the red "SES is not configured" banner.
2. Open a draft belonging to **your own** account, generate an email, and send it
   to yourself.
3. Check the raw headers of what arrives: `dkim=pass` and a `d=subhsandesh.in`
   signature mean step 1 landed correctly.

If the send fails, the panel shows SES's own reason. The three common ones:

| Message | Cause |
|---|---|
| "the From address is not a verified identity" | The domain is still *Pending* in SES, or DKIM CNAMEs are not published. |
| "SES refused the credentials" | Key lacks `ses:SendEmail`, or belongs to a different AWS account than the identity — **or the policy is missing the configuration-set statement above**, which is by far the most likely cause. Read the full AWS message: it names the resource it denied. |
| "SES has paused sending" | Bounce or complaint rate crossed a threshold. Check Reputation metrics; do not keep retrying. |

---

## What the code does with all this

- `src/services/ses.service.ts` — the transport. Inert with a clear log when
  unconfigured; maps each SES exception to an actionable message.
- `src/controllers/adminDraft.controller.ts` — sends **before** recording, so a
  refusal leaves the draft marked as not-contacted, which is true.
- `src/utils/draftNudgeEmail.ts` — the HTML, including the footer that says why
  the email arrived and how to stop it. There is no unsubscribe link because
  there is no subscription: one email per draft, sent by hand.
