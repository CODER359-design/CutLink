import mongoose, { Schema, Document, Model } from "mongoose";

export interface LinkDocument extends Document {
  originalUrl: string;
  shortCode: string;
  clicks: number;
  createdAt: Date;
  expiresAt?: Date | null;
}

const linkSchema = new Schema<LinkDocument>(
  {
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
  }
);

export const Link: Model<LinkDocument> =
  mongoose.models.Link || mongoose.model<LinkDocument>("Link", linkSchema);
