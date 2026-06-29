# API Reference

> Base URL: `http://localhost:5000` (dev) / `https://api.your-domain.com` (prod)
>
> All request bodies must be `Content-Type: application/json`.  
> All responses are `Content-Type: application/json`.

---

## Response Envelope

### Success
Responses vary by endpoint. All are flat JSON objects — no universal wrapper.

### Error
Every error response — regardless of status code — has this shape:

```json
{
  "error": {
    "message": "Human-readable explanation",
    "code": "MACHINE_READABLE_CODE"
  }
}
```

### Common Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or malformed request field |
| 400 | `INVALID_GUESS_FORMAT` | Guess is not exactly 5 letters |
| 400 | `INVALID_SESSION_ID` | SessionId is not a valid ObjectId |
| 400 | `REFRESH_TOKEN_REQUIRED` | Refresh endpoint called without token |
| 400 | `MALFORMED_JSON` | Request body is not valid JSON |
| 401 | `UNAUTHORIZED` | No or invalid access token |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `REFRESH_TOKEN_EXPIRED` | Refresh token past its expiry |
| 401 | `REFRESH_TOKEN_INVALID` | Refresh token signature invalid |
| 401 | `REFRESH_TOKEN_REVOKED` | Refresh token was logged out |
| 401 | `ADMIN_KEY_MISSING` | x-admin-key header not provided |
| 403 | `FORBIDDEN` | Valid auth, but wrong user for this resource |
| 403 | `ADMIN_KEY_INVALID` | x-admin-key header value is wrong |
| 404 | `NOT_FOUND` | Resource does not exist |
| 404 | `ROUTE_NOT_FOUND` | No route matches the URL |
| 404 | `SESSION_NOT_FOUND` | Game session ID doesn't exist |
| 409 | `EMAIL_ALREADY_EXISTS` | Email already registered |
| 409 | `GAME_ALREADY_COMPLETED` | Session is finished, no more guesses |
| 409 | `MAX_GUESSES_EXCEEDED` | Already used all 6 guesses |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds 10 KB |
| 422 | `WORD_NOT_IN_DICTIONARY` | Guess word is not a valid Wordle word |
| 429 | `TOO_MANY_REQUESTS` | Rate limit hit |
| 503 | `PIPELINE_DISABLED` | GOOGLE_AI_API_KEY not configured |
| 503 | `DB_UNAVAILABLE` | MongoDB unreachable |
| 502 | `AI_PROVIDER_ERROR` | Gemini API call failed |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Endpoints

---

### `GET /health`

Public health check. Returns immediately without hitting the database.

**Request:** No body, no auth.

**Response `200`:**
```json
{ "status": "ok" }
```

---

## Auth — `/api/auth`

Rate limited: **10 requests / 15 minutes per IP** on `POST /register` and `POST /login`.

---

### `POST /api/auth/register`

Register a new user account.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "mypassword123"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required. Must match `a@b.c` pattern. Stored lowercase. |
| `password` | string | Required. Minimum 8 characters. |

**Response `201`:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": "6682a1b2c3d4e5f6a7b8c9d0",
    "email": "user@example.com",
    "stats": {
      "gamesPlayed": 0,
      "gamesWon": 0,
      "currentStreak": 0,
      "maxStreak": 0,
      "lastPlayedDate": null,
      "guessDistribution": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 }
    }
  }
}
```

**Error responses:** `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_EXISTS`, `429 TOO_MANY_REQUESTS`

---

### `POST /api/auth/login`

Authenticate with email and password.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "mypassword123"
}
```

**Response `200`:** Same shape as `/register` response.

**Error responses:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_REQUESTS`

> **Note:** Both "user not found" and "wrong password" return `401 INVALID_CREDENTIALS` to prevent user enumeration.

---

### `POST /api/auth/refresh`

Exchange a valid refresh token for a new access token and a new refresh token (rotation).

**Request body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Response `200`:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...(new)",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9...(new, different)"
}
```

