import { Request, Response } from "express";
import BirthdayPage from "../models/BirthdayPage";
import ValentinePage from "../models/ValentinePage";
import mongoose from "mongoose";

interface TemplateLookup {
  model: mongoose.Model<unknown>;
  templateType: string;
  editorRoute: string;
}

const TEMPLATE_LOOKUPS: TemplateLookup[] = [
  { model: BirthdayPage as mongoose.Model<unknown>, templateType: "birthday", editorRoute: "/birthday-gf" },
  { model: ValentinePage as mongoose.Model<unknown>, templateType: "valentine", editorRoute: "/valentine-gf" },
];

export const getSharedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;

    for (const { model, templateType, editorRoute } of TEMPLATE_LOOKUPS) {
      const page = await model.findOne({ shareId, isPublished: true });
      if (page) {
        const pageObj = (page as { toObject: () => Record<string, unknown> }).toObject();
        const { password: _pw, ...safeData } = pageObj;
        const hasPassword = !!pageObj.password;
        res.json({
          success: true,
          templateType,
          editorRoute,
          hasPassword,
          data: safeData,
        });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Get shared page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};
