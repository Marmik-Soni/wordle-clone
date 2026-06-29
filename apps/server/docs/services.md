# Services

> All business logic lives in the `services/` layer. Controllers call services. Services call models.

---

## `game.service.ts`

The core gameplay engine. Manages session lifecycle and guess validation.

### `getOrCreateSession(userId, guestSessionId)`

**Purpose:** Return the current day's game session for a user or guest. Creates a new one if none exists.

**Signature:**
```typescript
async function getOrCreateSession(
  userId: string | null,
  guestSessionId: string | null
): Promise<SessionState>
```

**Logic:**

```
1. Call getDailyWord() → get today's date string
2. if userId:
     Find GameSession where { userId, date: today }
   else if guestSessionId:
     Validate it's a valid ObjectId format
     Find GameSession by _id
     If found but wrong date → treat as expired (set to null)
3. If no session found:
     Create new GameSession { userId, date, guesses: [], ... }
4. Return buildSessionState(session, daily.word, daily.wordNumber)
```

**`buildSessionState` helper:**
- Runs `calculateColors(guess, dailyWord)` for every guess in the session
- Derives `status` from `completed` and `won` flags
- Computes `remainingGuesses = 6 - guesses.length`
- Returns a plain `SessionState` object (never the raw Mongoose document)

---

### `submitGuess(sessionId, guess, userId)`

**Purpose:** Process a single guess, update the session, and return the result.

**Signature:**
```typescript
async function submitGuess(
  sessionId: string,
  guess: string,
  userId: string | null
): Promise<{ result: GuessResult; sessionState: SessionState; correctWord?: string }>
```

**Validation pipeline:**

```
1. Validate sessionId is a valid ObjectId
2. Find GameSession by _id → 404 if not found
3. Check session.completed → 409 if already done
4. Check guesses.length >= 6 → 409 if maxed out
5. Check ownership:
     if session.userId exists AND userId !== session.userId → 403 FORBIDDEN
     (guest sessions: session.userId === null → skip check)
6. sanitizeWord(guess) → uppercase, trim
7. isValidWord(sanitized) → must be exactly 5 A-Z letters, not profanity → 400
8. isValidGuess(sanitized) → must be in answerWords or validWords set → 422
9. getDailyWord() → get the answer
10. calculateColors(sanitized, answer)
11. Determine isWin, isLastGuess, completed
12. Push guess to session.guesses
13. Update session.completed, won, guessCount, completedAt
14. session.save()
15. Return { result, sessionState, correctWord (only if lost) }
```

**Key design decision — in-memory dictionary check:**
Step 8 uses `isValidGuess()` from `wordList.service.ts` which checks two in-memory `Set<string>` objects. This is an O(1) lookup with **zero database round-trips**. The earlier implementation did `Word.findOne({ word: sanitized })` — a full DB query per guess.

---

## `user.service.ts`

Manages user statistics after a game completes.

### `updateUserStats(userId, won, guessCount, lastPlayedDate)`

**Signature:**
```typescript
async function updateUserStats(
  userId: string,
  won: boolean,
  guessCount: number | null,
  lastPlayedDate: string
): Promise<void>
```

**Streak logic:**
```
isConsecutiveDay = lastPlayed date is exactly 1 day before today
                 = today.getTime() - lastPlayed.getTime() === 86,400,000ms

if won:
  gamesWon += 1
  currentStreak = isConsecutiveDay ? currentStreak + 1 : 1
  maxStreak = max(maxStreak, currentStreak)
  guessDistribution[guessCount] += 1

if lost:
  currentStreak = 0   ← streak resets on any loss

lastPlayedDate = new Date(today)
gamesPlayed += 1      ← always incremented
```

**Idempotency note:** This is called once per game completion. The controller (`game.controller.ts`) checks `sessionState.completed && userId` before calling. However, because `updateUserStats` doesn't check if stats were already updated for a specific session, calling it twice for the same session would double-count. The guard in the controller prevents this.

**Why is this in its own file?**  
Originally `updateUserStats` was in `game.service.ts`, which caused a **circular dependency**:

```
game.service → User model
User model → (Mongoose, fine)
game.service → (also needed by game.controller)
game.controller → (needed updateUserStats from game.service)
```

The circular import required a runtime `dynamic import()` inside the hot path. Moving `updateUserStats` to `user.service.ts` (which only imports the `User` model) breaks the cycle.

---

## `dailyWord.service.ts`

In-memory cache for today's daily word. Zero database queries.

### `getDailyWord(): DailyWordCache`

**This is a synchronous function.** Do not `await` it.

```typescript
interface DailyWordCache {
  word: string;      // e.g. "LIGHT"
  date: string;      // e.g. "2026-06-29"
  wordNumber: number // e.g. 1837
}
```

