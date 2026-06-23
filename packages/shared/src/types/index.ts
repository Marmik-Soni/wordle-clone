// Shared types between client and server

export type CellColor = "green" | "yellow" | "gray" | "";

export type GameStatus = "idle" | "playing" | "won" | "lost";

export interface GuessResult {
  guess: string;
  colors: CellColor[];
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
}

export interface DailyWordMeta {
  date: string;       // "YYYY-MM-DD"
  wordNumber: number; // puzzle number, like NYT does
}
