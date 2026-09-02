# The IAM user for SES setup

`ses-inbound-setup-policy.json` is the policy. This explains what each
statement is for, and why it is not `AdministratorAccess`.

## Why not admin

Account `769638986416` also holds `subhsandesh-prod` — which is the **only**
copy of every image on the site, since the previous bucket died with its AWS
account — plus CloudFront, the ACM certificates, and the EC2 box that serves
both staging and production.

An admin key can delete all of it. This policy touches `ses` and `sns` and
nothing else, so the worst it can do is misconfigure email.

It also carries no `Delete*` action at all. Re-running setup uses
`UpdateReceiptRule`, so nothing needs removing, and a key that cannot delete
cannot un-verify `subhsandesh.in` and silently stop every email the product
sends.

## What each statement is for

| Sid | Why |
|---|---|
| `ReadAccountStatus` | Answers the two questions that matter most: are we out of the sandbox (200/day vs 50,000/day), and which pricing plan is active (à-la-carte at $0/mo vs Pro at $105/mo). Read-only. |
| `VerifyTheReceivingSubdomain` | Creates `reply.subhsandesh.in` as a domain identity and reads back its DKIM records so they can be pasted into GoDaddy. |
| `ManageReceiptRules` | The inbound pipeline itself — the rule set, the rule matching `inbox@reply.subhsandesh.in`, and activating it. |
| `ConfigurationSetsForTransactionalMail` | So sign-in codes get their own configuration set, keeping their bounce and complaint numbers readable apart from the unsolicited follow-ups. |
| `SnsForInboundNotifications` | Creates the topic SES publishes arriving mail to, permits SES to publish to it, and subscribes the webhook. |
| `SendOnlyFromOurOwnAddresses` | End-to-end testing. Restricted by a `ses:FromAddress` condition so this key cannot send as any other address on the domain. |

## Why `Resource: "*"` on most of them

Not laziness. **SES receipt-rule actions do not support resource-level
permissions** — AWS provides no ARN to scope them to, so `"*"` is the only
form that works. The same is true of the account-level reads.

Where scoping IS possible it is used: `SendEmail` is conditioned on the From
address.

## Creating the user

**Check the account first.** SES for SubhSandesh is in **769638986416**. The
credentials already on this laptop are `Suyash_HireQuotient` in
**072928014669** — a different, work-owned account. Do not create this user
there.

1. IAM Console → **Policies** → **Create policy** → **JSON** tab
2. Paste `ses-inbound-setup-policy.json`
3. Name it `SubhSandeshSesSetup`
4. IAM → **Users** → **Create user**, name `subhsandesh-ses-setup`
5. Do **not** give it console access — programmatic only
6. Attach `SubhSandeshSesSetup`
7. Create an **access key** → *Application running outside AWS*

## Handing it over WITHOUT putting it in a chat transcript

Do not paste the key into a chat. Run this yourself and type the values at
the prompts:

```bash
aws configure --profile subhsandesh
# AWS Access Key ID:      <paste>
# AWS Secret Access Key:  <paste>
# Default region name:    us-east-1
# Default output format:  json
```

It is written to `~/.aws/credentials` under the `subhsandesh` profile. Every
command then uses `--profile subhsandesh`, so the credential is usable without
ever being quoted, logged, or stored in a conversation.

Verify it landed in the right account:

```bash
aws sts get-caller-identity --profile subhsandesh
# Account must be 769638986416
```

## Revoking it

The whole point of a scoped key is that throwing it away is cheap:

```
IAM → Users → subhsandesh-ses-setup → Security credentials → deactivate/delete the key
```

Delete it once the setup is done. Nothing in the running application uses it —
the app sends with `SES_ACCESS_KEY_ID`, which is a separate, send-only key.

## Still outstanding

`AKIA3GMQO6KYHBHX25FA` was pasted into a chat transcript on 2026-09-02 and is
still live. Rotate it: IAM → that user → Security credentials → create a new
key, update the `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY` GitHub secrets,
redeploy, then delete the old key.
