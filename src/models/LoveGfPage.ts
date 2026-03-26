import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IGameResponse {
  type: "truth" | "dare";
  prompt: string;
  answer: string;
  savedAt: Date;
}

export interface IPhotoItem {
  url: string;
  letter: string;
  cropX: number;
  cropY: number;
}

export interface IQuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export interface ILoveGfPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  recipientName: string;
  senderName: string;
  personalMessage: string;
  wishMessage: string;
  loveDate: string;
  homePhotos: string[];
  galleryPhotos: IPhotoItem[];
  quizQuestions: IQuizQuestion[];
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  gameResponses: IGameResponse[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const loveGfPageSchema = new Schema<ILoveGfPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    recipientName: { type: String, default: "", trim: true },
    senderName:    { type: String, default: "", trim: true },
    personalMessage: {
      type: String,
      default: "Every moment with you is a treasure I hold close to my heart. You are my sunshine, my laughter, my home. I love you more than words can ever say.",
    },
    wishMessage: {
      type: String,
      default: "To the one who holds my heart — thank you for every laugh, every hug, every quiet moment that felt like the whole world. You are my favourite person. Love you to the moon and back ♡",
    },
    loveDate:   { type: String, default: "" },
    homePhotos: { type: [String], default: [] },
    galleryPhotos: {
      type: [
        {
          url:    { type: String, default: "" },
          letter: { type: String, default: "" },
          cropX:  { type: Number, default: 50 },
          cropY:  { type: Number, default: 50 },
        },
      ],
      default: [],
    },
    quizQuestions: {
      type: [
        {
          question: { type: String, required: true },
          options:  { type: [String], default: [] },
          correct:  { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    password:    { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount:   { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
    gameResponses: {
      type: [
        {
          type:    { type: String, enum: ["truth", "dare"], required: true },
          prompt:  { type: String, required: true },
          answer:  { type: String, required: true },
          savedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

loveGfPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

loveGfPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<ILoveGfPage>("LoveGfPage", loveGfPageSchema);
