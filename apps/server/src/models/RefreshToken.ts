import mongoose, { Document, Schema } from "mongoose";

export interface IRefreshToken extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string; // SHA-256 hash of the actual token — never store plaintext
  createdAt: Date;
  expiresAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically delete expired tokens from the collection
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>("RefreshToken", RefreshTokenSchema);
