import mongoose, { Document, Schema } from "mongoose";

export interface IWord extends Document {
  word: string;
  used: boolean;
  usedOn: Date | null;
  addedAt: Date;
  source: "ai";
}

const WordSchema = new Schema<IWord>(
  {
    word: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 5,
      maxlength: 5,
    },
    used: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedOn: {
      type: Date,
      default: null,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ["ai"],
      default: "ai",
    },
  },
  {
    timestamps: false,
  }
);

WordSchema.index({ used: 1, addedAt: 1 });

export const Word = mongoose.model<IWord>("Word", WordSchema);
