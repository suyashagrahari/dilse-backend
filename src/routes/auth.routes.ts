import { Router } from "express";
import {
  register,
  login,
  googleAuth,
  getMe,
  refreshToken,
  logout,
  updateProfile,
  changePassword,
  getDashboard,
} from "../controllers/auth.controller";
import { protect } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleAuth);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.put("/password", protect, changePassword);
router.get("/dashboard", protect, getDashboard);
router.post("/refresh", refreshToken);
router.post("/logout", protect, logout);

export default router;
