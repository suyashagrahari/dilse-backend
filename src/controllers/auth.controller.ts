import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User";
import ReferralRecord from "../models/ReferralRecord";
import PointTransaction from "../models/PointTransaction";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { env } from "../config/env";
import { sendOtpEmail } from "../utils/mailer";
import { grantedSlugsFor } from "../config/templateAccess";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const REFERRAL_POINTS = 100;

async function applyReferral(newUserId: string, refCode: string): Promise<void> {
  if (!refCode) return;
  try {
    const referrer = await User.findOne({ referralCode: refCode.toUpperCase().trim() });
    if (!referrer) return;
    if (String(referrer._id) === newUserId) return; // can't self-refer

    const newUser = await User.findById(newUserId);
    if (!newUser) return;
    if (newUser.referredBy) return; // already used a code

    // Mark who referred this user
    newUser.referredBy = referrer._id;

    // Award referee (new user) +100 pts
    newUser.points += REFERRAL_POINTS;
    newUser.totalPointsEarned += REFERRAL_POINTS;
    await newUser.save();

    // Award referrer +100 pts
    referrer.points += REFERRAL_POINTS;
    referrer.totalPointsEarned += REFERRAL_POINTS;
    await referrer.save();

    // Create referral record
    await ReferralRecord.create({ referrer: referrer._id, referee: newUserId });

    // Point transaction for referee
    await PointTransaction.create({
      user: newUserId,
      type: "referral_signup",
      delta: REFERRAL_POINTS,
      balance: newUser.points,
      meta: { referrerName: referrer.name },
    });

    // Point transaction for referrer
    await PointTransaction.create({
      user: referrer._id,
      type: "referral_reward",
      delta: REFERRAL_POINTS,
      balance: referrer.points,
      meta: { refereeName: newUser.name },
    });
  } catch (err) {
    console.error("applyReferral error (non-fatal):", err);
  }
}

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/**
 * `tokenVersion` is stamped into both tokens so `protect` can reject sessions
 * that a force-logout or a ban has revoked.
 *
 * It must come from the user document at mint time, not default to 0: after a
 * force-logout bumps the stored version to 1, a fresh login issuing a `tv: 0`
 * token would be rejected by `protect` on the very next request, and the user
 * could never sign back in.
 */
function generateTokens(userId: string, email: string, tokenVersion = 0) {
  const accessToken = generateAccessToken({ userId, email, tv: tokenVersion });
  const refreshToken = generateRefreshToken({ userId, email, tv: tokenVersion });
  return { accessToken, refreshToken };
}

export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password, name, referralCode } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({
        success: false,
        error: "Name, email, and password are required",
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters",
      });
      return;
    }

    const existingUser = await User.findOne({ email }).select("+password");
    if (existingUser) {
      // "An account already exists" is true but useless to somebody who signed
      // up with Google and has simply forgotten. Name the way in.
      if (existingUser.provider === "google" && !existingUser.password) {
        res.status(409).json({
          success: false,
          error: "This email is already registered with Google. Use Continue with Google to sign in.",
          code: "USE_GOOGLE",
        });
        return;
      }
      res.status(409).json({
        success: false,
        error: "An account with this email already exists",
      });
      return;
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const user = await User.create({
      email,
      password,
      name,
      provider: "local",
      isVerified: false,
      otp,
      otpExpiry,
      pendingReferralCode: referralCode || undefined,
    });

    // The account is created either way — losing a registration because mail
    // is down would be worse. But whether the code actually went is reported,
    // so the client can stop telling people to check an inbox that will never
    // receive anything. See sendOtpEmail for the two-provider chain.
    const sent = await sendOtpEmail(email, name, otp);

    res.status(201).json({
      success: true,
      data: {
        requiresVerification: true,
        emailDelivered: sent.delivered,
        email,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      error: "Registration failed. Please try again.",
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
      return;
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    if (user.provider === "google" && !user.password) {
      res.status(401).json({
        success: false,
        error: "This account uses Google sign-in. Please use Google to log in.",
      });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    // Block login if email not verified
    if (!user.isVerified) {
      // Re-send a fresh OTP so they can verify
      const otp = generateOtp();
      user.otp = otp;
      user.otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      // This `catch {}` used to swallow everything and then claim "a new code
      // has been sent" regardless. On the Resend free tier's 100-a-day cap
      // that is a lie the user cannot see through.
      const sent = await sendOtpEmail(user.email, user.name, otp);
      res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        emailDelivered: sent.delivered,
        error: sent.delivered
          ? "Please verify your email. A new code has been sent."
          : "We could not send your code right now. Try signing in with Google, or try again in a few minutes.",
      });
      return;
    }

    const tokens = generateTokens(user._id.toString(), user.email, user.tokenVersion || 0);

    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
          theme: user.theme,
          role: user.role,
          subdomain: user.subdomain,
          points: user.points,
          referralCode: user.referralCode,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed. Please try again.",
    });
  }
};

