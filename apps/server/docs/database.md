# Database

> MongoDB schemas, indexes, relationships, and design decisions for all four collections.

---

## Collections Overview

| Collection | Model File | Purpose |
|---|---|---|
| `users` | `models/User.ts` | User accounts and game statistics |
| `gamesessions` | `models/GameSession.ts` | One record per user+day (or guest+day) |
| `words` | `models/Word.ts` | AI-populated word pool |
| `refreshtokens` | `models/RefreshToken.ts` | Hashed refresh tokens for revocation |

---

## `users` Collection

### Schema

```typescript
{
  email: string           // Unique, lowercase, trimmed. Indexed by Mongoose unique: true.
  passwordHash: string    // bcrypt hash (cost 12). NEVER store plaintext.
  createdAt: Date         // Auto-set by timestamps: true
  updatedAt: Date         // Auto-set by timestamps: true
  stats: {
    gamesPlayed: number         // Total games started
    gamesWon: number            // Total games won
    currentStreak: number       // Consecutive winning days
    maxStreak: number           // All-time best streak
    lastPlayedDate: Date | null // Last day the user completed a game
    guessDistribution: {
      "1": number   // Wins on guess 1
      "2": number   // Wins on guess 2
      "3": number   // Wins on guess 3
      "4": number   // Wins on guess 4
      "5": number   // Wins on guess 5
      "6": number   // Wins on guess 6
    }
  }
}
```

### Indexes
| Field | Type | Reason |
|---|---|---|
| `email` | unique | Enforces one account per email, speeds up login lookup |

### Design Notes
- `email` is stored lowercase regardless of what the user typed — enforced at the schema level (`lowercase: true`) **and** in the controller (`email.toLowerCase()`)
- `passwordHash` is never selected/returned in API responses; the controller explicitly selects only `email stats createdAt`
- `guessDistribution` uses string keys (`"1"` through `"6"`) because MongoDB doesn't support integer keys in embedded documents — the TypeScript interface mirrors this
- `lastPlayedDate` is a `Date` object — the streak logic extracts the `YYYY-MM-DD` portion for day comparison

---

## `gamesessions` Collection

### Schema

```typescript
{
  userId: ObjectId | null    // References users._id. null for guest sessions.
  wordId: ObjectId | null    // References words._id (the daily answer's Word doc). Legacy field.
  date: string               // "YYYY-MM-DD" — which day's puzzle this session is for
  guesses: string[]          // Uppercase 5-letter words in submission order. Max 6.
  completed: boolean         // true when game is over (won or failed all guesses)
  won: boolean               // true if the player guessed correctly
  guessCount: number | null  // Number of guesses used on a win, null on a loss or in-progress
  completedAt: Date | null   // Timestamp of game completion, null if still playing
  createdAt: Date            // Auto-set by timestamps: true
  updatedAt: Date            // Auto-set by timestamps: true
}
```

### Indexes
| Fields | Type | Query it enables |
|---|---|---|
| `userId` | single | Find all sessions for a user |
| `date` | single | Find all sessions for a given day |
| `{ userId: 1, date: 1 }` | compound | "Find today's session for this user" — the most common query |
| `{ date: 1, completed: 1 }` | compound | Admin queries: sessions by day and completion status |

### Validation
The `guesses` array has a Mongoose schema validator:
```typescript
validator: (v: string[]) => v.length <= 6,
message: "Cannot have more than 6 guesses"
```
This is a **belt and suspenders** check — the service layer enforces `session.guesses.length >= 6` before saving.

### Guest vs. Auth Sessions
- **Authenticated**: `userId` = user's ObjectId. Only one session per user per date (enforced by application logic, not a unique index).
- **Guest**: `userId` = `null`. Identified by the session's `_id` (ObjectId). The client must store this `sessionId` to resume the session.

### Why `guesses` Stores Strings (Not Colors)
Colors are **computed on read** by `calculateColors(guess, dailyWord)`. Storing them would:
1. Create redundancy — the answer is implicit in the colors
2. Break if the answer changes (though the daily answer never changes mid-day)
3. Add unnecessary bytes to every document

The trade-off is a tiny CPU cost on read, which is negligible for 6 words.

