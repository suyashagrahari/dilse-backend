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

export interface IQuizAnswer {
  question: string;
  options: string[];
  selected: number;
  correct: number;
  isCorrect: boolean;
  answeredAt: Date;
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

export interface IBirthdayGfPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  recipientName: string;
  senderName: string;
  personalMessage: string;
  birthdayWish: string;
  birthdayDate: string;
  homeCoverPhoto: IHomeCoverPhoto;
  homePhoto1: string;
  homePhoto2: string;
  galleryPhotos: IPhotoItem[];
  quizQuestions: IQuizQuestion[];
  truthDareQuestions: Array<{ type: "truth" | "dare"; text: string; photoUrl?: string; audioUrl?: string }>;
  quizAttempts: Array<{ score: number; total: number; playedAt: Date }>;
  quizAnswers: IQuizAnswer[];
  musicTracks: Array<{ title: string; artist: string; src: string }>;
  surprisePhoto: string;
  surpriseAudioUrl: string;
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  gameResponses: IGameResponse[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const birthdayGfPageSchema = new Schema<IBirthdayGfPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    recipientName: { type: String, default: "", trim: true },
    senderName:    { type: String, default: "", trim: true },
    personalMessage: {
      type: String,
      default: "Every moment with you is a treasure I hold close to my heart. You are my sunshine, my laughter, my home. I love you more than words can ever say.",
    },
    birthdayWish: {
      type: String,
      default: "Wishing you the most magical birthday ever! You deserve all the happiness in the world. Here's to another year of beautiful memories together. Happy Birthday! 🎂",
    },
    birthdayDate: { type: String, default: "" },
    homeCoverPhoto: {
      url:   { type: String, default: "" },
      cropX: { type: Number, default: 50 },
      cropY: { type: Number, default: 50 },
      scale: { type: Number, default: 100 },
    },
    homePhoto1: { type: String, default: "" },
    homePhoto2: { type: String, default: "" },
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
    quizAnswers: {
      type: [
        {
          question:   { type: String, required: true },
          options:    { type: [String], default: [] },
          selected:   { type: Number, required: true },
          correct:    { type: Number, required: true },
          isCorrect:  { type: Boolean, required: true },
          answeredAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    musicTracks: {
      type: [
        {
          title:  { type: String, default: "" },
          artist: { type: String, default: "" },
          src:    { type: String, default: "" },
        },
      ],
      default: [],
    },
    surprisePhoto:    { type: String, default: "" },
    surpriseAudioUrl: { type: String, default: "" },
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
  },
  { timestamps: true }
);

birthdayGfPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

birthdayGfPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IBirthdayGfPage>("BirthdayGfPage", birthdayGfPageSchema);
