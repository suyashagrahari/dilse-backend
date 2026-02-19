import mongoose from "mongoose";
import { env } from "../config/env";
import Template from "../models/Template";

const templates = [
  {
    slug: "birthday-gf",
    type: "birthday",
    category: "gf",
    title: "Happy Birthday My Love",
    description: "A romantic birthday wish for your special someone",
    emoji: "🎂",
    color: "from-rose to-primary",
    previewText: "Happy Birthday, My Love! 🎂",
    bodyText:
      "Every moment with you is a gift. On your special day, I want you to know how much you mean to me. Here's to another year of love, laughter, and beautiful memories together.",
    bgGradient: "from-pink-100 via-rose-50 to-red-100",
  },
  {
    slug: "birthday-bestfriend",
    type: "birthday",
    category: "bestfriend",
    title: "BFF Birthday",
    description: "Epic birthday wishes for your best friend",
    emoji: "🎊",
    color: "from-lavender to-sky",
    previewText: "Happy Birthday, BFF! 🎊",
    bodyText:
      "To my partner in crime — happy birthday! Thanks for being the kind of friend who makes life a whole lot more fun. Let's make this year legendary!",
    bgGradient: "from-violet-50 via-blue-50 to-cyan-50",
  },
  {
    slug: "birthday-friend",
    type: "birthday",
    category: "friend",
    title: "Birthday Bash",
    description: "Fun birthday wishes for your awesome friend",
    emoji: "🎉",
    color: "from-secondary to-gold",
    previewText: "Happy Birthday, Buddy! 🎉",
    bodyText:
      "Another year older, another year wiser (debatable 😄). Wishing you the most epic birthday ever! Let's celebrate YOU today!",
    bgGradient: "from-amber-50 via-orange-50 to-yellow-50",
  },
  {
    slug: "birthday-parents",
    type: "birthday",
    category: "parents",
    title: "Dear Mom/Dad",
    description: "Heartfelt birthday wishes for your parents",
    emoji: "💐",
    color: "from-mint to-sky",
    previewText: "Happy Birthday, Dear Parent! 💐",
    bodyText:
      "Thank you for being the guiding light in my life. Your love and sacrifice have made me who I am. Wishing you all the happiness in the world on your special day.",
    bgGradient: "from-teal-50 via-cyan-50 to-blue-50",
  },
  {
    slug: "valentine-gf",
    type: "valentine",
    category: "gf",
    title: "Be My Valentine",
    description: "Express your love this Valentine's Day",
    emoji: "💝",
    color: "from-primary to-rose",
    previewText: "Will You Be My Valentine? 💝",
    bodyText:
      "In a world full of ordinary, you are my extraordinary. My heart beats for you, today and always. Happy Valentine's Day, my love.",
    bgGradient: "from-red-100 via-pink-100 to-rose-100",
  },
  {
    slug: "valentine-bestfriend",
    type: "valentine",
    category: "bestfriend",
    title: "Galentine's Day",
    description: "Celebrate love with your bestie",
    emoji: "💗",
    color: "from-lavender to-primary",
    previewText: "Happy Galentine's Day! 💗",
    bodyText:
      "Who needs a valentine when I have the best friend in the world? You make every day brighter. Love you to the moon and back!",
    bgGradient: "from-purple-50 via-pink-50 to-fuchsia-50",
  },
  {
    slug: "anniversary-gf",
    type: "anniversary",
    category: "gf",
    title: "Our Anniversary",
    description: "Celebrate your love story",
    emoji: "💍",
    color: "from-gold to-primary",
    previewText: "Happy Anniversary, My Love! 💍",
    bodyText:
      "Another year of us, another year of beautiful memories. You make my world complete. Here's to forever and beyond with you by my side.",
    bgGradient: "from-yellow-50 via-rose-50 to-pink-50",
  },
  {
    slug: "anniversary-parents",
    type: "anniversary",
    category: "parents",
    title: "Parents' Anniversary",
    description: "Celebrate your parents' love",
    emoji: "💞",
    color: "from-mint to-gold",
    previewText: "Happy Anniversary, Mom & Dad! 💞",
    bodyText:
      "Your love story is my favorite. Thank you for showing me what true love looks like. Wishing you many more years of happiness together.",
    bgGradient: "from-emerald-50 via-yellow-50 to-amber-50",
  },
  {
    slug: "sorry-gf",
    type: "sorry",
    category: "gf",
    title: "I'm Sorry",
    description: "A sincere apology to make things right",
    emoji: "🥺",
    color: "from-sky to-lavender",
    previewText: "I'm Truly Sorry 🥺",
    bodyText:
      "I know I messed up, and I'm so sorry for hurting you. You deserve the world, and I promise to do better. Please forgive me — my heart aches without your smile.",
    bgGradient: "from-blue-50 via-indigo-50 to-purple-50",
  },
  {
    slug: "sorry-friend",
    type: "sorry",
    category: "friend",
    title: "My Apologies",
    description: "Say sorry to your friend with sincerity",
    emoji: "😔",
    color: "from-mint to-lavender",
    previewText: "I Owe You An Apology 😔",
    bodyText:
      "Our friendship means the world to me, and I hate that I let you down. I'm truly sorry. Can we get past this? I miss our good times together.",
    bgGradient: "from-green-50 via-teal-50 to-cyan-50",
  },
  {
    slug: "missyou-gf",
    type: "missyou",
    category: "gf",
    title: "Missing You",
    description: "Let them know you're thinking of them",
    emoji: "💫",
    color: "from-primary to-accent",
    previewText: "I Miss You So Much 💫",
    bodyText:
      "Distance means nothing when someone means everything. Every second without you feels like an eternity. Can't wait to hold you close again.",
    bgGradient: "from-rose-50 via-purple-50 to-indigo-50",
  },
  {
    slug: "missyou-bestfriend",
    type: "missyou",
    category: "bestfriend",
    title: "Miss My Bestie",
    description: "Tell your best friend you miss them",
    emoji: "🫂",
    color: "from-gold to-secondary",
    previewText: "Missing My Bestie! 🫂",
    bodyText:
      "Life's just not the same without your crazy energy. Miss our midnight talks, random adventures, and uncontrollable laughter. Come back soon!",
    bgGradient: "from-yellow-50 via-amber-50 to-orange-50",
  },
];

async function seed() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("Connected to MongoDB");

    await Template.deleteMany({});
    console.log("Cleared existing templates");

    const result = await Template.insertMany(templates);
    console.log(`Seeded ${result.length} templates`);

    for (const t of result) {
      console.log(`  - ${t.slug}: ${t.title}`);
    }

    console.log("\nSeed completed successfully!");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
