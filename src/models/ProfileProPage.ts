import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// ─── Endorsements — a relationship as a career profile ───────────────────────
//
// Two things in this file are load-bearing and neither is obvious:
//
//   1. `person.connections` is a STRING. The demo value is "1 connection" and a
//      sender may write "1 (he counts twice)". Nothing may Number() it. The only
//      real number on this page is `skills[].endorsements`, because that one is
//      counted rather than written.
//
//   2. `contribToken` is a DIFFERENT SECRET from `shareId`, on purpose.
//      `shareId` is a READ capability handed to the one person the page is for.
//      `contribToken` is a WRITE capability handed to a group chat. If they were
//      the same value, everyone invited to endorse could also open the gift, and
//      the sender could never stop collecting endorsements without also breaking
//      the recipient's link. One of those is a privacy question and the other is
//      a moderation question; they must not share a kill switch.

export const PROFILE_LIMITS = {
  maxAbout: 8,
  maxExperience: 8,
  maxBullets: 6,
  maxEducation: 5,
  maxSkills: 20,
  maxEndorsers: 12,
  maxRecommendations: 20,
  maxCertifications: 8,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  name: 60,
  headline: 120,
  location: 80,
  connections: 40,
  degreeNote: 24,
  openTo: 120,
  url: 2000,
  aboutLine: 600,
  role: 80,
  company: 80,
  type: 40,
  duration: 60,
  bullet: 240,
  school: 120,
  degree: 120,
  years: 40,
  note: 240,
  skillLabel: 60,
  certName: 120,
  issuer: 80,
  date: 40,
  relationship: 160,
  recText: 600,
  prompt: 240,
  password: 128,
  endorsementsMax: 100000,
} as const;

/**
 * Nothing is visible to the recipient until the sender says so. Both
 * contribution lanes land as "pending" — a one-tap endorsement and a written
 * reference alike — because this link goes to a group chat and the page is
 * about a real person.
 */
export type RecommendationStatus = "pending" | "published";

export interface IProfilePerson {
  name: string;
  headline: string;
  location: string;
  photoUrl: string;
  bannerUrl: string;
  /** STRING. "1 connection". Never parsed. See the header of this file. */
  connections: string;
  degreeNote: string;
  openTo: string;
}

export interface IProfileExperience {
  role: string;
  company: string;
  type: string;
  duration: string;
  location: string;
  logoUrl: string;
  bullets: string[];
}

export interface IProfileEducation {
  school: string;
  degree: string;
  years: string;
  note: string;
}

export interface IProfileCertification {
  name: string;
  issuer: string;
  date: string;
}

/**
 * A skill and its count.
 *
 * `endorsements` is a real Number — it is the one thing on this page that is
 * counted rather than written, and the joke depends on "Being Right (47)"
 * sitting in the same deadpan row as "Punctuality (2)".
 */
export interface IProfileSkill {
  id: string;
  label: string;
  endorsements: number;
  /** Names behind the overlapping avatars. Display only. */
  topEndorsers: string[];
  isTop3: boolean;
}

export interface IRecommendation {
  id: string;
  author: string;
  authorHeadline: string;
  relationship: string;
  text: string;
  ago: string;
  status: RecommendationStatus;
}

export interface IProfileProPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The friends' write link. A different secret from shareId, on purpose. */
  contribToken: string;
  person: IProfilePerson;
  about: string[];
  experience: IProfileExperience[];
  education: IProfileEducation[];
  skills: IProfileSkill[];
  recommendations: IRecommendation[];
  certifications: IProfileCertification[];
  contributorPrompt: string;
  /** Owner switch for both contribution lanes on the shared page. */
  contributorsEnabled: boolean;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const personSchema = new Schema<IProfilePerson>(
  {
    name: { type: String, default: "", maxlength: PROFILE_LIMITS.name },
    headline: { type: String, default: "", maxlength: PROFILE_LIMITS.headline },
    location: { type: String, default: "", maxlength: PROFILE_LIMITS.location },
    photoUrl: { type: String, default: "", maxlength: PROFILE_LIMITS.url },
    bannerUrl: { type: String, default: "", maxlength: PROFILE_LIMITS.url },
    // String. No numeric cast — "1 connection" has to survive a round trip.
    connections: { type: String, default: "", maxlength: PROFILE_LIMITS.connections },
    degreeNote: { type: String, default: "", maxlength: PROFILE_LIMITS.degreeNote },
    openTo: { type: String, default: "", maxlength: PROFILE_LIMITS.openTo },
  },
  { _id: false }
);

const experienceSchema = new Schema<IProfileExperience>(
  {
    role: { type: String, default: "", maxlength: PROFILE_LIMITS.role },
    company: { type: String, default: "", maxlength: PROFILE_LIMITS.company },
    type: { type: String, default: "", maxlength: PROFILE_LIMITS.type },
    duration: { type: String, default: "", maxlength: PROFILE_LIMITS.duration },
    location: { type: String, default: "", maxlength: PROFILE_LIMITS.location },
    logoUrl: { type: String, default: "", maxlength: PROFILE_LIMITS.url },
    bullets: { type: [String], default: [] },
  },
  { _id: false }
);

