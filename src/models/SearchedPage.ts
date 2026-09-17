import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: the current tab, the query text, which PAA rows have
 * been expanded, or how many reserve items have been appended. All of that is
 * session state on the client — `appendReserve` and `matchSuggestions` derive
 * it from the stored arrays.
 *
 * `resultCount` is stored as the pre-formatted string the contract asks for
 * ("8,47,000", Indian grouping via `groupIndian`) rather than as a number,
 * because the joke is the grouping and re-deriving it server-side would put a
 * second formatter in play.
 */
export const SEARCHED_LIMITS = {
  name: 80,
  /** A plain https URL. Uploaded media is turned into one before it gets here. */
  url: 2000,
  /** "meera.verma › my-life" — breadcrumb form, not a real URL. */
  breadcrumb: 200,
  title: 200,
  /** May contain <b> on matched terms; sanitised strictly at render time. */
  snippet: 400,
  /** "Ad · sponsored by me" */
  badge: 60,
  resultId: 64,
  suggestion: 160,
  didYouMean: 160,
  resultCount: 40,
  searchSeconds: 16,
  question: 240,
  answer: 600,
  factLabel: 80,
  factValue: 240,
  subtitle: 160,
  description: 800,
  quote: 400,
  caption: 200,
  /** One paragraph of a fake 2011 personal blog. */
  bodyLine: 1200,
  relatedSearch: 160,
  /** The key of an `alternateResults` bucket — a related-search string. */
  alternateKey: 160,
  // Counts
  maxAutocomplete: 8,
  maxResults: 12,
  maxPaa: 8,
  maxPaaReserve: 12,
  maxFacts: 10,
  maxAlsoSearchFor: 8,
  maxRelatedSearches: 10,
  maxImages: 12,
  maxPageBody: 12,
  /** Cheap by design: "2-3 results, no pages". */
  maxAlternateBuckets: 10,
  maxAlternateResults: 4,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  password: 128,
} as const;

export interface IFakePage {
  title: string;
  url: string;
  body: string[];
  imageUrl?: string;
}

export interface ISearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  /** Present → the result is clickable and opens a full fake page. */
  page?: IFakePage;
  badge?: string;
}

export interface IPaaItem {
  question: string;
  answer: string;
  source?: string;
}

export interface IKnowledgeFact {
  label: string;
  value: string;
}

export interface IKnowledgePanel {
  subtitle: string;
  description: string;
  facts: IKnowledgeFact[];
  quote?: string;
  /** Friends' names → generated initial-circles. No fetched avatars. */
  alsoSearchFor: string[];
}

export interface ISearchImage {
  url: string;
  caption?: string;
}

export interface ISearchedPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  sender: { name: string };
  recipient: { name: string; photoUrl: string };
  /** 5-6, funniest first. */
  autocomplete: string[];
  didYouMean: string;
  resultCount: string;
  searchSeconds: string;
  results: ISearchResult[];
  paa: IPaaItem[];
  /** Held back, appended two at a time as questions are expanded. */
  paaReserve: IPaaItem[];
  knowledgePanel: IKnowledgePanel;
  relatedSearches: string[];
  images: ISearchImage[];
  /**
   * Swapped in when a related search is tapped. Stored as a Map because the key
   * set is the sender's own related-search strings, not something this schema
   * can enumerate. The controller converts it back to a plain object on read —
   * `JSON.stringify` of a Map is `{}`, and the client coercer would then see
   * nothing.
   */
  alternateResults: Map<string, ISearchResult[]>;
  /**
   * Denormalised from `sender.name` / `recipient.name` by the pre-save hook
   * below. The dashboard queries in `share.controller` (`getMyCreations`,
   * `getReceivedPages`) read flat `senderName`/`recipientName` off every
   * template model; without these two a search page shows up as "Someone".
   */
  senderName: string;
  recipientName: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const fakePageSchema = new Schema<IFakePage>(
  {
    title: { type: String, default: "", maxlength: SEARCHED_LIMITS.title },
    url: { type: String, default: "", maxlength: SEARCHED_LIMITS.breadcrumb },
    body: { type: [String], default: [] },
    imageUrl: { type: String, maxlength: SEARCHED_LIMITS.url },
  },
  { _id: false }
);

