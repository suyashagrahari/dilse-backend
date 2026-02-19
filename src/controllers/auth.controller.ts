import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { env } from "../config/env";

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
    const { email, password, name } = req.body;

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

    const user = await User.create({
      email,
      password,
      name,
      provider: "local",
    });

    const tokens = generateTokens(user._id.toString(), user.email);

    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
          theme: user.theme,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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
    const { credential, profile } = req.body;

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
      });
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
        createdAt: user.createdAt,
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