const educationSchema = new Schema<IProfileEducation>(
  {
    school: { type: String, default: "", maxlength: PROFILE_LIMITS.school },
    degree: { type: String, default: "", maxlength: PROFILE_LIMITS.degree },
    years: { type: String, default: "", maxlength: PROFILE_LIMITS.years },
    note: { type: String, default: "", maxlength: PROFILE_LIMITS.note },
  },
  { _id: false }
);

const certificationSchema = new Schema<IProfileCertification>(
  {
    name: { type: String, default: "", maxlength: PROFILE_LIMITS.certName },
    issuer: { type: String, default: "", maxlength: PROFILE_LIMITS.issuer },
    date: { type: String, default: "", maxlength: PROFILE_LIMITS.date },
  },
  { _id: false }
);

const skillSchema = new Schema<IProfileSkill>(
  {
    id: { type: String, default: "", maxlength: 64 },
    label: { type: String, default: "", maxlength: PROFILE_LIMITS.skillLabel },
    // The one honest number on the page.
    endorsements: { type: Number, default: 0, min: 0, max: PROFILE_LIMITS.endorsementsMax },
    topEndorsers: { type: [String], default: [] },
    isTop3: { type: Boolean, default: false },
  },
  { _id: false }
);

const recommendationSchema = new Schema<IRecommendation>(
  {
    id: { type: String, default: "", maxlength: 64 },
    author: { type: String, default: "", maxlength: PROFILE_LIMITS.name },
    authorHeadline: { type: String, default: "", maxlength: PROFILE_LIMITS.headline },
    relationship: { type: String, default: "", maxlength: PROFILE_LIMITS.relationship },
    text: { type: String, default: "", maxlength: PROFILE_LIMITS.recText },
    ago: { type: String, default: "", maxlength: PROFILE_LIMITS.date },
    // Unknown values fail closed to "pending" — an unmoderated reference about a
    // real person must never default its way onto the recipient's page.
    status: { type: String, enum: ["pending", "published"], default: "pending" },
  },
  { _id: false }
);

const profileProPageSchema = new Schema<IProfileProPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    contribToken: { type: String, unique: true, sparse: true, index: true },
    person: { type: personSchema, default: () => ({}) },
    about: { type: [String], default: [] },
    experience: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    skills: { type: [skillSchema], default: [] },
    recommendations: { type: [recommendationSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] },
    contributorPrompt: { type: String, default: "", maxlength: PROFILE_LIMITS.prompt },
    contributorsEnabled: { type: Boolean, default: true },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

profileProPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (!this.contribToken) this.contribToken = randomUUID();
  if (this.isModified("password") && this.password) {
    // ── Trim before hashing ──────────────────────────────────────────────────
    //
    // Senders type a trailing space constantly — a phone keyboard offers one
    // after every word, and a pasted password brings its own. Every
    // recipient-side viewer trims what it sends. So without this, a page stored
    // with "sunflower " can never be opened by anyone typing "sunflower": the
    // password is correct and the page still will not open, which is exactly
    // what it looked like from the outside.
    //
    // Trimming HERE and not in 43 controllers because this is the one point
    // where a password becomes a hash. Anything that assigns and saves is
    // covered, including paths nobody has written yet.
    const trimmed = this.password.trim();

    if (!trimmed) {
      // Whitespace only is not a password. Hashing "" would leave a page that
      // reports itself protected and opens for nobody.
      this.password = "";
      this.passwordRaw = "";
    } else {
      this.passwordRaw = trimmed;
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(trimmed, salt);
    }
  }
  next();
});

profileProPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) return true;

  // ── THEN EXACTLY AS TYPED, FOR PAGES OLDER THAN THAT FIX ──────────────────
  //
  // A page published before passwords were trimmed hashed the string WITH its
  // whitespace — "sunflower " — because no builder trimmed and every phone
  // keyboard offers a space after a word. Trimming the candidate here is what
  // then took away the only key that opened it: the sender's own password
  // stopped working on their own page, and so did the trimmed version. There
  // was no string the recipient could type.
  //
  // scripts/repair-page-passwords.js re-hashes those rows from `passwordRaw`,
  // but it needs someone to run it against production, and a row whose
  // passwordRaw is missing cannot be repaired at all. This costs one extra
  // comparison and needs nobody to remember anything.
  //
  // Skipped when the two strings are equal, so an ordinary wrong password is
  // still exactly one bcrypt comparison.
  if (raw === trimmed) return false;
  return bcrypt.compare(raw, this.password);
};

export default mongoose.model<IProfileProPage>("ProfileProPage", profileProPageSchema);
