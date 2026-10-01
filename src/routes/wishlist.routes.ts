import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  getMyWishlists,
  getWishlistCount,
  getMyWishlistEntry,
  joinWishlist,
} from "../controllers/wishlist.controller";

const router = Router();

router.get("/me", protect, getMyWishlists);
router.get("/:campaign/count", getWishlistCount);
router.get("/:campaign/me", protect, getMyWishlistEntry);
router.post("/:campaign", protect, joinWishlist);

export default router;
