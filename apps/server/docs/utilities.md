# Utilities Reference

> Internal helper modules in `src/utils/`. These are shared across controllers, services, and middleware.

---

## `errors.ts` — Typed Error Hierarchy

**Purpose:** Provides a class hierarchy of operational errors so that throwing an error anywhere in the codebase produces a consistent, structured HTTP response.

### `AppError` (base class)

```typescript
class AppError extends Error {
  statusCode: number;  // HTTP status code
  code: string;        // Machine-readable error code (e.g. "UNAUTHORIZED")
  isOperational: true; // Always true — used to distinguish from programming errors
}
```

The `errorHandler` middleware checks `err instanceof AppError` first. If true, it trusts the error's `statusCode` and `code` completely and forwards them to the response.

### Subclasses

All subclasses have sensible defaults for `message` and `code` that can be overridden.

| Class | Status | Default Code |
|---|---|---|
| `BadRequestError` | 400 | `BAD_REQUEST` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `GoneError` | 410 | `GONE` |
| `UnprocessableEntityError` | 422 | `UNPROCESSABLE_ENTITY` |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` |
| `BadGatewayError` | 502 | `BAD_GATEWAY` |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` |

### Usage Pattern

```typescript
// With default message and code
throw new NotFoundError();
// → 404 { error: { message: "Resource not found", code: "NOT_FOUND" } }

// With custom message and code
throw new ConflictError("Email already registered", "EMAIL_ALREADY_EXISTS");
// → 409 { error: { message: "Email already registered", code: "EMAIL_ALREADY_EXISTS" } }

// As a guard
if (!session) throw new NotFoundError("Game session not found", "SESSION_NOT_FOUND");
```

### Why Not HTTP Libraries?

Using a custom class hierarchy instead of a library like `http-errors` means:
- Full TypeScript typing without extra `@types` packages
- The `code` field (machine-readable) is first-class, not an afterthought
- `isOperational: true` is a documented property for future monitoring code
- The `errorHandler` cascade is explicit and auditable in one file

---

## `jwt.ts` — JWT Helpers

**Purpose:** Thin wrappers around `jsonwebtoken` that centralise key/expiry configuration and add the `hashToken` utility.

### Functions

```typescript
// Create a 15-minute (default) access token
signAccessToken(payload: TokenPayload): string

// Create a 7-day (default) refresh token
signRefreshToken(payload: TokenPayload): string

// Verify access token — throws TokenExpiredError or JsonWebTokenError on failure
verifyAccessToken(token: string): TokenPayload

// Verify refresh token — same throw behaviour
verifyRefreshToken(token: string): TokenPayload

// SHA-256 hash a token string for safe DB storage
hashToken(token: string): string
```

### `TokenPayload` Interface

```typescript
interface TokenPayload {
  userId: string;  // MongoDB ObjectId as string
  email: string;   // User's email address
}
```

### Why `hashToken` Uses SHA-256

SHA-256 is a fast, deterministic, one-way cryptographic hash. Properties relevant here:

- **One-way:** Given the hash, you cannot recover the original token
- **Deterministic:** Same token always produces same hash — enables DB lookup
- **Fast:** O(1) for a fixed-length JWT string — no performance concern
- **Collision-resistant:** Two different tokens will not produce the same hash

