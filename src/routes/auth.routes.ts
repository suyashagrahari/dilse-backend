import { Router } from "express";
import {
  register,
  login,
  googleAuth,
  verifyOtp,
  resendOtp,
  getMe,
  refreshToken,
  logout,
  updateProfile,
  changePassword,
  getDashboard,
  checkSubdomainAvailability,
  suggestSubdomains,
  setSubdomain,
} from "../controllers/auth.controller";
import { protect, blockImpersonation } from "../middleware/auth";

const router = Router();

// `blockImpersonation` guards the routes that would let a super admin viewing
// as someone else take the account for good — changing its email/name, its
// password, or its subdomain. Impersonation is for reproducing what a user
// sees, and an action that survives the 15-minute session is beyond that.

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleAuth);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.get("/me", protect, getMe);
router.put("/profile", protect, blockImpersonation, updateProfile);
router.put("/password", protect, blockImpersonation, changePassword);
router.get("/dashboard", protect, getDashboard);
router.post("/refresh", refreshToken);
router.post("/logout", protect, logout);
router.get("/subdomain/check", protect, checkSubdomainAvailability);
router.get("/subdomain/suggest", protect, suggestSubdomains);
router.put("/subdomain", protect, blockImpersonation, setSubdomain);

export default router;
