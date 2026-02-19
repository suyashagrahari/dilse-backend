import { Router } from "express";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
} from "../controllers/favorite.controller";

const router = Router();

router.get("/", getFavorites);
router.post("/", addFavorite);
router.get("/check/:slug", checkFavorite);
router.delete("/:slug", removeFavorite);

export default router;
