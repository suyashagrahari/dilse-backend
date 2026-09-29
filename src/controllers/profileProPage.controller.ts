import { Request, Response } from "express";
import ProfileProPage, {
  PROFILE_LIMITS,
  IProfileExperience,
  IProfileEducation,
  IProfileCertification,
  IProfileSkill,
  IRecommendation,
  IProfilePost,
  IProfileLanguage,
} from "../models/ProfileProPage";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import { transformMediaPayload } from "../services/mediaProcessor.service";
import { sanitizeLock, sanitizeLoveLetter, sanitizeLovePhotos, userPhotoFolder } from "../utils/loveMedia";

// ─── Endorsements — CRUD ─────────────────────────────────────────────────────
//
// The house pattern, with two rules of its own:
//
//   1. `person.connections` is never parsed. "1 connection" is the demo value.
//      `skills[].endorsements` is the only numeric field here and it is clamped
//      rather than trusted — a client that posts 1e9 endorsements would render a
//      number wider than the card.
//
//   2. A recommendation's `status` is NEVER taken from the request body. The
//      only way a reference about a real person becomes visible is through the
//      moderation queue, which writes it here after the owner taps approve.
//      Accepting a client-supplied status would make the whole gate decorative.

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const clampInt = (v: unknown, min: number, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.min(max, Math.max(min, n));
};

const sanitizeLines = (raw: unknown, maxItems: number, maxChars: number): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, maxItems)
    .map((l) => str(l, maxChars).trim())
    .filter((l) => l.length > 0);
};

const sanitizePerson = (raw: unknown) => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, PROFILE_LIMITS.name).trim(),
    headline: str(s.headline, PROFILE_LIMITS.headline).trim(),
    location: str(s.location, PROFILE_LIMITS.location).trim(),
    photoUrl: str(s.photoUrl, PROFILE_LIMITS.url).trim(),
    bannerUrl: str(s.bannerUrl, PROFILE_LIMITS.url).trim(),
    // String in, string out. See the header note.
    connections: str(s.connections, PROFILE_LIMITS.connections).trim(),
    degreeNote: str(s.degreeNote, PROFILE_LIMITS.degreeNote).trim(),
    openTo: str(s.openTo, PROFILE_LIMITS.openTo).trim(),
    ...crops(s),
  };
};

const cropNum = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? undefined : Math.min(max, Math.max(min, Math.round(n)));
};

/** Framing of the photo and banner. Only the keys that were sent come back. */
const crops = (s: Record<string, unknown>) => {
  const out: Record<string, number> = {};
  for (const k of ["photoCropX", "photoCropY", "bannerCropX", "bannerCropY"] as const) {
    const n = cropNum(s[k], 0, 100);
    if (n !== undefined) out[k] = n;
  }
  for (const k of ["photoScale", "bannerScale"] as const) {
    const n = cropNum(s[k], 100, 300);
    if (n !== undefined) out[k] = n;
  }
  return out;
};

const sanitizePosts = (raw: unknown): IProfilePost[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PROFILE_LIMITS.maxPosts)
    .map((p, i) => {
      const s = (p ?? {}) as Record<string, unknown>;
      return {
        id: str(s.id, 64).trim() || `post-${i}`,
        text: str(s.text, PROFILE_LIMITS.post).trim(),
        ago: str(s.ago, PROFILE_LIMITS.ago).trim(),
      };
    })
    .filter((p) => p.text.length > 0);
};

const sanitizeLanguages = (raw: unknown): IProfileLanguage[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PROFILE_LIMITS.maxLanguages)
    .map((l) => {
      const s = (l ?? {}) as Record<string, unknown>;
      return { name: str(s.name, PROFILE_LIMITS.language).trim(), level: str(s.level, PROFILE_LIMITS.level).trim() };
    })
    .filter((l) => l.name.length > 0);
};

