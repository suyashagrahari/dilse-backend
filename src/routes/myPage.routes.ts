import { Router } from "express";
import { setMyPagePassword } from "../controllers/myPagePassword.controller";

/**
 * Things a page's OWNER can do to it from outside the builder.
 *
 * Mounted at /api/my-pages behind `protect` in routes/index.ts, so nothing here
 * re-checks authentication. Every handler scopes its query by `req.userId`;
 * ownership is not a separate check that could be forgotten.
 */
const router = Router();

router.put("/:templateType/:pageId/password", setMyPagePassword);

export default router;
