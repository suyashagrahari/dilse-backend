import { Request, Response } from "express";
import UserContent from "../models/UserContent";
import type { ApiResponse } from "../types";

export const saveUserContent = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { templateSlug, heading, body, senderName } = req.body;
    const userId = req.userId!;

    if (!templateSlug) {
      res.status(400).json({
        success: false,
        error: "templateSlug is required",
      });
      return;
    }

    const content = await UserContent.findOneAndUpdate(
      { templateSlug, userId },
      { heading, body, senderName },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      success: true,
      data: content,
      message: "Content saved successfully",
    });
  } catch (error) {
    console.error("Save user content error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to save content",
    });
  }
};

export const getUserContent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = req.userId!;

    const content = await UserContent.findOne({
      templateSlug: slug,
      userId,
    }).select("-__v");

    res.json({
      success: true,
      data: content || null,
    });
  } catch (error) {
    console.error("Get user content error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch content",
    });
  }
};

export const getAllUserContent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId!;

    const content = await UserContent.find({ userId })
      .sort({ updatedAt: -1 })
      .select("-__v");

    res.json({
      success: true,
      data: content,
      count: content.length,
    });
  } catch (error) {
    console.error("Get all user content error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch content",
    });
  }
};

export const deleteUserContent = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = req.userId!;

    const result = await UserContent.findOneAndDelete({
      templateSlug: slug,
      userId,
    });

    if (!result) {
      res.status(404).json({
        success: false,
        error: "Content not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Content deleted successfully",
    });
  } catch (error) {
    console.error("Delete user content error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete content",
    });
  }
};
