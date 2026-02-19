import { Request, Response } from "express";
import Favorite from "../models/Favorite";
import type { ApiResponse } from "../types";

export const getFavorites = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId!;

    const favorites = await Favorite.find({ userId })
      .sort({ createdAt: -1 })
      .select("-__v");

    res.json({
      success: true,
      data: {
        favorites,
      },
    });
  } catch (error) {
    console.error("Get favorites error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch favorites",
    });
  }
};

export const addFavorite = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { templateSlug } = req.body;
    const userId = req.userId!;

    if (!templateSlug) {
      res.status(400).json({
        success: false,
        error: "templateSlug is required",
      });
      return;
    }

    const existing = await Favorite.findOne({ templateSlug, userId });
    if (existing) {
      res.status(409).json({
        success: false,
        error: "Template already in favorites",
      });
      return;
    }

    const favorite = await Favorite.create({ templateSlug, userId });

    res.status(201).json({
      success: true,
      data: favorite,
      message: "Added to favorites",
    });
  } catch (error) {
    console.error("Add favorite error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add favorite",
    });
  }
};

export const removeFavorite = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = req.userId!;

    const result = await Favorite.findOneAndDelete({
      templateSlug: slug,
      userId,
    });

    if (!result) {
      res.status(404).json({
        success: false,
        error: "Favorite not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Removed from favorites",
    });
  } catch (error) {
    console.error("Remove favorite error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove favorite",
    });
  }
};

export const checkFavorite = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = req.userId!;

    const favorite = await Favorite.findOne({
      templateSlug: slug,
      userId,
    });

    res.json({
      success: true,
      data: { isFavorite: !!favorite },
    });
  } catch (error) {
    console.error("Check favorite error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check favorite",
    });
  }
};