**Cache behaviour:**
```
if cache exists AND cache.date === today:
  return cache  ← fast path, no computation

else:
  word = getAnswerForDate(today)        ← deterministic math
  wordNumber = getDayIndex(today) + 1
  cache = { word, date, wordNumber }
  logger.info("📅 Daily word for ... (puzzle #...)")  ← answer hidden in log
  return cache
```

The cache is a module-level variable reset to `null` by the midnight cron job.

### `clearDailyWordCache(): void`

Sets `cache = null`. Called by the 18:30 UTC cron job. Next call to `getDailyWord()` will recompute with tomorrow's word.

---

## `wordList.service.ts`

Loads and exposes the static word lists. Provides the day-index math for deterministic word selection.

### Word List Loading

```typescript
const answerWords: string[] = require("../data/answerWords.json");
const validWords: string[] = require("../data/validWords.json");

const ANSWER_SET = new Set<string>(answerWords);
const VALID_SET  = new Set<string>(validWords);
```

Both arrays and sets are loaded **once at module import time** and kept in memory for the process lifetime. The `Set` structures allow O(1) membership checks.

### `getAnswerForDate(dateString): string`

```typescript
const EPOCH = new Date("2021-06-19").getTime(); // Original Wordle launch
const MS_PER_DAY = 86_400_000;

function getDayIndex(dateString: string): number {
  return Math.floor((new Date(dateString).getTime() - EPOCH) / MS_PER_DAY);
}

function getAnswerForDate(dateString: string): string {
  return answerWords[getDayIndex(dateString) % answerWords.length];
}
```

**This produces the same word for the same date on any server instance, regardless of timezone, server restarts, or database state.** It's purely mathematical.

`wordNumber` = `getDayIndex(date) + 1` (1-indexed, so puzzle #1 = launch day).

### `isValidGuess(word): boolean`

Returns `true` if the uppercase word exists in either `ANSWER_SET` or `VALID_SET`. This is the single check used in `submitGuess` to validate dictionary membership.

### `logWordListStats(): void`

Logs the sizes of both loaded word lists. Called once from `bootstrap()` — not at import time (avoids module-level side effects that pollute test output).

---

## `wordPipeline.service.ts`

Manages the AI-powered word pool filling system.

### `runWordPipeline(requestedCount): Promise<PipelineResult>`

**Full pipeline:**

```
1. fetchWordsFromAI(requestedCount):
   a. Build a prompt requesting N unique 5-letter English words
   b. POST to Gemini API endpoint
      Header: "x-goog-api-key": GOOGLE_AI_API_KEY  (NOT in URL)
      Body: { contents, generationConfig: { temperature: 0.95, maxOutputTokens: 4096 } }
   c. Parse response text → split by newline
   d. Filter: /^[A-Z]{5}$/ — exactly 5 uppercase letters
   e. Return raw word array

2. Validate each raw word:
   sanitizeWord(word) → uppercase + trim
   isValidWord(sanitized) → 5 letters, A-Z only, not profanity

3. Store in MongoDB:
   for each valid word:
     Word.create({ word, source: "ai" })
     if duplicate key (11000): increment duplicates counter
     if other error: log warning, continue

4. Compute efficiency = stored / fetched * 100
5. Warn if efficiency < 30% (word pool may be exhausting)
6. Return { fetched, validated, stored, duplicates }
```

### `getUnusedWordCount(): Promise<number>`

```typescript
return Word.countDocuments({ used: false });
```

Used by both the admin `/api/words/count` endpoint and the refill check.

### `checkAndRefillWords(): Promise<void>`

Called by the daily cron job at 2 AM UTC:

```
1. count = getUnusedWordCount()
2. threshold = parseInt(env.WORD_REFILL_THRESHOLD)  // default 30
3. if count >= threshold: return  (no action needed)

4. if GOOGLE_AI_API_KEY not set:
     logger.warn("...skipping")
     return

5. existingTotal = Word.countDocuments({})
6. overlapRate = min(existingTotal / 5000, 0.8)
   (as the DB fills up, more AI-generated words will be duplicates)
7. requestCount = ceil(WORD_FETCH_COUNT / (1 - overlapRate))
   (ask for more words to compensate for expected duplicates)
8. runWordPipeline(requestCount)
```

**Overlap rate example:**
- DB has 1,000 words → overlapRate = 1000/5000 = 0.20 → request 500/(1-0.20) = **625 words** to net ~500 new
- DB has 3,000 words → overlapRate = 0.60 → request 500/(1-0.60) = **1,250 words** to net ~500 new
- DB has 4,500 words → overlapRate = capped at 0.80 → request 500/(1-0.80) = **2,500 words**