**Error responses:** `400 REFRESH_TOKEN_REQUIRED`, `401 REFRESH_TOKEN_EXPIRED`, `401 REFRESH_TOKEN_INVALID`, `401 REFRESH_TOKEN_REVOKED`

> **Important:** The old refresh token is **immediately invalidated** after a successful refresh. Store the new tokens. Replaying an old refresh token returns `401 REFRESH_TOKEN_REVOKED`.

---

### `POST /api/auth/logout`

Invalidate the current refresh token on the server.

**Request body (optional):**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

If `refreshToken` is provided, it is deleted from the database. Subsequent `/refresh` calls with this token will return `401 REFRESH_TOKEN_REVOKED`.

If no token is provided, the call still succeeds (idempotent). The client should discard stored tokens regardless.

**Response `200`:**
```json
{ "message": "Logged out successfully" }
```

---

## User — `/api/user`

All routes require a valid access token: `Authorization: Bearer <accessToken>`.

---

### `GET /api/user/stats`

Get the authenticated user's profile and game statistics.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

**Response `200`:**
```json
{
  "user": {
    "_id": "6682a1b2c3d4e5f6a7b8c9d0",
    "email": "user@example.com",
    "createdAt": "2026-06-19T00:00:00.000Z",
    "stats": {
      "gamesPlayed": 42,
      "gamesWon": 35,
      "currentStreak": 7,
      "maxStreak": 15,
      "lastPlayedDate": "2026-06-28T00:00:00.000Z",
      "guessDistribution": {
        "1": 1,
        "2": 5,
        "3": 12,
        "4": 10,
        "5": 5,
        "6": 2
      }
    }
  }
}
```

**Error responses:** `401 UNAUTHORIZED`, `404 USER_NOT_FOUND`

---

## Game — `/api/game`

Game routes support both authenticated and guest users. The `optionalAuth` middleware reads the `Authorization` header if present but doesn't require it.

---

### `GET /api/game/today`

Get today's puzzle metadata. Does **not** reveal the answer word.

**Auth:** Not required.

**Response `200`:**
```json
{
  "date": "2026-06-29",
  "wordNumber": 1837
}
```

| Field | Description |
|---|---|
| `date` | Today's date in `YYYY-MM-DD` format (UTC) |
| `wordNumber` | Days since the original Wordle launch (June 19, 2021). Puzzle #1 = first day. |

---

### `GET /api/game/session`

Get or create today's game session. Returns the full session state including all guesses made so far (with colors).

**Auth:** Optional. Provide a Bearer token for authenticated sessions, or `?sessionId=` for guest session resumption.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `sessionId` | string (ObjectId) | Optional. Guest session ID from a previous call. Only valid for today's date. |

**Examples:**
```
GET /api/game/session                              ← creates a new guest session
GET /api/game/session?sessionId=6682a1b2c3...     ← resumes existing guest session
GET /api/game/session  + Authorization header     ← loads/creates auth user session
```

**Response `200`:**
```json
{
  "session": {
    "sessionId": "6682a1b2c3d4e5f6a7b8c9d0",
    "date": "2026-06-29",
    "wordNumber": 1837,
    "guesses": [
      {
        "guess": "CRANE",
        "colors": ["gray", "yellow", "green", "gray", "gray"]
      }
    ],
    "completed": false,
    "won": false,
    "remainingGuesses": 5,
    "status": "playing"
  }
}
```

**Session fields:**

| Field | Type | Description |
|---|---|---|
| `sessionId` | string | MongoDB ObjectId. Store this for guest session resumption. |
| `date` | string | `YYYY-MM-DD` — the puzzle date this session belongs to |
| `wordNumber` | number | Which Wordle puzzle number this is |
| `guesses` | array | All guesses made so far, each with `guess` word and `colors` array |
| `completed` | boolean | `true` when game is over (won or lost) |
| `won` | boolean | `true` if the user guessed correctly |
| `remainingGuesses` | number | 0–6, decrements with each guess |
| `status` | `"playing"` \| `"won"` \| `"lost"` | Game state |