const sanitizeExperience = (raw: unknown): IProfileExperience[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PROFILE_LIMITS.maxExperience)
    .map((e) => {
      const s = (e ?? {}) as Record<string, unknown>;
      return {
        role: str(s.role, PROFILE_LIMITS.role).trim(),
        company: str(s.company, PROFILE_LIMITS.company).trim(),
        type: str(s.type, PROFILE_LIMITS.type).trim(),
        duration: str(s.duration, PROFILE_LIMITS.duration).trim(),
        location: str(s.location, PROFILE_LIMITS.location).trim(),
        logoUrl: str(s.logoUrl, PROFILE_LIMITS.url).trim(),
        bullets: sanitizeLines(s.bullets, PROFILE_LIMITS.maxBullets, PROFILE_LIMITS.bullet),
      } as IProfileExperience;
    })
    // An entry with no role is an empty card with a logo in it.
    .filter((e) => e.role.length > 0 || e.company.length > 0);
};

const sanitizeEducation = (raw: unknown): IProfileEducation[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PROFILE_LIMITS.maxEducation)
    .map((e) => {
      const s = (e ?? {}) as Record<string, unknown>;
      return {
        school: str(s.school, PROFILE_LIMITS.school).trim(),
        degree: str(s.degree, PROFILE_LIMITS.degree).trim(),
        years: str(s.years, PROFILE_LIMITS.years).trim(),
        note: str(s.note, PROFILE_LIMITS.note).trim(),
      } as IProfileEducation;
    })
    .filter((e) => e.school.length > 0);
};

const sanitizeCertifications = (raw: unknown): IProfileCertification[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PROFILE_LIMITS.maxCertifications)
    .map((c) => {
      const s = (c ?? {}) as Record<string, unknown>;
      return {
        name: str(s.name, PROFILE_LIMITS.certName).trim(),
        issuer: str(s.issuer, PROFILE_LIMITS.issuer).trim(),
        date: str(s.date, PROFILE_LIMITS.date).trim(),
      } as IProfileCertification;
    })
    .filter((c) => c.name.length > 0);
};

const sanitizeSkills = (raw: unknown): IProfileSkill[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PROFILE_LIMITS.maxSkills)
    .map((k, i) => {
      const s = (k ?? {}) as Record<string, unknown>;
      const label = str(s.label, PROFILE_LIMITS.skillLabel).trim();
      return {
        // A skill without a stable id cannot be endorsed — the endorse flow
        // addresses skills by id, so fall back to the index rather than "".
        id: str(s.id, 64).trim() || `skill-${i}`,
        label,
        endorsements: clampInt(s.endorsements, 0, PROFILE_LIMITS.endorsementsMax),
        topEndorsers: sanitizeLines(s.topEndorsers, PROFILE_LIMITS.maxEndorsers, PROFILE_LIMITS.name),
        isTop3: s.isTop3 === true,
      } as IProfileSkill;
    })
    .filter((k) => k.label.length > 0);
};

/**
 * Recommendations, with `status` deliberately NOT read from the body.
 *
 * An existing row keeps whatever status the moderation queue last wrote; a row
 * the owner is adding by hand through the edit sheet is theirs already, so it
 * arrives published. What a client cannot do is hand us a "published" row that
 * never passed a human.
 */
const sanitizeRecommendations = (raw: unknown, existing: IRecommendation[]): IRecommendation[] => {
  if (!Array.isArray(raw)) return [];
  const priorById = new Map(existing.map((r) => [r.id, r]));
  return raw
    .slice(0, PROFILE_LIMITS.maxRecommendations)
    .map((r, i) => {
      const s = (r ?? {}) as Record<string, unknown>;
      const id = str(s.id, 64).trim() || `rec-${i}`;
      const prior = priorById.get(id);
      return {
        id,
        author: str(s.author, PROFILE_LIMITS.name).trim(),
        authorHeadline: str(s.authorHeadline, PROFILE_LIMITS.headline).trim(),
        relationship: str(s.relationship, PROFILE_LIMITS.relationship).trim(),
        text: str(s.text, PROFILE_LIMITS.recText).trim(),
        ago: str(s.ago, PROFILE_LIMITS.date).trim(),
        status: prior ? prior.status : "published",
      } as IRecommendation;
    })
    .filter((r) => r.text.length > 0 || r.author.length > 0);
};

type ProfileBody = {
  person?: unknown;
  about?: unknown;
  experience?: unknown;
  education?: unknown;
  skills?: unknown;
  recommendations?: unknown;
  certifications?: unknown;
  contributorPrompt?: unknown;
  contributorsEnabled?: unknown;
  password?: unknown;
  senderName?: unknown;
  photos?: unknown;
  posts?: unknown;
  languages?: unknown;
  letter?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
};