const searchResultSchema = new Schema<ISearchResult>(
  {
    id: { type: String, default: "", maxlength: SEARCHED_LIMITS.resultId },
    title: { type: String, default: "", maxlength: SEARCHED_LIMITS.title },
    url: { type: String, default: "", maxlength: SEARCHED_LIMITS.breadcrumb },
    snippet: { type: String, default: "", maxlength: SEARCHED_LIMITS.snippet },
    page: { type: fakePageSchema },
    badge: { type: String, maxlength: SEARCHED_LIMITS.badge },
  },
  { _id: false }
);

const paaItemSchema = new Schema<IPaaItem>(
  {
    question: { type: String, default: "", maxlength: SEARCHED_LIMITS.question },
    answer: { type: String, default: "", maxlength: SEARCHED_LIMITS.answer },
    source: { type: String, maxlength: SEARCHED_LIMITS.breadcrumb },
  },
  { _id: false }
);

const knowledgeFactSchema = new Schema<IKnowledgeFact>(
  {
    label: { type: String, default: "", maxlength: SEARCHED_LIMITS.factLabel },
    value: { type: String, default: "", maxlength: SEARCHED_LIMITS.factValue },
  },
  { _id: false }
);

const knowledgePanelSchema = new Schema<IKnowledgePanel>(
  {
    subtitle: { type: String, default: "", maxlength: SEARCHED_LIMITS.subtitle },
    description: { type: String, default: "", maxlength: SEARCHED_LIMITS.description },
    facts: { type: [knowledgeFactSchema], default: [] },
    quote: { type: String, maxlength: SEARCHED_LIMITS.quote },
    alsoSearchFor: { type: [String], default: [] },
  },
  { _id: false }
);

const searchImageSchema = new Schema<ISearchImage>(
  {
    url: { type: String, default: "", maxlength: SEARCHED_LIMITS.url },
    caption: { type: String, maxlength: SEARCHED_LIMITS.caption },
  },
  { _id: false }
);

const searchedPageSchema = new Schema<ISearchedPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    sender: {
      type: new Schema<{ name: string }>(
        { name: { type: String, default: "", maxlength: SEARCHED_LIMITS.name } },
        { _id: false }
      ),
      default: () => ({}),
    },
    recipient: {
      type: new Schema<{ name: string; photoUrl: string }>(
        {
          name: { type: String, default: "", maxlength: SEARCHED_LIMITS.name },
          photoUrl: { type: String, default: "", maxlength: SEARCHED_LIMITS.url },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    autocomplete: { type: [String], default: [] },
    didYouMean: { type: String, default: "", maxlength: SEARCHED_LIMITS.didYouMean },
    resultCount: { type: String, default: "", maxlength: SEARCHED_LIMITS.resultCount },
    searchSeconds: { type: String, default: "", maxlength: SEARCHED_LIMITS.searchSeconds },
    results: { type: [searchResultSchema], default: [] },
    paa: { type: [paaItemSchema], default: [] },
    paaReserve: { type: [paaItemSchema], default: [] },
    knowledgePanel: { type: knowledgePanelSchema, default: () => ({}) },
    relatedSearches: { type: [String], default: [] },
    images: { type: [searchImageSchema], default: [] },
    alternateResults: { type: Map, of: [searchResultSchema], default: {} },
    // Denormalised for the dashboard. Written by the pre-save hook, never by a
    // caller — see the hook for why it is not done in the controller.
    senderName: { type: String, default: "", maxlength: SEARCHED_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: SEARCHED_LIMITS.name },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

searchedPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  // Denormalise the dashboard names in ONE place. Doing it in the create and
  // update handlers instead means two copies of the same rule, and update is
  // the one someone forgets — a renamed sender would keep their old dashboard
  // row forever with no visible error anywhere.
  this.senderName = (this.sender?.name ?? "").slice(0, SEARCHED_LIMITS.name);
  this.recipientName = (this.recipient?.name ?? "").slice(0, SEARCHED_LIMITS.name);
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

searchedPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) {
    await rememberPagePassword(this, trimmed);
    return true;
  }

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
  if (await bcrypt.compare(raw, this.password)) {
    await rememberPagePassword(this, raw);
    return true;
  }
  return false;
};

export default mongoose.model<ISearchedPage>("SearchedPage", searchedPageSchema);