**Color values in `guesses[].colors`:**

| Value | Meaning |
|---|---|
| `"green"` | Correct letter, correct position |
| `"yellow"` | Letter exists in word, wrong position |
| `"gray"` | Letter not in word |

**Error responses:** `400 INVALID_SESSION_ID`

---

### `POST /api/game/guess`

Submit a guess for the current puzzle.

**Auth:** Optional. Rate limited: **30 requests / 10 minutes per IP**.

**Request body:**
```json
{
  "sessionId": "6682a1b2c3d4e5f6a7b8c9d0",
  "guess": "CRANE"
}
```

| Field | Type | Rules |
|---|---|---|
| `sessionId` | string | Required. Valid MongoDB ObjectId. |
| `guess` | string | Required. Exactly 5 letters A–Z (case-insensitive, sanitized to uppercase). |

**Response `200` — still playing:**
```json
{
  "result": {
    "guess": "CRANE",
    "colors": ["gray", "yellow", "green", "gray", "gray"]
  },
  "session": {
    "sessionId": "...",
    "date": "2026-06-29",
    "wordNumber": 1837,
    "guesses": [...],
    "completed": false,
    "won": false,
    "remainingGuesses": 4,
    "status": "playing"
  }
}
```

**Response `200` — game won:**
```json
{
  "result": { "guess": "LIGHT", "colors": ["green","green","green","green","green"] },
  "session": {
    "completed": true,
    "won": true,
    "remainingGuesses": 3,
    "status": "won",
    ...
  }
}
```

**Response `200` — game lost (6th wrong guess):**
```json
{
  "result": { "guess": "WRONG", "colors": [...] },
  "session": {
    "completed": true,
    "won": false,
    "remainingGuesses": 0,
    "status": "lost",
    ...
  },
  "correctWord": "LIGHT"
}
```

> `correctWord` is **only** present in the response when the game is lost. It is never sent while the game is in progress or after a win.

**Error responses:** `400 VALIDATION_ERROR`, `400 INVALID_GUESS_FORMAT`, `400 INVALID_SESSION_ID`, `403 FORBIDDEN`, `404 SESSION_NOT_FOUND`, `409 GAME_ALREADY_COMPLETED`, `409 MAX_GUESSES_EXCEEDED`, `422 WORD_NOT_IN_DICTIONARY`, `429 TOO_MANY_REQUESTS`

---

## Words — `/api/words`

**All routes require `x-admin-key` header.** See [Admin Guide](./admin-guide.md).

---

### `GET /api/words/count`

Get the number of unused words available in the word pool.

**Headers:**
```
x-admin-key: your_admin_api_key
```

**Response `200`:**
```json
{ "unusedWords": 487 }
```

---

### `POST /api/words/fetch`

Manually trigger the AI word pipeline to fetch and store new words.

**Headers:**
```
x-admin-key: your_admin_api_key
```

**Response `200`:**
```json
{
  "success": true,
  "result": {
    "fetched": 512,
    "validated": 498,
    "stored": 391,
    "duplicates": 107
  }
}
```

| Field | Description |
|---|---|
| `fetched` | Raw words returned by Gemini |
| `validated` | Words that passed the 5-letter + format check |
| `stored` | New words successfully written to MongoDB |
| `duplicates` | Words already in the database (skipped) |

**Error responses:** `401 ADMIN_KEY_MISSING`, `403 ADMIN_KEY_INVALID`, `503 PIPELINE_DISABLED`, `502 AI_PROVIDER_ERROR`

---

## Interactive API Docs

The full OpenAPI 3.0 spec is served at:

```
http://localhost:5000/api-docs
```

Protected by HTTP Basic Auth (`DOCS_USER` / `DOCS_PASSWORD`). The Swagger UI lets you try every endpoint directly from the browser, including setting the Bearer token for authenticated requests.
