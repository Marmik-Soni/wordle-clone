import type { CellColor } from "@wordle/shared";

export function calculateColors(guess: string, answer: string): CellColor[] {
  const result: CellColor[] = Array(5).fill("");
  const answerLetterCount: Record<string, number> = {};

  for (const letter of answer) {
    answerLetterCount[letter] = (answerLetterCount[letter] || 0) + 1;
  }

  // First pass — green
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "green";
      answerLetterCount[guess[i]]--;
    }
  }

  // Second pass — yellow and gray
  for (let i = 0; i < 5; i++) {
    if (result[i] === "green") continue;
    if (answer.includes(guess[i]) && answerLetterCount[guess[i]] > 0) {
      result[i] = "yellow";
      answerLetterCount[guess[i]]--;
    } else {
      result[i] = "gray";
    }
  }

  return result;
}
