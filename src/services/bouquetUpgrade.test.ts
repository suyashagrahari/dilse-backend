import test from "node:test";
import assert from "node:assert/strict";
import {
  arrangeStems,
  buildDraft,
  buildUpgradePrompt,
  distinctFlowers,
  fallbackWriting,
  parseFreeBouquet,
  parseUpgradeWriting,
} from "./bouquetUpgrade.service";

const FREE = {
  mode: "color",
  flowers: [{ id: 12, count: 3 }, { id: 8, count: 2 }, { id: 10, count: 2 }, { id: 99, count: 4 }],
  arrangementSeed: 7,
  greenery: 1,
  recipientName: "Riya",
  senderName: "Aarav",
  message: "Saw these and thought of you. You are my favourite person, always.",
  deedEnabled: true,
  deedClauses: ["Unlimited forehead kisses", "Shared fries, always"],
};

test("the free bouquet is read defensively: unknown blooms dropped, counts capped", () => {
  const f = parseFreeBouquet({ ...FREE, flowers: [...FREE.flowers, { id: 2, count: 99 }], recipientName: "x".repeat(80) });
  assert.deepEqual(f.flowers.map((x) => x.id), [12, 8, 10, 2]);
  assert.equal(f.flowers[3].count, 10);
  assert.equal(f.recipientName.length, 30);
  assert.deepEqual(parseFreeBouquet("nonsense").flowers, []);
});

test("every stem they picked comes across, mapped and inside the studio's limits", () => {
  const stems = arrangeStems(parseFreeBouquet(FREE).flowers);
  assert.equal(stems.length, 7);
  assert.equal(stems.filter((s) => s.flower === "rose-red").length, 3);
  assert.equal(stems.filter((s) => s.flower === "sunflower").length, 2);
  for (const s of stems) {
    assert.ok(s.x >= 0 && s.x <= 1000 && s.y >= 0 && s.y <= 1000);
    assert.ok(s.rot >= -60 && s.rot <= 60 && s.scale >= 60 && s.scale <= 150);
  }
  // The biggest bloom takes the centre slot.
  assert.equal(stems[0].flower, "sunflower");
  assert.ok(arrangeStems([]).length >= 3, "never below the studio's minimum");
});

test("no photos are ever added, and the deed becomes the letter's P.S. without the model", () => {
  const free = parseFreeBouquet(FREE);
  const flowers = distinctFlowers(arrangeStems(free.flowers));
  const d = buildDraft(free, fallbackWriting(free, flowers));
  assert.deepEqual(d.photos, []);
  assert.equal(d.recipientName, "Riya");
  assert.ok(d.letter.startsWith("Saw these"));
  assert.ok(d.letter.includes("Shared fries, always"));
  assert.deepEqual(d.extras.flowerNotes.map((n) => n.flower).sort(), [...flowers].sort());
  assert.equal(d.extras.wrap, "tissue");
  assert.equal(buildDraft(parseFreeBouquet({ ...FREE, mode: "mono" }), fallbackWriting(free, flowers)).extras.wrap, "newspaper");
});

test("model output: greeting stripped, foreign flowers dropped, money words rejected", () => {
  const flowers = ["rose-red", "sunflower"] as const;
  const good = {
    tone: "sweet", palette: "peachSorbet", petName: "", giftTag: "Just because", deliveryLine: "Flowers for you",
    question: "Pasand aaye?", yesLine: "Yay", endLine: "Always",
    letter: "Dear Riya,\n\nSaw these and thought of you, like I always do. You are my favourite person, always and in every way.",
    flowerNotes: [{ flower: "rose-red", note: "Still you." }, { flower: "lily", note: "Not picked" }],
  };
  const w = parseUpgradeWriting(JSON.stringify(good), [...flowers]);
  assert.ok(w);
  assert.ok(w.letter.startsWith("Saw these"));
  assert.deepEqual(w.flowerNotes.map((n) => n.flower), ["rose-red"]);
  assert.equal(parseUpgradeWriting(JSON.stringify({ ...good, giftTag: "20% off coupon" }), [...flowers]), null);
  assert.equal(parseUpgradeWriting("not json", [...flowers]), null);
});

test("the prompt fences their words as data and names what they picked", () => {
  const free = parseFreeBouquet(FREE);
  const p = buildUpgradePrompt(free, distinctFlowers(arrangeStems(free.flowers)));
  assert.ok(p.includes("MESSAGE:\n<<<\nSaw these"));
  assert.ok(p.includes("they picked: Rose"));
  assert.ok(p.includes("PLEDGES:"));
});
