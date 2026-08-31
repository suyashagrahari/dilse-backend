import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createSearchedPage,
  getMySearchedPages,
  getSearchedPage,
  updateSearchedPage,
  publishSearchedPage,
  getSharedSearchedPage,
  verifySearchedPagePassword,
  deleteSearchedPage,
} from "../controllers/searchedPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("searched");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedSearchedPage);
router.post("/share/:shareId/verify", verifySearchedPagePassword);

router.use(protect);
router.post("/", live, createSearchedPage);
router.get("/my", getMySearchedPages);
router.get("/:id", getSearchedPage);
router.put("/:id", live, updateSearchedPage);
router.post("/:id/publish", live, publishSearchedPage);
router.delete("/:id", deleteSearchedPage);

export default router;
