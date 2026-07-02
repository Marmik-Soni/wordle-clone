import mongoose, { Document, Schema } from "mongoose";

export interface IGameSession extends Document {
  userId: mongoose.Types.ObjectId | null;
  /**
   * Stored for historical audit ("which word was this session playing?").
   * At runtime, the daily word is resolved from the in-memory cache
   * (getDailyWord()) — NOT populated from this field.
   */
  wordId: mongoose.Types.ObjectId | null;
  date: string;
  guesses: string[];
  completed: boolean;
  won: boolean;
  guessCount: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

const GameSessionSchema = new Schema<IGameSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    wordId: {
      type: Schema.Types.ObjectId,
      ref: "Word",
      required: false,
      default: null,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    guesses: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 6,
        message: "Cannot have more than 6 guesses",
      },
    },
    completed: {
      type: Boolean,
      default: false,
    },
    won: {
      type: Boolean,
      default: false,
    },
    guessCount: {
      type: Number,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

GameSessionSchema.index({ userId: 1, date: 1 });
GameSessionSchema.index({ date: 1, completed: 1 });

export const GameSession = mongoose.model<IGameSession>("GameSession", GameSessionSchema);
