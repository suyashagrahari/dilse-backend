import { Request, Response } from "express";
import Template from "../models/Template";
import type { TemplateInput, ApiResponse } from "../types";

export const getAllTemplates = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { type, category, search } = req.query;

    const filter: Record<string, unknown> = { isActive: true };

    if (type && typeof type === "string") {
      filter.type = type;
    }
    if (category && typeof category === "string") {
      filter.category = category;
    }
    if (search && typeof search === "string") {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
      ];
    }

    const templates = await Template.find(filter)
      .sort({ createdAt: -1 })
      .select("-__v");

    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error("Get all templates error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates",
    });
  }
};

export const getTemplateBySlug = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;

    const template = await Template.findOne({
      slug,
      isActive: true,
    }).select("-__v");

    if (!template) {
      res.status(404).json({
        success: false,
        error: "Template not found",
      });
      return;
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Get template error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch template",
    });
  }
};

export const createTemplate = async (
  req: Request<{}, {}, TemplateInput>,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const {
      slug,
      type,
      category,
      title,
      description,
      emoji,
      color,
      previewText,
      bodyText,
      bgGradient,
    } = req.body;

    if (!slug || !type || !category || !title) {
      res.status(400).json({
        success: false,
        error: "slug, type, category, and title are required",
      });
      return;
    }

    const existing = await Template.findOne({ slug });
    if (existing) {
      res.status(409).json({
        success: false,
        error: "Template with this slug already exists",
      });
      return;
    }

    const template = await Template.create({
      slug,
      type,
      category,
      title,
      description,
      emoji,
      color,
      previewText,
      bodyText,
      bgGradient,
    });

    res.status(201).json({
      success: true,
      data: template,
      message: "Template created successfully",
    });
  } catch (error) {
    console.error("Create template error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create template",
    });
  }
};

export const updateTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;
    const updates = req.body;

    delete updates.slug;

    const template = await Template.findOneAndUpdate({ slug }, updates, {
      new: true,
      runValidators: true,
    }).select("-__v");

    if (!template) {
      res.status(404).json({
        success: false,
        error: "Template not found",
      });
      return;
    }

    res.json({
      success: true,
      data: template,
      message: "Template updated successfully",
    });
  } catch (error) {
    console.error("Update template error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update template",
    });
  }
};

export const deleteTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;

    const template = await Template.findOneAndUpdate(
      { slug },
      { isActive: false },
      { new: true }
    );

    if (!template) {
      res.status(404).json({
        success: false,
        error: "Template not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete template",
    });
  }
};

export const getTemplateTypes = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const types = await Template.distinct("type", { isActive: true });
    const categories = await Template.distinct("category", { isActive: true });

    res.json({
      success: true,
      data: { types, categories },
    });
  } catch (error) {
    console.error("Get template types error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch template types",
    });
  }
};