---

## `words` Collection

### Schema

```typescript
{
  word: string      // Uppercase 5-letter word. Unique. Trimmed.
  used: boolean     // false = available for future daily puzzles. true = already used as daily answer.
  usedOn: Date | null // When this word was used as the daily answer.
  addedAt: Date     // When this word was added to the pool (default: Date.now).
  source: "ai"      // Enum — currently only "ai" (Gemini). Reserved for future sources.
}
```

### Indexes
| Fields | Type | Query it enables |
|---|---|---|
| `word` | unique | Prevent duplicates; fast word lookup |
| `used` | single | Filter unused words |
| `{ used: 1, addedAt: 1 }` | compound | "Get oldest unused words" — efficient for daily selection |

### Design Notes
- `timestamps: false` — this collection uses `addedAt` instead of the automatic `createdAt`/`updatedAt` to match domain semantics
- The `word` field uses Mongoose's `uppercase: true` and `trim: true` — normalisation at the schema level means the service doesn't need to worry about casing

### Word Pool vs. Static Word Lists
This collection is **separate** from `data/answerWords.json`. The static JSON file is used for live game validation (zero DB queries). The `words` collection is the **growing supply** of future answer candidates fetched from Gemini.

---

## `refreshtokens` Collection

### Schema

```typescript
{
  userId: ObjectId    // References users._id. Indexed for "delete all tokens for this user".
  tokenHash: string   // SHA-256 hex of the refresh token. Unique. Never store plaintext.
  expiresAt: Date     // Parsed from JWT_REFRESH_EXPIRES_IN. Used by TTL index.
  createdAt: Date     // Auto-set by timestamps: true
  updatedAt: Date     // Auto-set by timestamps: true
}
```

### Indexes
| Fields | Type | Query it enables |
|---|---|---|
| `userId` | single | Delete all tokens for a user (account deletion, security wipe) |
| `tokenHash` | unique | Fast O(1) token lookup on `/refresh` |
| `{ expiresAt: 1 }` | TTL (`expireAfterSeconds: 0`) | Auto-deletes expired documents |

### TTL Index
The `{ expiresAt: 1 }` index is created with `expireAfterSeconds: 0`, which tells MongoDB's TTL thread to delete documents where `expiresAt < now`. This runs approximately every 60 seconds.

This means you **never need to manually clean up** expired refresh tokens — they self-delete.

### Why Hash, Not Plaintext?
A database breach of the `refreshtokens` collection must not give an attacker valid sessions. By storing `SHA-256(token)` instead of the token itself:

- The attacker gets a list of hashes
- SHA-256 is a one-way function — they cannot recover the original JWTs
- The attacker cannot use those hashes to authenticate (the server hashes the incoming token and looks it up — they'd need the original token, not the hash)

---

## Relationships

```
users (1) ──────────────── (N) gamesessions
                                   userId → users._id (nullable)

users (1) ──────────────── (N) refreshtokens
                                   userId → users._id

gamesessions (N) ──────── (1) words
                                   wordId → words._id (nullable, legacy)
```

> `wordId` in `gamesessions` is a legacy reference — the daily word is now looked up by the static word list + date math, not by joining to the `words` collection. The field is preserved for historical session data.

---

## MongoDB Recommendations

### For Development
Use the local Docker instance from `docker-compose.yml`. The `wordle-clone` database and all collections are created automatically by Mongoose on first use.

### For Production (MongoDB Atlas)
- Use a **dedicated cluster** (M10 or higher) with replica set enabled
- Enable **IP Access List** — only allow your server's IP(s)
- Use a **database user** with minimum required permissions (`readWrite` on `wordle-clone` database only)
- Enable **Atlas Backup** — at minimum daily snapshots
- Monitor the `gamesessions` collection size — at scale, consider a TTL index to auto-delete sessions older than 90 days

### Index Maintenance
Mongoose creates indexes automatically on startup. In production with large collections, this can cause a write lock. Disable auto-index and manage indexes manually:

```typescript
// In production, set autoIndex: false
await mongoose.connect(uri, { autoIndex: false });
```

Then create/verify indexes via the MongoDB shell or Atlas UI.