bcrypt is not used here (unlike passwords) because bcrypt is intentionally *slow* and also *random* (different salt each time, so non-deterministic — you can't look up "the token with this hash").

---

## `catchAsync.ts` — Async Error Bridge

**Purpose:** Bridge async Express handlers into Express's synchronous error-handling pipeline.

```typescript
export function catchAsync<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: TReq, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
```

**The problem it solves:**

Express's `next(err)` mechanism only works synchronously out of the box. If an `async` function throws, the rejection is unhandled unless you catch it:

```typescript
// Without catchAsync — unhandled rejection, crashes the process or hangs:
router.get("/foo", async (req, res) => {
  const data = await someAsyncThing(); // throws!
  res.json(data);
});

// With catchAsync — error goes to errorHandler:
router.get("/foo", catchAsync(async (req, res) => {
  const data = await someAsyncThing(); // throws!
  res.json(data);
}));
```

**The generic `<TReq extends Request>`:**

Without the generic, passing an `AuthRequest`-typed function would be a TypeScript error because `AuthRequest extends Request` (has an extra `user` field). The generic allows callers to pass subtypes:

```typescript
// This works cleanly with the generic:
router.get("/stats", requireAuth, catchAsync<AuthRequest>(getStats));
// getStats: (req: AuthRequest, res: Response) => Promise<void>
```

---

## `colorCalculator.ts` — Wordle Color Logic

**Purpose:** Given a guess and the correct answer, compute the `green` / `yellow` / `gray` colour for each of the 5 letter positions.

```typescript
export function calculateColors(guess: string, answer: string): CellColor[]
// CellColor = "green" | "yellow" | "gray"
```

### Algorithm

The naive "yellow if in word" logic breaks on duplicate letters. The correct algorithm is a **two-pass approach**:

**Pass 1 — Greens only:**
```
For i in 0..4:
  if guess[i] === answer[i]:
    result[i] = "green"
    answerLetterCount[guess[i]] -= 1  ← "consume" this letter from the pool
```

**Pass 2 — Yellow and Gray:**
```
For i in 0..4:
  if result[i] === "green": continue  ← already handled
  if answer contains guess[i] AND answerLetterCount[guess[i]] > 0:
    result[i] = "yellow"
    answerLetterCount[guess[i]] -= 1  ← "consume" from remaining pool
  else:
    result[i] = "gray"
```

### Why Two Passes?

Consider: answer = `"SPEED"`, guess = `"EERIE"`

| Position | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Guess | E | E | R | I | E |
| Answer | S | P | E | E | D |

- `E` appears 2 times in answer (`SPEED`), 3 times in guess (`EERIE`)
- Pass 1: no greens (no exact position matches)
- Pass 2: position 0 (E) → `answerLetterCount['E'] = 2 > 0` → **yellow**, count = 1
- Pass 2: position 1 (E) → `answerLetterCount['E'] = 1 > 0` → **yellow**, count = 0
- Pass 2: position 2 (R) → R not in answer → **gray**
- Pass 2: position 3 (I) → I not in answer → **gray**
- Pass 2: position 4 (E) → `answerLetterCount['E'] = 0` → **gray** (pool exhausted)

Result: `["yellow", "yellow", "gray", "gray", "gray"]` — exactly 2 yellows for the 2 E's in the answer. ✅

---

## `wordValidator.ts` — Word Format and Profanity Check

**Purpose:** Validate that a string is a legal 5-letter Wordle guess before any DB interaction.

```typescript
export function isValidWord(word: string): boolean
// Returns true if word is exactly 5 uppercase A-Z letters and not in the profanity blocklist

export function sanitizeWord(word: string): string
// Uppercase + trim — call this BEFORE isValidWord
```

### Validation Rules

```
1. Length check: word.length === 5
2. Format check: /^[A-Z]{5}$/  (letters only, exactly 5, already uppercased)
3. Profanity check: not in PROFANITY_BLOCKLIST Set
```

### Usage Order

```typescript
const sanitized = sanitizeWord(userInput);   // "crane" → "CRANE"
if (!isValidWord(sanitized)) {
  throw new BadRequestError("Guess must be exactly 5 alphabetic characters");
}
if (!isValidGuess(sanitized)) {              // from wordList.service.ts
  throw new UnprocessableEntityError("Word not in dictionary");
}
```

The **format check** (`isValidWord`) happens before the **dictionary check** (`isValidGuess`) because:
1. Format failures are caught by a fast regex — no set lookup needed
2. The error messages differ: format error → `400 INVALID_GUESS_FORMAT`, not-in-dictionary → `422 WORD_NOT_IN_DICTIONARY`

### Profanity Blocklist

A small hardcoded `Set` of uppercase 5-letter words that should never appear as valid game words. Currently minimal — extend it as needed or swap for the `bad-words` npm package for a comprehensive list.

```typescript
const PROFANITY_BLOCKLIST = new Set([
  "BITCH", "PUSSY", "WHORE", "NIGGA", "NIGGER", "FUCKS", "CUNTS",
]);
```

---

## `logger.ts` — Winston Logger

**Purpose:** A configured Winston logger singleton used throughout the entire server.

```typescript
export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: env.NODE_ENV === "production" ? winston.format.json() : devFormat,
  transports: [new winston.transports.Console()],
});
```

### Log Levels

| Level | When Used | Example |
|---|---|---|
| `debug` | Detailed diagnostic info (dev only) | Internal state, timing |
| `info` | Normal application events | User logged in, game started |
| `warn` | Unexpected but handled situations | Failed login, low word pool |
| `error` | Errors requiring attention | DB failure, unhandled exception |

In production (`NODE_ENV=production`), only `info` and above are emitted. `debug` messages are silently dropped.

### Dev Format

```
ℹ️   [10:30:00] 🚀 Server running on port 5000 in development mode
⚠️   [10:30:15] ⚠️  Failed login attempt - wrong password for: test@test.com
❌  [10:30:20] ❌ Unhandled error
   {
     "error": "Cannot read property of undefined",
     "stack": "TypeError: ..."
   }
```

### Production Format (JSON)

```json
{"level":"info","message":"🚀 Server running on port 5000 in production mode","timestamp":"10:30:00"}
{"level":"warn","message":"⚠️  Failed login attempt","timestamp":"10:30:15"}
```

Machine-parseable JSON makes it trivial to ingest into Datadog, Loki, CloudWatch, or any log aggregation system.

### Usage

```typescript
import { logger } from "../utils/logger.js";

logger.info("Something happened");
logger.warn("Something unexpected", { context: "extra data" });
logger.error("Something broke", { error: err.message, stack: err.stack });
logger.debug("Only visible in dev", { payload });
```

The `meta` object (second argument) is serialised alongside the message in both formats.

---

## Shared Package — `@wordle/shared`

**Location:** `packages/shared/src/`  
**Consumed by:** Both `apps/server` and `apps/client`

```typescript
// packages/shared/src/types/
export type CellColor = "green" | "yellow" | "gray";

export interface GuessResult {
  guess: string;
  colors: CellColor[];
}

export type GameStatus = "playing" | "won" | "lost";
```

These types are the **contract** between the client and server. When the server sends a `GuessResult` in the API response, the client can import `GuessResult` from `@wordle/shared` and get full type safety without duplicating the type definition.

**Import in server:**
```typescript
import type { GuessResult, GameStatus, CellColor } from "@wordle/shared";
```

The workspace alias `@wordle/shared` is resolved by pnpm workspaces — no publishing to npm required.