export const createProfileProPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body || {}, { template: "profile-pro", userId: req.userId })) as ProfileBody;

    const page = await ProfileProPage.create({
      userId: req.userId,
      person: sanitizePerson(b.person),
      about: sanitizeLines(b.about, PROFILE_LIMITS.maxAbout, PROFILE_LIMITS.aboutLine),
      experience: sanitizeExperience(b.experience),
      education: sanitizeEducation(b.education),
      skills: sanitizeSkills(b.skills),
      recommendations: sanitizeRecommendations(b.recommendations, []),
      certifications: sanitizeCertifications(b.certifications),
      contributorPrompt: str(b.contributorPrompt, PROFILE_LIMITS.prompt).trim(),
      contributorsEnabled: b.contributorsEnabled !== false,
      senderName: str(b.senderName, PROFILE_LIMITS.name).trim(),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("profile-pro", req.userId)),
      posts: sanitizePosts(b.posts),
      languages: sanitizeLanguages(b.languages),
      letter: sanitizeLoveLetter(b.letter),
      ...sanitizeLock(b),
      password: str(b.password, PROFILE_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create profile-pro page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyProfileProPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ProfileProPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my profile-pro pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getProfileProPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProfileProPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get profile-pro page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateProfileProPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body || {}, { template: "profile-pro", userId: req.userId })) as ProfileBody;

    const page = await ProfileProPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.person            !== undefined) page.person            = sanitizePerson(b.person);
    if (b.about             !== undefined) page.about             = sanitizeLines(b.about, PROFILE_LIMITS.maxAbout, PROFILE_LIMITS.aboutLine);
    if (b.experience        !== undefined) page.experience        = sanitizeExperience(b.experience);
    if (b.education         !== undefined) page.education         = sanitizeEducation(b.education);
    if (b.skills            !== undefined) page.skills            = sanitizeSkills(b.skills);
    if (b.recommendations   !== undefined) page.recommendations   = sanitizeRecommendations(b.recommendations, page.recommendations || []);
    if (b.certifications    !== undefined) page.certifications    = sanitizeCertifications(b.certifications);
    if (b.contributorPrompt !== undefined) page.contributorPrompt = str(b.contributorPrompt, PROFILE_LIMITS.prompt).trim();
    if (b.contributorsEnabled !== undefined) page.contributorsEnabled = b.contributorsEnabled !== false;
    if (b.senderName        !== undefined) page.senderName        = str(b.senderName, PROFILE_LIMITS.name).trim();
    if (b.photos            !== undefined) page.photos            = await sanitizeLovePhotos(b.photos, userPhotoFolder("profile-pro", req.userId));
    if (b.posts             !== undefined) page.posts             = sanitizePosts(b.posts);
    if (b.languages         !== undefined) page.languages         = sanitizeLanguages(b.languages);
    if (b.letter            !== undefined) page.letter            = sanitizeLoveLetter(b.letter);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock(b);
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, PROFILE_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, PROFILE_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update profile-pro page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishProfileProPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProfileProPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "profile-pro",
      pageId: String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });

    if (!gate.allowed) {
      res.status(gate.httpStatus).json({ success: false, error: gate.error, pricing: gate.pricing });
      return;
    }

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    res.json({
      success: true,
      data: { shareId: page.shareId, shareUrl, contribToken: page.contribToken },
    });
  } catch (error) {
    console.error("Publish profile-pro page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedProfileProPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProfileProPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject() as unknown as Record<string, unknown>;
    // The recipient gets the page, never the two secrets. `contribToken` is
    // withheld even though the reader is the intended recipient: it is the
    // WRITE capability, and handing it out here would let the gift's audience
    // post as contributors.
    const {
      password: _pw,
      passwordRaw: _pr,
      contribToken: _ct,
      ...safeData
    } = pageObj;

    // Only approved references reach the recipient. The pending ones are the
    // sender's business and nobody else's.
    const recs = Array.isArray(safeData.recommendations)
      ? (safeData.recommendations as IRecommendation[]).filter((r) => r.status === "published")
      : [];
    safeData.recommendations = recs;

    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "profile-pro" });
  } catch (error) {
    console.error("Get shared profile-pro page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyProfileProPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ProfileProPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify profile-pro page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteProfileProPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProfileProPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete profile-pro page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
