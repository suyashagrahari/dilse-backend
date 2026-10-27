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
