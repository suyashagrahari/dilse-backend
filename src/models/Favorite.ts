import mongoose, { Schema, Document } from "mongoose";

export interface IFavorite extends Document {
  templateSlug: string;
  userId: string;
  createdAt: Date;
}

const favoriteSchema = new Schema<IFavorite>(
  {
    templateSlug: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      default: "anonymous",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

favoriteSchema.index({ templateSlug: 1, userId: 1 }, { unique: true });

export default mongoose.model<IFavorite>("Favorite", favoriteSchema);
