const PROFANITY_BLOCKLIST = new Set([
  "BITCH", "PUSSY", "WHORE", "NIGGA", "NIGGER", "FUCKS", "CUNTS",
]);

export function isValidWord(word: string): boolean {
  const upper = word.toUpperCase().trim();

  if (upper.length !== 5) return false;
  if (!/^[A-Z]{5}$/.test(upper)) return false;
  if (PROFANITY_BLOCKLIST.has(upper)) return false;

  return true;
}

export function sanitizeWord(word: string): string {
  return word.toUpperCase().trim();
}
