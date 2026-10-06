import { Request, Response } from "express";
import { randomBytes } from "crypto";
import ApologyDashboardPage from "../models/ApologyDashboardPage";
import User from "../models/User";
import { transformMediaPayload, uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { generateApologyPdf } from "../services/apologyPdf.service";
import { sendApologyAgreementEmail } from "../utils/mailer";

export const createApologyDashboardPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { senderName, recipientName, relationship, headline, subMessage, sorryLetter,
            senderPhoto, whackFaces, voiceUrl, scratchSecret, scratchImages, scratchVoice,
            briberyItems, timeline, deliveryEmail, sharePhoto, backgroundMusic, password } = req.body;

    const payload = await transformMediaPayload(
      {
        senderName:    senderName    || "",
        recipientName: recipientName || "",
        relationship:  relationship  || "girlfriend",
        headline:      headline      || "",
        subMessage:    subMessage    || "",
        sorryLetter:   sorryLetter   || "",
        senderPhoto:   senderPhoto   || "",
        whackFaces:    whackFaces    || [],
        voiceUrl:      voiceUrl      || "",
        scratchSecret: scratchSecret || "",
        scratchImages: scratchImages || [],
        scratchVoice:  scratchVoice  || "",
        briberyItems:  briberyItems  || [],
        timeline:      timeline      || [],
        deliveryEmail: deliveryEmail || "",
        sharePhoto:    sharePhoto    || "",
        backgroundMusic: backgroundMusic || "",
        password:      password      || "",
      },
      { template: "apology-dashboard", userId: req.userId }
    );

    const page = await ApologyDashboardPage.create({ userId: req.userId, ...payload });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create apology dashboard page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyApologyDashboardPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ApologyDashboardPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my apology dashboard pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getApologyDashboardPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ApologyDashboardPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
      pageObj.shareUrl = shareUrl;
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get apology dashboard page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

type ApologyDashboardUpdateBody = {
  senderName?: string;
  recipientName?: string;
  relationship?: string;
  headline?: string;
  subMessage?: string;
  sorryLetter?: string;
  senderPhoto?: string;
  whackFaces?: string[];
  voiceUrl?: string;
  scratchSecret?: string;
  scratchImages?: string[];
  scratchVoice?: string;
  briberyItems?: import("../models/ApologyDashboardPage").IBriberyItem[];
  timeline?: import("../models/ApologyDashboardPage").ITimelineItem[];
  deliveryEmail?: string;
  sharePhoto?: string;
  backgroundMusic?: string;
  password?: string;
};

export const updateApologyDashboardPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as ApologyDashboardUpdateBody;

    const page = await ApologyDashboardPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const payload = await transformMediaPayload(
      {
        senderName: b.senderName,
        recipientName: b.recipientName,
        relationship: b.relationship,
        headline: b.headline,
        subMessage: b.subMessage,
        sorryLetter: b.sorryLetter,
        senderPhoto: b.senderPhoto,
        whackFaces: Array.isArray(b.whackFaces) ? b.whackFaces : undefined,
        voiceUrl: b.voiceUrl,
        scratchSecret: b.scratchSecret,
        scratchImages: Array.isArray(b.scratchImages) ? b.scratchImages : undefined,
        scratchVoice: b.scratchVoice,
        briberyItems: Array.isArray(b.briberyItems) ? b.briberyItems : undefined,
        timeline: Array.isArray(b.timeline) ? b.timeline : undefined,
        deliveryEmail: b.deliveryEmail,
        sharePhoto: b.sharePhoto,
        backgroundMusic: b.backgroundMusic,
        password: b.password,
      },
      { template: "apology-dashboard", userId: req.userId }
    );

    if (payload.senderName    !== undefined) page.senderName    = payload.senderName;
    if (payload.recipientName !== undefined) page.recipientName = payload.recipientName;
    if (payload.relationship  !== undefined) page.relationship  = payload.relationship;
    if (payload.headline      !== undefined) page.headline      = payload.headline;
    if (payload.subMessage    !== undefined) page.subMessage    = payload.subMessage;
    if (payload.sorryLetter   !== undefined) page.sorryLetter   = payload.sorryLetter;
    if (payload.senderPhoto   !== undefined) page.senderPhoto   = payload.senderPhoto;
    if (payload.whackFaces    !== undefined) page.whackFaces    = payload.whackFaces;
    if (payload.voiceUrl      !== undefined) page.voiceUrl      = payload.voiceUrl;
    if (payload.scratchSecret !== undefined) page.scratchSecret = payload.scratchSecret;
    if (payload.scratchImages !== undefined) page.scratchImages = payload.scratchImages;
    if (payload.scratchVoice  !== undefined) page.scratchVoice  = payload.scratchVoice;
    if (payload.briberyItems  !== undefined) page.briberyItems  = payload.briberyItems;
    if (payload.timeline      !== undefined) page.timeline      = payload.timeline;
    if (payload.deliveryEmail !== undefined) page.deliveryEmail = payload.deliveryEmail;
    if (payload.sharePhoto    !== undefined) page.sharePhoto    = String(payload.sharePhoto ?? "");
    if (payload.backgroundMusic !== undefined) page.backgroundMusic = String(payload.backgroundMusic ?? "");
    if (payload.password !== undefined && payload.password !== "") page.password = payload.password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update apology dashboard page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishApologyDashboardPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ApologyDashboardPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "apology-dashboard",
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
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish apology dashboard page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedApologyDashboardPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ApologyDashboardPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "apology-dashboard" });
  } catch (error) {
    console.error("Get shared apology dashboard page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyApologyDashboardPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ApologyDashboardPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify apology dashboard page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

// ── Public: sign the apology agreement ──────────────────────────────────────────
export const signApologyAgreement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { signerName, signerEmail, signatureImage, acceptedPromises } = req.body as {
      signerName?: string;
      signerEmail?: string;
      signatureImage?: string;
      acceptedPromises?: string[];
    };

    if (!signerName?.trim()) {
      res.status(400).json({ success: false, error: "Signer name is required" });
      return;
    }

    const page = await ApologyDashboardPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    // Upload the signature image to S3 (if one was drawn) and store the returned URL.
    let signatureUrl = "";
    if (signatureImage) {
      try {
        const uploaded = await uploadImageDataUrl(signatureImage, `apology-dashboard/signatures/${req.params.shareId}`);
        signatureUrl = uploaded.url;
      } catch (e) {
        console.error("Signature upload error:", e);
      }
    }

    page.signerName = signerName.trim();
    page.signerEmail = (signerEmail || "").trim();
    page.signatureImage = signatureUrl;
    page.signed = true;
    page.signedAt = new Date();
    await page.save();

    const tokenId = "LOVE-" + randomBytes(4).toString("hex").toUpperCase();
    const dateStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // The creator's account email → CC'd so BOTH the delivery inbox and the person
    // who built the apology receive the same signed keepsake PDF.
    let creatorEmail = "";
    try {
      const owner = await User.findById(page.userId).select("email");
      creatorEmail = (owner?.email || "").trim();
    } catch (e) {
      console.error("Apology creator lookup error:", e);
    }

    // Generate the PDF and email it. A mail/PDF failure must not fail the signature record.
    try {
      const pdf = await generateApologyPdf({
        senderName: page.senderName,
        recipientName: page.recipientName,
        relationship: page.relationship,
        sorryLetter: page.sorryLetter,
        acceptedPromises: Array.isArray(acceptedPromises) ? acceptedPromises : [],
        signerName: signerName.trim(),
        signatureImage: signatureImage || "", // original incoming data URL (empty when no signature)
        tokenId,
        dateStr,
      });

      await sendApologyAgreementEmail({
        to: [page.deliveryEmail, signerEmail].filter(Boolean) as string[],
        cc: [creatorEmail].filter(Boolean) as string[],
        senderName: page.senderName,
        recipientName: page.recipientName,
        signerName: signerName.trim(),
        tokenId,
        pdf,
      });
    } catch (e) {
      console.error("Apology agreement PDF/email error:", e);
    }

    res.json({ success: true, message: "Agreement signed successfully", tokenId });
  } catch (error) {
    console.error("Sign apology agreement error:", error);
    res.status(500).json({ success: false, error: "Failed to sign agreement" });
  }
};

export const deleteApologyDashboardPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ApologyDashboardPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete apology dashboard page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
