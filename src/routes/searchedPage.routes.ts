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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedSearchedPage);
router.post("/share/:shareId/verify", verifySearchedPagePassword);

router.use(protect);
router.post("/", createSearchedPage);
router.get("/my", getMySearchedPages);
router.get("/:id", getSearchedPage);
router.put("/:id", updateSearchedPage);
router.post("/:id/publish", publishSearchedPage);
router.delete("/:id", deleteSearchedPage);

export default router;
