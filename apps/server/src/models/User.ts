import mongoose, { Document, Schema } from "mongoose";

export interface IGuessDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
}

export interface IUserStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  lastPlayedDate: Date | null;
  guessDistribution: IGuessDistribution;
}

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  createdAt: Date;
  stats: IUserStats;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      gamesWon: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      maxStreak: { type: Number, default: 0 },
      lastPlayedDate: { type: Date, default: null },
      guessDistribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
        6: { type: Number, default: 0 },
      },
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", UserSchema);
