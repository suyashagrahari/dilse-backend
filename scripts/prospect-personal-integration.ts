// Personal invite mode against a REAL MongoDB (never SES): the queue worker
// end to end with a recording transport.
//
//   PROSPECT_SEND_START_HOUR=0 PROSPECT_SEND_END_HOUR=0 \
//   PPM_MONGO=mongodb://localhost:27017/ppm_test npx tsx scripts/prospect-personal-integration.ts
//
// Drops the database it is given at the end. Refuses any DB name that does
// not end in _test.

import assert from "node:assert/strict";
import mongoose from "mongoose";
import InfluencerProspect from "../src/models/InfluencerProspect";
import ProspectMailJob from "../src/models/ProspectMailJob";
import EmailThread from "../src/models/EmailThread";
import { processProspectQueueOnce, personalSenderStatus } from "../src/services/prospectQueue.service";
import { addProspect, enqueueJobs, recordProspectReply } from "../src/services/prospect.service";
import { canEmailProspect, PERSONAL_OPT_OUT_LINE } from "../src/services/prospectMail.service";
import { replySubject } from "../src/services/emailThread.service";
import { SesSendError, type SesEmail } from "../src/services/ses.service";

const URI = process.env.PPM_MONGO || "";
if (!/\/[a-z0-9_]+_test(\?|$)/i.test(URI)) throw new Error("PPM_MONGO must point at a *_test database");

const BODY = `Hi {{firstName}},

I'm Suyash, I run SubhSandesh, a small site where people make personalised pages for birthdays, anniversaries and festivals.

I came across {{instagram}} on Instagram and liked your couple videos.

Would you be open to a paid collab? Happy to share details.

${PERSONAL_OPT_OUT_LINE}`;

async function main() {
  await mongoose.connect(URI);
  await mongoose.connection.db!.dropDatabase();
  await ProspectMailJob.syncIndexes();
  const seen: SesEmail[] = [];
  let n = 0;
  const record = async (e: SesEmail) => {
    seen.push(e);
    return { outcome: "sent" as const, messageId: `0100018f-${++n}` };
  };
  let t = Date.now();
  const tick = (transport = record) => {
    t += 10 * 60_000; // past any 2–6 min jitter
    return processProspectQueueOnce({ now: new Date(t), transport });
  };

  const a = await addProspect({ name: "Priya Sharma", email: "priya@x.in", instagram: "priya.reels", note: "", niche: "", followerRange: "" }, { email: "admin@x.in" });
  const b = await addProspect({ name: "Ravi Kumar", email: "ravi@x.in", instagram: "ravi_99", note: "", niche: "", followerRange: "" }, { email: "admin@x.in" });
  assert.ok(a.ok && b.ok);
  const pa = a.ok ? a.prospect : null!;
  const pb = b.ok ? b.prospect : null!;

  // 1. SES refuses the personal sender → job waits, status says so, nothing else tried.
  await enqueueJobs([{ prospectId: String(pa._id), kind: "initial", subject: "quick question", body: BODY, style: "personal" }], { aiAssisted: false, byEmail: "admin@x.in" });
  const tried: string[] = [];
  const refuse = async (e: SesEmail) => {
    tried.push(String(e.from));
    throw new SesSendError("SES refused this send. AWS said: User `arn:aws:iam::769638986416:user/subhsandesh-ses-sender' is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:us-east-1:769638986416:identity/subhsandesh.in'");
  };
  const r1 = await tick(refuse);
  assert.equal(r1.did, "failed");
  assert.deepEqual(tried, ["suyashagrahari@subhsandesh.in"]);
  const waiting = await ProspectMailJob.findOne({ prospectId: pa._id }).lean();
  assert.equal(waiting?.state, "queued");
  assert.match(String(waiting?.error), /Personal sender isn't allowed yet/);
  assert.match(String(personalSenderStatus()?.message), /add-personal-sender\.sh/);
  console.log("✓ policy refusal: job waits, message surfaced, no other sender tried");

  // A classic job still goes out while the personal one waits.
  await enqueueJobs([{ prospectId: String(pb._id), kind: "initial", subject: "Your own link on SubhSandesh", body: "x".repeat(10), style: "classic" }], { aiAssisted: false, byEmail: "admin@x.in" });
  const r2 = await tick();
  assert.equal(r2.did, "failed", "classic body above is too short — lint blocks it, proving the classic path ran");
  assert.equal(seen.length, 0);
  console.log("✓ personal jobs paused, classic jobs still processed");

  // 2. Policy fixed: after the retry hour, the personal job goes out as the person.
  t += 61 * 60_000;
  const r3 = await tick();
  assert.equal(r3.did, "sent", JSON.stringify(r3));
  const first = seen.at(-1)!;
  assert.equal(first.from, "suyashagrahari@subhsandesh.in");
  assert.equal(first.fromName, "Suyash Agrahari");
  assert.equal(first.html, "");
  assert.ok(!Object.keys(first.headers || {}).some((h) => /list-unsub/i.test(h)));
  assert.ok(!/INF-|unsubscribe|Ref:/i.test(first.text));
  assert.equal(personalSenderStatus(), null);
  const p1 = await InfluencerProspect.findById(pa._id).lean();
  assert.equal(p1?.outreachStyle, "personal");
  console.log("✓ personal send: From person, text only, no List-Unsubscribe, no footer/token");

  // 3. Follow-up in the same thread: Re: subject + In-Reply-To the first.
  await InfluencerProspect.updateOne({ _id: pa._id }, { $set: { lastContactedAt: new Date(t - 5 * 86_400_000) } });
  const thread = await EmailThread.findById(p1?.threadId).lean();
  const firstId = thread?.messages[0].rfcMessageId;
  assert.ok(firstId);
  await enqueueJobs([{ prospectId: String(pa._id), kind: "followup", subject: replySubject(thread!.subject), body: "Hi {{firstName}}, just bumping this up in case it got buried. Would a paid collab interest you?", style: "personal" }], { aiAssisted: false, byEmail: "admin@x.in" });
  const r4 = await tick();
  assert.equal(r4.did, "sent", JSON.stringify(r4));
  const fu = seen.at(-1)!;
  assert.equal(fu.subject, "Re: quick question");
  assert.equal(fu.headers?.["In-Reply-To"], firstId);
  assert.ok(String(fu.headers?.References).includes(firstId!));
  assert.equal(fu.from, "suyashagrahari@subhsandesh.in");
  console.log(`✓ follow-up threads: "${fu.subject}", In-Reply-To ${firstId}`);

  // 4. They reply "no" → suppressed for good.
  await recordProspectReply(String(p1?.threadId), "Re: quick question", "No\n\nSent from my iPhone");
  const p2 = await InfluencerProspect.findById(pa._id).lean();
  assert.equal(p2?.status, "not_interested");
  assert.ok(!canEmailProspect(p2!).ok);
  console.log("✓ reply “no” → not_interested, never emailed again");

  await mongoose.connection.db!.dropDatabase();
  await mongoose.disconnect();
  console.log("ALL OK (database dropped)");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  } catch { /* ignore */ }
  process.exit(1);
});
