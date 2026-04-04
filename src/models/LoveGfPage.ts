import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IGameResponse {
  type: "truth" | "dare";
  prompt: string;
  answer: string;
  savedAt: Date;
  mediaUrl?: string;
}

export interface IPhotoItem {
  url: string;
  letter: string;
  cropX: number;
  cropY: number;
}

export interface IHomeCoverPhoto {
  url: string;
  cropX: number;
  cropY: number;
  scale: number;
}

export interface IQuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export interface INote {
  from: string;
  message: string;
  mood: string;
  mediaUrl?: string;
  mediaType?: "audio" | "image";
  savedAt: Date;
}

export interface ILoveGfPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  recipientName: string;
  senderName: string;
  personalMessage: string;
  wishMessage: string;
  loveDate: string;
  homeCoverPhoto: IHomeCoverPhoto;
  homePhotos: string[];
  galleryPhotos: IPhotoItem[];
  quizQuestions: IQuizQuestion[];
  truthDareQuestions: Array<{ type: "truth" | "dare"; text: string; photoUrl?: string; audioUrl?: string }>;
  quizAttempts: Array<{ score: number; total: number; playedAt: Date }>;
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  gameResponses: IGameResponse[];
  notes: INote[];
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
    homeCoverPhoto: {
      url:   { type: String, default: "" },
      cropX: { type: Number, default: 50 },
      cropY: { type: Number, default: 50 },
      scale: { type: Number, default: 100 },
    },
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
    truthDareQuestions: {
      type: [
        {
          type: { type: String, enum: ["truth", "dare"], required: true },
          text: { type: String, required: true },
          photoUrl: { type: String, default: "" },
          audioUrl: { type: String, default: "" },
        },
      ],
      default: [],
    },
    quizAttempts: {
      type: [
        {
          score: { type: Number, required: true },
          total: { type: Number, required: true },
          playedAt: { type: Date, default: Date.now },
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
          type:     { type: String, enum: ["truth", "dare"], required: true },
          prompt:   { type: String, required: true },
          answer:   { type: String, required: true },
          savedAt:  { type: Date, default: Date.now },
          mediaUrl: { type: String, default: "" },
        },
      ],
      default: [],
    },
    notes: {
      type: [
        {
          from:      { type: String, default: "Anonymous" },
          message:   { type: String, required: true },
          mood:      { type: String, default: "💕" },
          mediaUrl:  { type: String, default: "" },
          mediaType: { type: String, enum: ["audio", "image", ""], default: "" },
          savedAt:   { type: Date, default: Date.now },
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
