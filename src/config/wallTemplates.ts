// ─── Wall template registry ──────────────────────────────────────────────────
//
// Which templates may appear on the public Wall, and where their two names live.
//
// ── WHY THIS IS A SEPARATE LIST AND NOT "ALL TEMPLATES" ──────────────────────
//
// A Wall card says one sentence: "<Creator> made this for <Recipient>". A
// template can only be on the Wall if it actually holds two people's names at
// the top level of its document. Roughly a dozen do not:
//
//   product, watch, call*, recharge, challan, train-ticket, court-marriage
//       names are nested inside sub-documents (parties[0].name, subscriber.name,
//       passengers[].name). Reachable, but a nested path is a silent breakage
//       waiting to happen the next time that sub-schema is reshaped.
//   app, profile-pro, nutrition, kundli-milan
//       genuinely single-subject pages. There is no second person to name.
//
// Those templates are simply not Wall-eligible: no consent checkbox is offered
// for them, and nothing about them ever reaches the Wall. The alternative —
// inventing a second name, or showing a card with one half of the sentence
// blank — is the thing this whole feature is built to avoid.
//
// (* call DOES have sender/recipient at the top level and IS included.)
//
// ── PAIRING ─────────────────────────────────────────────────────────────────
//
// Not every pair is "one person made this for another". A wedding invitation
// names a couple, and "Arjun made this for Priya" would misdescribe it. Those
// templates use `pairing: "and"` and read "Arjun & Priya" instead.

import mongoose from "mongoose";

import BirthdayPage from "../models/BirthdayPage";
import ValentinePage from "../models/ValentinePage";
import HoliPage from "../models/HoliPage";
import EidPage from "../models/EidPage";
import WeddingPage from "../models/WeddingPage";
import ReceptionPage from "../models/ReceptionPage";
import ShaadiCardPage from "../models/ShaadiCardPage";
import ChristianWeddingPage from "../models/ChristianWeddingPage";
import LoveGfPage from "../models/LoveGfPage";
import DarlingPage from "../models/DarlingPage";
import BirthdayGfPage from "../models/BirthdayGfPage";
import ApologyDashboardPage from "../models/ApologyDashboardPage";
import MissYouGfPage from "../models/MissYouGfPage";
import BouquetGfPage from "../models/BouquetGfPage";
import CourtOfLovePage from "../models/CourtOfLovePage";
import ProposalPage from "../models/ProposalPage";
import HoldMyHandPage from "../models/HoldMyHandPage";
import LegalNoticePage from "../models/LegalNoticePage";
import VendingMachinePage from "../models/VendingMachinePage";
import CatchPage from "../models/CatchPage";
import FlagsPage from "../models/FlagsPage";
import DateInvitationPage from "../models/DateInvitationPage";
import PhotoPuzzlePage from "../models/PhotoPuzzlePage";
import LoveflixPage from "../models/LoveflixPage";
import RewindPage from "../models/RewindPage";
import StreakPage from "../models/StreakPage";
import DedicationPage from "../models/DedicationPage";
import SearchedPage from "../models/SearchedPage";
import CapsulePage from "../models/CapsulePage";
import UsPage from "../models/UsPage";
import CallPage from "../models/CallPage";

/** How the two names read together on a card. */
export type Pairing = "for" | "and";

export interface WallTemplate {
  /** Stable key stored on every WallEntry. Matches share.controller's templateType. */
  templateType: string;
  /** Human label printed on the card chip, e.g. "Court of Love". */
  label: string;
  /**
   * The client route that builds this template, without the leading slash.
   * Doubles as the key the client uses to look up the template's own palette,
   * and as the `/wall/<slug>` filter segment.
   */
  slug: string;
  /** The `/api/<segment>` this template's pages are mounted under. */
  apiSegment: string;
  model: mongoose.Model<unknown>;
  /** Document field holding the person who made the page. */
  creatorField: string;
  /** Document field holding the person it was made for. */
  recipientField: string;
  pairing: Pairing;
}

