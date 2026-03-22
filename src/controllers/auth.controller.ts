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

function generateTokens(userId: string, email: string) {
  const accessToken = generateAccessToken({ userId, email });
  const refreshToken = generateRefreshToken({ userId, email });
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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
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

    // Send OTP email (non-blocking — don't fail registration if email fails)
    try {
      await sendOtpEmail(email, name, otp);
    } catch (emailErr) {
      console.error("OTP email send failed:", emailErr);
    }

    res.status(201).json({
      success: true,
      data: {
        requiresVerification: true,
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
      try { await sendOtpEmail(user.email, user.name, otp); } catch {}
      res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        error: "Please verify your email. A new code has been sent.",
      });
      return;
    }

    const tokens = generateTokens(user._id.toString(), user.email);

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

    if (profile?.email) {
      const verifyRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${credential}` } }
      );

      if (!verifyRes.ok) {
        res.status(401).json({
          success: false,
          error: "Invalid Google access token",
        });
        return;
      }

      const verified = (await verifyRes.json()) as Record<string, string>;
      googleEmail = verified.email;
      googleName = verified.name;
      googlePicture = verified.picture;
      googleSub = verified.sub;
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
    }

    if (!googleEmail) {
      res.status(401).json({
        success: false,
        error: "Could not verify Google account",
      });
      return;
    }

    let user = await User.findOne({
      $or: [
        ...(googleSub ? [{ googleId: googleSub }] : []),
        { email: googleEmail },
      ],
    });

    const isNewUser = !user;

    if (user) {
      if (!user.googleId && googleSub) {
        user.googleId = googleSub;
        user.provider = "google";
        if (googlePicture) user.avatar = googlePicture;
      }
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

    const tokens = generateTokens(user._id.toString(), user.email);
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

    const tokens = generateTokens(user._id.toString(), user.email);
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

    try {
      await sendOtpEmail(user.email, user.name, otp);
    } catch (emailErr) {
      console.error("Resend OTP email failed:", emailErr);
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
        points: user.points,
        referralCode: user.referralCode,
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

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
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

    if (user.provider === "google" && !user.password) {
      res.status(400).json({
        success: false,
        error: "Google accounts cannot change password here",
      });
      return;
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(401).json({ success: false, error: "Current password is incorrect" });
      return;
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
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
    const ValentinePage = (await import("../models/ValentinePage")).default;

    const userId = req.userId!;

    const [favoritesCount, birthdayCount, valentineCount, user] = await Promise.all([
      Favorite.countDocuments({ userId }),
      BirthdayPage.countDocuments({ userId }),
      ValentinePage.countDocuments({ userId }),
      User.findById(userId),
    ]);

    const generatedCount = birthdayCount + valentineCount;

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

    const tokens = generateTokens(user._id.toString(), user.email);
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
