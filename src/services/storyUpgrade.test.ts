import test from "node:test";
import assert from "node:assert/strict";
import { birthdayGfStory, happyBirthdayStory } from "./storyUpgrade.service";

test("birthday-gf: their words make the story, the template's sample lines do not", () => {
  const s = birthdayGfStory({
    recipientName: "Riya",
    senderName: "Aarav",
    birthdayWish: "Wishing you a birthday filled with love, laughter, and cherished memories to last a lifetime.",
    personalMessage: "Happy birthday jaan! Five years since that rainy day at the college canteen and you still steal my fries.",
    galleryPhotos: [{ url: "https://x/a.jpg", caption: "Goa, 2023" }, { url: "https://x/b.jpg", caption: "" }],
    quizQuestions: [
      { question: "What is the birthday person's favourite colour?", options: ["Pink", "Blue"], correct: 0 },
      { question: "Where did we first meet?", options: ["Canteen", "Library"], correct: 0 },
    ],
    truthDareQuestions: [{ type: "dare", text: "Sing Happy Birthday to yourself right now!" }],
  });
  assert.ok(s.story.includes("college canteen"));
  assert.ok(s.story.includes("Goa, 2023"));
  assert.ok(s.story.includes("Where did we first meet? → Canteen"));
  assert.ok(!s.story.includes("cherished memories"), "sample wish dropped");
  assert.ok(!s.story.includes("favourite colour"), "sample quiz dropped");
  assert.ok(!s.story.includes("Sing Happy Birthday"), "sample dare dropped");
  assert.ok(!s.story.includes("https://"), "no photo urls in the story");
  assert.equal(s.people.partnerName, "Riya");
  assert.ok(s.letter.startsWith("Happy birthday jaan"));
});

test("birthday-gf: nothing of theirs → only the opening line, no letter", () => {
  const s = birthdayGfStory({ recipientName: "Riya", senderName: "Aarav" });
  assert.equal(s.story.split("\n\n").length, 1);
  assert.equal(s.letter, "");
});

test("happy-birthday: letter, pet name, their lines and photo notes; enum keys skipped", () => {
  const s = happyBirthdayStory({
    recipientName: "Riya",
    senderName: "Aarav",
    petName: "Cutu",
    letter: "Another year of you being the best thing that ever happened to me.",
    extras: { crown: "queen", tone: "romantic", coupons: [{ title: "Breakfast in bed 🥞", line: "Pancakes, coffee, zero dishes for you." }] },
    photos: [{ url: "data:image/png;base64,xx", caption: "our first trip", note: "you fell asleep on my shoulder" }],
    endLine: "To many more birthdays together",
  });
  assert.ok(s.story.includes('calls Riya "Cutu"'));
  assert.ok(s.story.includes("Pancakes, coffee"));
  assert.ok(s.story.includes("our first trip: you fell asleep on my shoulder"));
  assert.ok(!s.story.includes("queen"));
  assert.ok(!s.story.includes("base64"));
  assert.equal(s.letter, "Another year of you being the best thing that ever happened to me.");
});

test("apology-dashboard: their apology, promises and moments; the sample world dropped", async () => {
  const { apologyStory } = await import("./storyUpgrade.service");
  const s = apologyStory({
    senderName: "Aarav",
    recipientName: "Riya",
    relationship: "girlfriend",
    headline: "I'm really, really sorry 🥺",
    sorryLetter: "I forgot our anniversary dinner and left you waiting at the cafe. That was careless and I hate that I made you feel unimportant.",
    briberyItems: [{ icon: "🧹", label: "All the chores for 7 days" }, { icon: "🍕", label: "Dominos every Friday for a month" }],
    timeline: [{ icon: "⭐", title: "Chapter I — The Spark", text: "The day the universe was showing off, and it handed me you." }, { icon: "☕", title: "Our cafe", text: "Where you laughed at my terrible jokes." }],
  });
  assert.ok(s.story.includes("forgot our anniversary dinner"));
  assert.ok(s.story.includes("Dominos every Friday"));
  assert.ok(s.story.includes("Our cafe: Where you laughed"));
  assert.ok(!s.story.includes("really, really sorry"));
  assert.ok(!s.story.includes("All the chores"));
  assert.ok(!s.story.includes("universe was showing off"));
  assert.ok(s.letter.startsWith("I forgot"));
});

test("missyou-gf: cities, reunion, letter, notes and quiz; the sample world dropped", async () => {
  const { missYouGfStory, missYouStory } = await import("./storyUpgrade.service");
  const s = missYouGfStory({
    senderName: "Aarav",
    recipientName: "Riya",
    petName: "my moon",
    yourCity: "Pune",
    theirCity: "Toronto",
    reunionDate: "2026-12-20",
    letterBody: "Teen mahine ho gaye. Har raat tumhari good night call ka wait karta hoon.",
    memories: [{ image: "data:image/png;base64,x", caption: "our first rainy walk 🌧️" }, { image: "", caption: "Marine Drive, 2025" }],
    openWhen: [{ label: "open when you miss me", text: "Close your eyes. I'm holding you right now — the exact way you like. I'm counting the days too. 🤍" }, { label: "open when it snows", text: "Send me a snowman pic, I'll send you chai." }],
    quiz: [{ question: "where was our first date?", answer: "the tiny corner cafe", memory: "you ordered the wrong coffee and drank it anyway just to keep talking." }],
  });
  assert.ok(s.story.includes("Aarav is in Pune, Riya is in Toronto"));
  assert.ok(s.story.includes("20 December 2026"));
  assert.ok(s.story.includes("good night call"));
  assert.ok(s.story.includes("Marine Drive, 2025"));
  assert.ok(s.story.includes("snowman pic"));
  assert.ok(!s.story.includes("my moon"), "sample pet name dropped");
  assert.ok(!s.story.includes("rainy walk"), "sample caption dropped");
  assert.ok(!s.story.includes("first date"), "sample quiz dropped");
  assert.ok(!s.story.includes("base64"));
  assert.ok(s.letter.startsWith("Teen mahine"));
  assert.ok(missYouStory({ recipientName: "Riya", senderName: "Aarav", letter: "Missing you a lot today, more than usual." }).story.includes("Aarav misses Riya"));
});

test("proposal, anniversary, halloween and will-you-be-mine open their stories right", async () => {
  const m = await import("./storyUpgrade.service");
  const p = m.proposalStory({ senderName: "Aarav", recipientName: "Ananya", perspective: "marriage", secretNote: "I bought the ring in March and hid it in my sock drawer.", memories: [{ caption: "Goa sunset" }, { caption: "" }] });
  assert.ok(p.story.startsWith("Aarav is asking Ananya to marry them."));
  assert.ok(p.story.includes("sock drawer") && p.story.includes("Goa sunset"));
  assert.ok(m.happyAnniversaryStory({ senderName: "Aarav", recipientName: "Riya", letter: "Five years, and every one better than the last." }).story.startsWith("It is Aarav and Riya's anniversary"));
  assert.ok(m.happyHalloweenStory({ senderName: "Aarav", recipientName: "Riya" }).story.includes("Halloween surprise"));
  assert.ok(m.willYouBeMineStory({ senderName: "Aarav", recipientName: "Riya" }).story.includes("asking Riya to be theirs"));
});