export const WALL_TEMPLATES: WallTemplate[] = [
  // ── The common shape: senderName → recipientName ───────────────────────────
  t("birthday",           "Birthday",           "birthday-gf",        "birthday-pages",           BirthdayPage),
  t("birthday-gf",        "Birthday",           "birthday-gf",        "birthday-gf-pages",        BirthdayGfPage),
  t("valentine",          "Valentine",          "valentine-gf",       "valentine-pages",          ValentinePage),
  t("holi",               "Holi",               "holi",               "holi-pages",               HoliPage),
  t("eid",                "Eid Mubarak",        "eid-mubarak",        "eid-pages",                EidPage),
  t("love-gf",            "Love You Forever",   "love-gf",            "love-gf-pages",            LoveGfPage),
  t("darling",            "My Darling",         "darling",            "darling-pages",            DarlingPage),
  t("apology-dashboard",  "Apology",            "apology-dashboard",  "apology-dashboard-pages",  ApologyDashboardPage),
  t("missyou-gf",         "Miss You",           "missyou-gf",         "missyou-gf-pages",         MissYouGfPage),
  t("bouquet-gf",         "Bouquet",            "bouquet-gf",         "bouquet-gf-pages",         BouquetGfPage),
  t("proposal",           "Proposal",           "proposal",           "proposal-pages",           ProposalPage),
  t("hold-my-hand",       "Hold My Hand",       "hold-my-hand",       "hold-my-hand-pages",       HoldMyHandPage),
  t("vending-machine",    "Vending Machine",    "vending-machine",    "vending-machine-pages",    VendingMachinePage),
  t("catch",              "Catch",              "catch",              "catch-pages",              CatchPage),
  t("date-invitation",    "Date Invitation",    "date-invitation",    "date-invitation-pages",    DateInvitationPage),
  t("photo-puzzle",       "Photo Puzzle",       "photo-puzzle",       "photo-puzzle-pages",       PhotoPuzzlePage),
  t("loveflix",           "Loveflix",           "loveflix",           "loveflix-pages",           LoveflixPage),
  t("rewind",             "Rewind",             "rewind",             "rewind-pages",             RewindPage),
  t("streak",             "Streak",             "streak",             "streak-pages",             StreakPage),
  t("dedication",         "Dedication",         "dedication",         "dedication-pages",         DedicationPage),
  t("searched",           "Searched",           "searched",           "searched-pages",           SearchedPage),
  t("capsule",            "Time Capsule",       "capsule",            "capsule-pages",            CapsulePage),
  t("us",                 "Us",                 "us",                 "us-pages",                 UsPage),
  t("call",               "Incoming Call",      "call",               "call-pages",               CallPage),

  // ── Templates that name their two people differently ──────────────────────
  {
    templateType: "court-of-love", label: "Court of Love", slug: "court-of-love",
    apiSegment: "court-of-love-pages", model: CourtOfLovePage as mongoose.Model<unknown>,
    creatorField: "plaintiffName", recipientField: "accusedName", pairing: "for",
  },
  {
    templateType: "legal-notice", label: "Legal Notice", slug: "legal-notice",
    apiSegment: "legal-notice-pages", model: LegalNoticePage as mongoose.Model<unknown>,
    creatorField: "senderName", recipientField: "addresseeName", pairing: "for",
  },
  {
    // `name` here is the sender — see FLAGS_LIMITS.senderName on the field.
    templateType: "flags", label: "Green Flags", slug: "flags",
    apiSegment: "flags-pages", model: FlagsPage as mongoose.Model<unknown>,
    creatorField: "name", recipientField: "recipientName", pairing: "for",
  },

  // ── Couples, not sender→recipient. These read "A & B". ────────────────────
  pair("wedding",           "Wedding Invitation",  "wedding-shaadi",     "wedding-pages",             WeddingPage),
  pair("reception",         "Reception",           "reception",          "reception-pages",           ReceptionPage),
  pair("shaadi",            "Shaadi Card",         "shaadi-card",        "shaadi-card-pages",         ShaadiCardPage),
  pair("christian-wedding", "Christian Wedding",   "christian-wedding",  "christian-wedding-pages",   ChristianWeddingPage),
];

/** The overwhelmingly common shape, written once. */
function t(
  templateType: string, label: string, slug: string,
  apiSegment: string, model: mongoose.Model<never> | unknown
): WallTemplate {
  return {
    templateType, label, slug, apiSegment,
    model: model as mongoose.Model<unknown>,
    creatorField: "senderName", recipientField: "recipientName", pairing: "for",
  };
}

/** A couple's card: groom and bride, joined with "&". */
function pair(
  templateType: string, label: string, slug: string,
  apiSegment: string, model: mongoose.Model<never> | unknown
): WallTemplate {
  return {
    templateType, label, slug, apiSegment,
    model: model as mongoose.Model<unknown>,
    creatorField: "groomName", recipientField: "brideName", pairing: "and",
  };
}

const BY_TYPE = new Map(WALL_TEMPLATES.map((w) => [w.templateType, w]));
const BY_SEGMENT = new Map(WALL_TEMPLATES.map((w) => [w.apiSegment, w]));

export const wallTemplateByType = (type: string): WallTemplate | undefined => BY_TYPE.get(type);
export const wallTemplateBySegment = (segment: string): WallTemplate | undefined => BY_SEGMENT.get(segment);

/**
 * Every templateType that lives under one slug.
 *
 * Deliberately a list, not a lookup: `birthday` and `birthday-gf` are two
 * collections behind one builder at /birthday-gf, so a filter keyed on the slug
 * has to match both or half the birthday entries silently vanish from their own
 * filtered page while still being counted on the index.
 */
export function wallTypesForSlug(slug: string): string[] {
  return WALL_TEMPLATES.filter((w) => w.slug === slug).map((w) => w.templateType);
}

/** The display label for a slug (the first template that claims it). */
export function wallLabelForSlug(slug: string): string | undefined {
  return WALL_TEMPLATES.find((w) => w.slug === slug)?.label;
}

/** Every eligible slug — used by the client to pre-render one page per filter. */
export const WALL_SLUGS: string[] = [...new Set(WALL_TEMPLATES.map((w) => w.slug))];