export const googleAuth = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { credential, profile, referralCode } = req.body;

    if (!credential) {
      res.status(400).json({
        success: false,
        error: "Google credential is required",
      });
      return;
    }

    let googleEmail: string | undefined;
    let googleName: string | undefined;
    let googlePicture: string | undefined;
    let googleSub: string | undefined;

    let googleEmailVerified = true;

    if (profile?.email) {
      // ── Who was this token issued TO? ──────────────────────────────────
      //
      // The previous version called `/userinfo` with the bearer token and
      // accepted whatever came back. That endpoint answers for ANY valid
      // Google access token, whichever OAuth client minted it — so a token
      // issued to somebody else's application, for a user who had granted
      // that application access, would authenticate as that user here.
      //
      // `tokeninfo` reports the token's `aud`. It must be our client. This is
      // the same check `verifyIdToken({ audience })` performs on the other
      // branch, which is why only this one was exposed.
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(credential)}`
      );
      if (!tokenInfoRes.ok) {
        res.status(401).json({ success: false, error: "Invalid Google access token" });
        return;
      }
      const tokenInfo = (await tokenInfoRes.json()) as Record<string, string>;
      if (!tokenInfo.aud || tokenInfo.aud !== env.GOOGLE_CLIENT_ID) {
        console.warn(
          `Rejected a Google access token issued to a different client: aud=${tokenInfo.aud}`
        );
        res.status(401).json({ success: false, error: "Invalid Google access token" });
        return;
      }

      googleEmail = tokenInfo.email;
      googleSub = tokenInfo.sub;
      // tokeninfo reports this as the STRING "true"/"false".
      googleEmailVerified = String(tokenInfo.email_verified ?? "true") !== "false";

      // Name and picture only — identity has already been established above,
      // so a failure here costs a display name, not a login.
      try {
        const profileRes = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: `Bearer ${credential}` } }
        );
        if (profileRes.ok) {
          const verified = (await profileRes.json()) as Record<string, string>;
          googleName = verified.name;
          googlePicture = verified.picture;
          if (!googleEmail) googleEmail = verified.email;
        }
      } catch {
        // Non-fatal, deliberately.
      }
    } else {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload?.email) {
        res.status(401).json({
          success: false,
          error: "Invalid Google credentials",
        });
        return;
      }

      googleEmail = payload.email;
      googleName = payload.name;
      googlePicture = payload.picture;
      googleSub = payload.sub;
      googleEmailVerified = payload.email_verified !== false;
    }

    if (!googleEmail) {
      res.status(401).json({
        success: false,
        error: "Could not verify Google account",
      });
      return;
    }

    // Google publishes `email_verified` precisely because a Google account can
    // carry an address its owner has not proved. Everything downstream treats
    // a Google sign-in as proof of the address — it is what marks the account
    // verified and what skips the OTP — so an unproved address cannot be let
    // through, or that proof means nothing.
    if (!googleEmailVerified) {
      res.status(401).json({
        success: false,
        error:
          "Google has not verified the email address on that account. Please verify it with Google, or sign up with an email and password instead.",
      });
      return;
    }

    // `+password` is required, not optional: `password` is `select: false`, so
    // without it `user.password` reads as undefined even for an account that
    // has one — and the linking logic below turns on exactly that question.
    let user = await User.findOne({
      $or: [
        ...(googleSub ? [{ googleId: googleSub }] : []),
        { email: googleEmail },
      ],
    }).select("+password");

    const isNewUser = !user;

    if (user) {
      // ── Linking Google to an account that already exists ───────────────
      //
      // This block had one job and did half of it: it attached the googleId
      // and flipped `provider`, but never touched `isVerified`.
      //
      // The consequence, reproduced before this was written: somebody registers
      // with an email and password (isVerified false, code pending), then signs
      // in with Google. Google sign-in succeeds — but the account stays
      // unverified, so their NEXT password login hits the `!user.isVerified`
      // gate, is refused with 403, and a fresh OTP is sent. Google had already
      // proved they own the address; we asked them to prove it again.
      const wasUnverified = !user.isVerified;
      const hadPassword = !!user.password;

      if (googleSub && !user.googleId) user.googleId = googleSub;
      // Only fill an EMPTY avatar. Overwriting one the user chose with their
      // Google photo on every sign-in silently undoes their own choice.
      if (googlePicture && !user.avatar) user.avatar = googlePicture;

      if (wasUnverified) {
        // Google has proved control of the address. That is the whole point.
        user.isVerified = true;

        // ── And this is why marking it verified is not enough on its own ──
        //
        // A password on an account that was NEVER verified was set by somebody
        // who never proved they own the address. Marking the account verified
        // and keeping that password hands it to them:
        //
        //   1. attacker registers victim@gmail.com with a password they choose
        //      — no verification needed to create the row
        //   2. the real victim later signs in with Google
        //   3. the account is now verified, and the attacker's password works
        //
        // Today the missing `isVerified` accidentally blocks step 3, so fixing
        // the reported bug without this would OPEN an account takeover. The
        // password is therefore discarded. The real owner keeps Google, and
        // can set a password again through the reset flow, which proves
        // ownership properly.
        if (hadPassword) {
          user.set("password", undefined);
          console.warn(
            `Google sign-in verified ${user.email}, which had an unverified-era password. The password was cleared; that account can sign in with Google or reset it.`
          );
        }
      }

      // A pending code is meaningless once the address is proved, and leaving
      // it live means a code mailed before the Google sign-in still works.
      if (user.otp) user.set("otp", undefined);
      if (user.otpExpiry) user.set("otpExpiry", undefined);

      // `provider` is a single field describing what is really two independent
      // capabilities. Only claim "google" when there is no usable password
      // left, so a verified user who has BOTH keeps `local` and stays out of
      // the "this account uses Google sign-in" refusal in `login`.
      if (!user.password) user.provider = "google";
    } else {
      user = new User({
        email: googleEmail,
        name: googleName || googleEmail.split("@")[0],
        avatar: googlePicture || "",
        googleId: googleSub,
        provider: "google",
        isVerified: true, // Google already verified the email
      });
    }

    const tokens = generateTokens(user._id.toString(), user.email, user.tokenVersion || 0);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Apply referral only for brand-new users
    if (isNewUser && referralCode) {
      await applyReferral(user._id.toString(), referralCode);
    }

    const freshUser = await User.findById(user._id);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
          theme: user.theme,
          role: freshUser?.role ?? user.role,
          subdomain: user.subdomain,
          points: freshUser?.points ?? 0,
          referralCode: freshUser?.referralCode ?? "",
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(401).json({
      success: false,
      error: "Google authentication failed. Please try again.",
    });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ success: false, error: "Email and OTP are required" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+otp +otpExpiry +pendingReferralCode +password");

    if (!user) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    if (user.isVerified) {
      res.status(400).json({ success: false, error: "Email already verified. Please log in." });
      return;
    }

    if (!user.otp || !user.otpExpiry) {
      res.status(400).json({ success: false, error: "No verification code found. Please request a new one." });
      return;
    }

    if (new Date() > user.otpExpiry) {
      res.status(400).json({ success: false, error: "Code has expired. Please request a new one." });
      return;
    }

    if (user.otp !== String(otp).trim()) {
      res.status(400).json({ success: false, error: "Incorrect code. Please try again." });
      return;
    }

    // Mark verified, clear OTP fields
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    const pendingRef = user.pendingReferralCode;
    user.pendingReferralCode = undefined;

    const tokens = generateTokens(user._id.toString(), user.email, user.tokenVersion || 0);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Apply referral reward after verification
    if (pendingRef) await applyReferral(user._id.toString(), pendingRef);

    const freshUser = await User.findById(user._id);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
          theme: user.theme,
          role: freshUser?.role ?? user.role,
          subdomain: user.subdomain,
          points: freshUser?.points ?? 0,
          referralCode: freshUser?.referralCode ?? "",
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error("verifyOtp error:", error);
    res.status(500).json({ success: false, error: "Verification failed. Please try again." });
  }
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: "Email is required" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+otp +otpExpiry");

    if (!user) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    if (user.isVerified) {
      res.status(400).json({ success: false, error: "Email already verified" });
      return;
    }

    // Rate limit: must wait 60s between resends
    if (user.otpExpiry) {
      const sentAt = new Date(user.otpExpiry.getTime() - 15 * 60 * 1000);
      const secondsSinceSend = (Date.now() - sentAt.getTime()) / 1000;
      if (secondsSinceSend < 60) {
        const wait = Math.ceil(60 - secondsSinceSend);
        res.status(429).json({ success: false, error: `Please wait ${wait}s before requesting a new code.` });
        return;
      }
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const sent = await sendOtpEmail(user.email, user.name, otp);
    if (!sent.delivered) {
      // 502, not 200. This route exists BECAUSE the first code did not
      // arrive; answering "New code sent to your email" when nothing was sent
      // sends the person back to wait for a second email that is equally
      // absent. The code is stored and still valid if mail recovers.
      res.status(502).json({
        success: false,
        error: "We could not send your code right now. Try signing in with Google, or try again in a few minutes.",
        code: "OTP_SEND_FAILED",
      });
      return;
    }

    res.json({ success: true, message: "New code sent to your email" });
  } catch (error) {
    console.error("resendOtp error:", error);
    res.status(500).json({ success: false, error: "Failed to resend code" });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // ── Early access travels with the user, not with the public template list ──
    //
    // `GET /api/template-visibility` is unauthenticated and edge-cached for 60s,
    // so a per-user list cannot ride on it — a CDN would hand one person's
    // access to the next. It rides here instead, on a response that is already
    // per-user and already fetched on boot by `checkAuth`.
    //
    // Two things fall out of that, both wanted. There is no extra request, and
    // there is no render where the client knows WHO you are but not WHAT you can
    // see — which is what would make a granted user's builder flash "Not
    // available yet" before opening.
    //
    // Under impersonation this answers with the impersonated user's grants,
    // because `protect` has already resolved `req.userId` to them. That is
    // correct: an admin viewing as a user should see what that user sees.
    const earlyAccess = [...(await grantedSlugsFor(String(user._id)))].sort();

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
        theme: user.theme,
        role: user.role,
        subdomain: user.subdomain,
        createdAt: user.createdAt,
        points: user.points,
        referralCode: user.referralCode,
        /** Template slugs this user may use even while they are hidden. */
        earlyAccess,
      },
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
};

export const updateProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, avatar, theme } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ success: false, error: "Name cannot be empty" });
        return;
      }
      user.name = name.trim();
    }
    if (avatar !== undefined) user.avatar = avatar;
    if (theme !== undefined) {
      if (!["light", "dark", "system"].includes(theme)) {
        res.status(400).json({ success: false, error: "Invalid theme value" });
        return;
      }
      user.theme = theme;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
        theme: user.theme,
        subdomain: user.subdomain,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, error: "Failed to update profile" });
  }
};

export const changePassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      res.status(400).json({ success: false, error: "A new password is required" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
      return;
    }

    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // ── Setting a first password, versus changing an existing one ────────
    //
    // This route used to refuse outright when the account had no password,
    // which left two groups with no way to ever have one:
    //
    //   · anyone who signed up with Google — there is no reset flow anywhere
    //     in this codebase to fall back on (no /forgot-password route exists)
    //   · anyone whose unverified-era password was cleared when Google sign-in
    //     verified their address — see googleAuth
    //
    // The second group is created by the fix in googleAuth, so leaving this
    // as it was would have stranded them permanently.
    //
    // `currentPassword` is required only when there IS one to prove. With no
    // password on the account there is nothing to compare against, and the
    // request is already authenticated by `protect` plus `blockImpersonation`
    // — a valid access token is the proof, and anyone holding one already has
    // full access to the account.
    const settingFirstPassword = !user.password;

    if (!settingFirstPassword) {
      if (!currentPassword) {
        res.status(400).json({
          success: false,
          error: "Your current password is required to change it",
        });
        return;
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        res.status(401).json({ success: false, error: "Current password is incorrect" });
        return;
      }
    }

    user.password = newPassword;
    // The account can now sign in both ways, and `login` refuses on
    // `provider === "google" && !password` — so leaving provider as "google"
    // with a password set would reject the password it just accepted.
    if (user.provider === "google") user.provider = "local";
    await user.save();

    res.json({
      success: true,
      message: settingFirstPassword
        ? "Password set. You can now sign in with your email as well as Google."
        : "Password updated successfully",
      data: { wasFirstPassword: settingFirstPassword },
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, error: "Failed to change password" });
  }
};

export const getDashboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const Favorite = (await import("../models/Favorite")).default;
    const BirthdayPage = (await import("../models/BirthdayPage")).default;
    const BirthdayGfPage = (await import("../models/BirthdayGfPage")).default;
    const ValentinePage = (await import("../models/ValentinePage")).default;
    const HoliPage = (await import("../models/HoliPage")).default;
    const EidPage = (await import("../models/EidPage")).default;
    const WeddingPage = (await import("../models/WeddingPage")).default;
    const ReceptionPage = (await import("../models/ReceptionPage")).default;
    const ShaadiCardPage = (await import("../models/ShaadiCardPage")).default;
    const LoveGfPage = (await import("../models/LoveGfPage")).default;
    const DarlingPage = (await import("../models/DarlingPage")).default;
    const ChristianWeddingPage = (await import("../models/ChristianWeddingPage")).default;

    const userId = req.userId!;

    const [
      favoritesCount,
      birthdayCount,
      birthdayGfCount,
      valentineCount,
      holiCount,
      eidCount,
      weddingCount,
      receptionCount,
      shaadiCardCount,
      loveGfCount,
      darlingCount,
      christianWeddingCount,
      user,
    ] = await Promise.all([
      Favorite.countDocuments({ userId }),
      BirthdayPage.countDocuments({ userId }),
      BirthdayGfPage.countDocuments({ userId }),
      ValentinePage.countDocuments({ userId }),
      HoliPage.countDocuments({ userId }),
      EidPage.countDocuments({ userId }),
      WeddingPage.countDocuments({ userId }),
      ReceptionPage.countDocuments({ userId }),
      ShaadiCardPage.countDocuments({ userId }),
      LoveGfPage.countDocuments({ userId }),
      DarlingPage.countDocuments({ userId }),
      ChristianWeddingPage.countDocuments({ userId }),
      User.findById(userId),
    ]);

    const generatedCount =
      birthdayCount +
      birthdayGfCount +
      valentineCount +
      holiCount +
      eidCount +
      weddingCount +
      receptionCount +
      shaadiCardCount +
      loveGfCount +
      darlingCount +
      christianWeddingCount;

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
          theme: user.theme,
          subdomain: user.subdomain,
          createdAt: user.createdAt,
        },
        stats: {
          favoritesCount,
          generatedCount,
          memberSince: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, error: "Failed to load dashboard" });
  }
};

export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        error: "Refresh token is required",
      });
      return;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      res.status(401).json({
        success: false,
        error: "Refresh token expired. Please log in again.",
      });
      return;
    }

    const user = await User.findById(decoded.userId).select("+refreshToken");
    if (!user || user.refreshToken !== token) {
      res.status(401).json({
        success: false,
        error: "Invalid refresh token. Please log in again.",
      });
      return;
    }

    // A blocked account must not be handed a fresh token. `protect` would
    // refuse it on the next call anyway, but issuing one leaves the client
    // looking signed in until it tries to do something.
    if (user.status === "banned" || user.status === "suspended") {
      res.status(403).json({
        success: false,
        error:
          user.status === "banned"
            ? "This account has been banned."
            : "This account is temporarily suspended.",
        code: user.status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED",
      });
      return;
    }

    const tokens = generateTokens(user._id.toString(), user.email, user.tokenVersion || 0);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
          theme: user.theme,
          role: user.role,
          subdomain: user.subdomain,
        },
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      error: "Token refresh failed",
    });
  }
};

const SUBDOMAIN_RESERVED = new Set([
  "www", "admin", "api", "mail", "ftp", "support", "help", "docs", "blog", "app",
  "auth", "login", "signup", "register", "dashboard", "static", "assets", "cdn",
  "dev", "test", "staging", "prod", "production", "public", "private", "media",
  "u", "user", "users", "share", "page", "pages", "gift", "gifts", "dilse",
]);

function validateSubdomain(name: string): string | null {
  if (!name || typeof name !== "string") return "Subdomain is required";
  const lower = name.toLowerCase().trim();
  if (lower.length < 3) return "Subdomain must be at least 3 characters";
  if (lower.length > 30) return "Subdomain must be 30 characters or fewer";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(lower) && !/^[a-z0-9]{3}$/.test(lower)) {
    return "Only lowercase letters, numbers, and hyphens allowed (cannot start/end with hyphen)";
  }
  if (lower.includes("--")) return "Consecutive hyphens are not allowed";
  if (SUBDOMAIN_RESERVED.has(lower)) return "This subdomain is reserved, please choose another";
  return null;
}

export const checkSubdomainAvailability = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const name = (req.query.name as string || "").toLowerCase().trim();
    const validationError = validateSubdomain(name);
    if (validationError) {
      res.json({ success: true, available: false, reason: validationError });
      return;
    }
    const currentUserId = req.userId;
    const existing = await User.findOne({ subdomain: name });
    if (existing && String(existing._id) !== String(currentUserId)) {
      res.json({ success: true, available: false, reason: "This subdomain is already taken" });
      return;
    }
    res.json({ success: true, available: true });
  } catch (error) {
    console.error("Check subdomain error:", error);
    res.status(500).json({ success: false, error: "Failed to check availability" });
  }
};

export const setSubdomain = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawName: string = (req.body.subdomain || "").toLowerCase().trim();
    const validationError = validateSubdomain(rawName);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    const existing = await User.findOne({ subdomain: rawName });
    if (existing && String(existing._id) !== String(user._id)) {
      res.status(409).json({ success: false, error: "This subdomain is already taken" });
      return;
    }
    user.subdomain = rawName;
    await user.save();
    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
        theme: user.theme,
        subdomain: user.subdomain,
      },
      message: "Subdomain set successfully",
    });
  } catch (error) {
    console.error("Set subdomain error:", error);
    res.status(500).json({ success: false, error: "Failed to set subdomain" });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    await User.findByIdAndUpdate(req.userId, { refreshToken: null });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed",
    });
  }
};
