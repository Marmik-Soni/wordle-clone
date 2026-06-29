# Architecture

> How the server is structured and how a request flows through it end-to-end.

---

## High-Level Overview

```
Client (Browser / Mobile)
        │
        │  HTTP/HTTPS
        ▼
┌─────────────────────────────────────────────────────────┐
│                     Express Server                       │
│                                                          │
│  helmet() → cors() → json() → [route middleware] →      │
│  [controller] → [service] → [MongoDB]                   │
│                                                          │
│  Error path: any throw → errorHandler middleware        │
└─────────────────────────────────────────────────────────┘
        │
        │  Mongoose ODM
        ▼
┌──────────────────┐       ┌─────────────────────────┐
│    MongoDB        │       │   In-Memory Cache        │
│                  │       │                          │
│  users           │       │  answerWords.json        │
│  gamesessions    │       │  validWords.json         │
│  words           │       │  dailyWord (per-day)     │
│  refreshtokens   │       │                          │
└──────────────────┘       └─────────────────────────┘
        ▲
        │  node-cron (2 scheduled jobs)
        │
┌──────────────────┐       ┌─────────────────────────┐
│  Daily Word Cron │       │  Word Refill Cron        │
│  18:30 UTC daily │       │  02:00 UTC daily         │
│  Clears cache    │       │  Calls Gemini API        │
└──────────────────┘       └─────────────────────────┘
```

---

## Bootstrap Sequence

When the server starts (`node dist/index.js` or `nodemon`), this exact sequence runs:

```
1. Zod validates all env vars → process.exit(1) if any invalid
2. Express app created
3. helmet()         — sets 12 security headers
4. cors()           — restricts origins to ALLOWED_ORIGINS
5. express.json()   — parses JSON bodies, max 10 KB
6. GET /health      — registered (no auth)
7. /api-docs        — swagger UI behind Basic Auth
8. /api/auth        — auth routes (rate-limited)
9. /api/user        — user routes (JWT-protected)
10. /api/game       — game routes (optionalAuth / rate-limited)
11. /api/words      — words routes (x-admin-key protected)
12. notFoundHandler — 404 catch-all
13. errorHandler    — centralised error → HTTP response

14. bootstrap() called:
    a. connectDB()        — connects Mongoose to MongoDB
    b. logWordListStats() — logs word list sizes (no DB)
    c. startCronJobs()    — registers 2 cron schedules
    d. app.listen()       — opens port
```

---

## Request Lifecycle

Every non-health request follows this path:

```
Request arrives
      │
      ├─ helmet()            adds security headers to response
      ├─ cors()              checks Origin header, rejects if not allowed
      ├─ express.json()      parses body, rejects if > 10 KB or malformed
      │
      ├─ [route-level middleware applied in this order]:
      │    1. Rate limiter (if applicable)
      │    2. Auth middleware (requireAuth / optionalAuth / adminAuth)
      │
      ├─ Controller function (wrapped in catchAsync)
      │    │
      │    ├─ Input validation (manual checks)
      │    ├─ Service call(s)
      │    │    └─ DB queries / in-memory operations
      │    └─ res.json(...)  ← success response
      │
      └─ [if any throw occurs]
           └─ errorHandler   maps error type → HTTP status + JSON body
```

---

## Layer Responsibilities

### Routes (`/routes`)
- Mount middleware on specific HTTP methods and paths
- Own no business logic
- Pass control to a controller via `catchAsync(fn)`

### Controllers (`/controllers`)
- Parse and validate request inputs (body, params, query)
- Call one or more services
- Return a JSON response
- **Never** contain database queries directly

### Services (`/services`)
- All business logic lives here
- May call multiple models or other services
- Return plain JavaScript objects, **never** raw Mongoose documents to controllers

### Models (`/models`)
- Mongoose schemas only — shape + validation + indexes
- No business logic (computed props or custom methods are minimal)

### Middleware (`/middleware`)
- Cross-cutting concerns: auth, rate limiting, error handling
- Must call `next()` or respond — never both

### Config (`/config`)
- Singletons: env (parsed once), db connection, swagger spec
- Imported throughout the app, never mutated after startup

---

## Statefulness

The server is largely **stateless** between requests, with these exceptions:

| State | Where | Lifetime |
|---|---|---|
| DB connection | `config/db.ts` `isConnected` flag | Process lifetime |
| Daily word cache | `dailyWord.service.ts` module-level `cache` | Until midnight IST cron fires |
| Word lists | `wordList.service.ts` `answerWords` / `validWords` arrays | Process lifetime (JSON loaded at startup) |

All other state (sessions, tokens, user data) lives in MongoDB.

---

## Error Strategy

All errors flow through the central `errorHandler` middleware. There are two error categories:

**Operational errors** (`AppError` subclasses) — expected failure cases:
- Invalid input, not found, unauthorized, conflict, etc.
- Thrown anywhere with `throw new BadRequestError(...)` etc.
- Always reach the user with a structured `{ error: { message, code } }` body

**Unexpected errors** — unhandled programming errors or infrastructure failures:
- Caught by `catchAsync` → forwarded to `errorHandler` via `next(err)`
- Mongoose errors (CastError, ValidationError, duplicate key) are mapped to appropriate HTTP codes
- Truly unknown errors return `500 INTERNAL_ERROR` — with full stack logged to Winston, **not** sent to the client

---

## Word System Design

The game's word system has **two layers**:

### Layer 1 — Static word lists (files on disk)
```
data/answerWords.json   ~2,300 words  — possible daily answers
data/validWords.json    ~12,000 words — accepted guesses that are not answers
```
- Loaded into memory on startup via `wordList.service.ts`
- The daily answer is picked deterministically: `answerWords[dayIndex % answerWords.length]`
- `dayIndex` = days since June 19, 2021 (original Wordle epoch)
- `isValidGuess()` checks both sets — zero DB queries per guess validation

### Layer 2 — Dynamic word pool (MongoDB `words` collection)
```
words collection → documents with { word, used, usedOn, addedAt, source }
```
- Populated by the AI pipeline (`wordPipeline.service.ts` + Gemini API)
- Used as a **backup/extended** dictionary for future game days
- `checkAndRefillWords()` is called daily at 2 AM UTC — tops up the pool when below threshold

> **Key insight:** Layer 1 handles all real-time game validation (fast, no DB). Layer 2 is the auto-growing supply of future daily words.

---

## Security Model

| Threat | Mitigation |
|---|---|
| XSS / clickjacking | `helmet()` sets `X-Frame-Options`, `X-Content-Type-Options`, CSP, etc. |
| CSRF | CORS origin whitelist + Bearer token auth (not cookies) |
| Brute-force login | `authRateLimiter`: 10 attempts / 15 min per IP |
| Guess automation | `guessRateLimiter`: 30 guesses / 10 min per IP |
| Token theft | Short-lived access tokens (15 min) + rotating refresh tokens |
| Refresh token replay | Tokens stored as SHA-256 hashes in DB; deleted on use or logout |
| Timing attacks | `crypto.timingSafeEqual` for admin key and swagger password checks |
| API key in logs | Gemini key passed in `x-goog-api-key` header, never in URL |
| Unauthenticated admin | `adminAuth` middleware on all `/api/words/*` routes |
| Secret leakage | Zod validation at startup ensures all required secrets are present |
