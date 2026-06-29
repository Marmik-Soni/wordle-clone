# Environment Variables Reference

> All variables are validated at startup by Zod. The server **exits immediately** if any required
> variable is missing or fails its constraint. This prevents silent misconfigurations in production.

---

## How to Generate Secrets

```bash
# Generate a cryptographically random 32-byte hex string (suitable for JWT secrets, ADMIN_API_KEY)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this command **three times** — once each for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ADMIN_API_KEY`. Never reuse the same value for multiple fields.

---

## Variable Reference

### `PORT`
| | |
|---|---|
| **Type** | string (numeric) |
| **Required** | No |
| **Default** | `"5000"` |
| **Example** | `PORT=8080` |

The TCP port Express listens on. In Docker, this maps to the container port exposed in `docker-compose.yml`.

---

### `NODE_ENV`
| | |
|---|---|
| **Type** | `"development"` \| `"production"` \| `"test"` |
| **Required** | No |
| **Default** | `"development"` |
| **Example** | `NODE_ENV=production` |

Controls:
- **Logger format**: `development` → pretty console output with emoji; `production` → compact JSON (machine-parseable)
- **Logger level**: `development` → `debug` (all messages); `production` → `info` (skips debug)
- **Swagger server list**: `production` shows the production URL entry

---

### `MONGODB_URI`
| | |
|---|---|
| **Type** | string (MongoDB connection URI) |
| **Required** | ✅ Yes |
| **Default** | — |
| **Example** | `MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/wordle-clone` |

The full MongoDB connection string. Supports:
- Local: `mongodb://localhost:27017/wordle-clone`
- Atlas: `mongodb+srv://user:pass@cluster.host.net/db?retryWrites=true&w=majority`
- Docker compose: `mongodb://root:devpassword@mongo:27017/wordle-clone?authSource=admin`

> **Security**: Never commit this value. Rotate immediately if exposed.

---

### `JWT_SECRET`
| | |
|---|---|
| **Type** | string |
| **Required** | ✅ Yes |
| **Minimum length** | 32 characters |
| **Example** | `JWT_SECRET=4cf37d5bbf322f70f397b56d547f0413b6af53e0c7e37d4f3d6d765a65ddcfcc` |

Signs and verifies **access tokens**. Access tokens expire in `JWT_EXPIRES_IN` (default 15 minutes).

If this secret is rotated, all currently issued access tokens become invalid immediately. Users will need to refresh (which is seamless if their refresh token is still valid).

---

### `JWT_REFRESH_SECRET`
| | |
|---|---|
| **Type** | string |
| **Required** | ✅ Yes |
| **Minimum length** | 32 characters |
| **Example** | `JWT_REFRESH_SECRET=22df0c544fb41e33b1c0eb8c3c55599a21855eb6c71b04f17943bf2c1f8667d2` |

Signs and verifies **refresh tokens**. Must be **different** from `JWT_SECRET`.

If rotated, all refresh tokens become invalid. All users will be logged out and must log in again.

---

### `JWT_EXPIRES_IN`
| | |
|---|---|
| **Type** | string (duration) |
| **Required** | No |
| **Default** | `"15m"` |
| **Example** | `JWT_EXPIRES_IN=30m` |

Lifetime of access tokens. Supports `jsonwebtoken` duration strings: `15m`, `1h`, `2d`, etc.

Keep this **short** (15–30 minutes). Clients use the refresh endpoint to get new access tokens silently.

---

### `JWT_REFRESH_EXPIRES_IN`
| | |
|---|---|
| **Type** | string (duration) |
| **Required** | No |
| **Default** | `"7d"` |
| **Example** | `JWT_REFRESH_EXPIRES_IN=30d` |

Lifetime of refresh tokens. This controls how long a user stays logged in without re-entering their password.

The parsed duration is also used to set the `expiresAt` field on `RefreshToken` documents in MongoDB, which the TTL index uses to auto-delete expired records.

---

### `ALLOWED_ORIGINS`
| | |
|---|---|
| **Type** | string (comma-separated URLs) |
| **Required** | No |
| **Default** | `http://localhost:5173,http://localhost:3000` |
| **Example** | `ALLOWED_ORIGINS=https://wordle.yourdomain.com,https://www.wordle.yourdomain.com` |

CORS origin whitelist. Only browsers from these origins can make cross-origin requests to the API.

- Requests with **no Origin header** (server-to-server) are always allowed
- Requests from **unlisted origins** receive a CORS error and the request is blocked
- In production, set this to your exact frontend domain(s)

---

### `ADMIN_API_KEY`
| | |
|---|---|
| **Type** | string |
| **Required** | ✅ Yes |
| **Minimum length** | 32 characters |
| **Example** | `ADMIN_API_KEY=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2` |

Secret API key that must be sent as the `x-admin-key` header to access `/api/words/*` endpoints.

```bash
# Usage example
curl -H "x-admin-key: YOUR_KEY_HERE" http://localhost:5000/api/words/count
```

The comparison uses `crypto.timingSafeEqual` — immune to timing attacks.

---

### `GOOGLE_AI_API_KEY`
| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Default** | — (undefined) |
| **Example** | `GOOGLE_AI_API_KEY=AIzaSy...` |

Gemini API key for the AI word pipeline. When not set:
- `POST /api/words/fetch` returns `503 PIPELINE_DISABLED`
- `checkAndRefillWords()` skips silently with a warning log
- All game functionality continues to work normally (uses static word lists)

> **Security**: Passed as `x-goog-api-key` request header — never appears in URL query strings or server logs.

---

### `WORD_REFILL_THRESHOLD`
| | |
|---|---|
| **Type** | string (numeric) |
| **Required** | No |
| **Default** | `"30"` |
| **Example** | `WORD_REFILL_THRESHOLD=50` |

Number of unused words in the `words` collection that triggers an auto-refill. The daily cron at 2 AM UTC checks this. If `unusedWords < threshold`, a Gemini fetch is triggered.

---

### `WORD_FETCH_COUNT`
| | |
|---|---|
| **Type** | string (numeric) |
| **Required** | No |
| **Default** | `"500"` |
| **Example** | `WORD_FETCH_COUNT=200` |

How many words to request from Gemini in a single pipeline run. The actual count requested is adjusted upward based on the estimated duplicate rate:

```
requestCount = ceil(WORD_FETCH_COUNT / (1 - overlapRate))
```

where `overlapRate = min(existingWordCount / 5000, 0.8)`.

---

### `DOCS_USER`
| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Default** | `"admin"` |
| **Example** | `DOCS_USER=devteam` |

Username for HTTP Basic Auth on the `/api-docs` Swagger UI. Change from the default in any environment where docs are publicly accessible.

---

### `DOCS_PASSWORD`
| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Default** | `"wordle_docs_2024"` |
| **Example** | `DOCS_PASSWORD=a_strong_random_password` |

Password for the Swagger UI. **Change this in production**. The comparison uses `crypto.timingSafeEqual`.

---

## Full `.env` Template

```bash
# ── Server ────────────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ── Database ──────────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/wordle-clone

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_REFRESH_SECRET=<generate: same command, different value>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── CORS ──────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ── Admin API ─────────────────────────────────────────────────────────────────
ADMIN_API_KEY=<generate: same command, different value>

# ── AI Word Pipeline ──────────────────────────────────────────────────────────
GOOGLE_AI_API_KEY=your_gemini_api_key_here
WORD_REFILL_THRESHOLD=30
WORD_FETCH_COUNT=500

# ── API Docs ──────────────────────────────────────────────────────────────────
DOCS_USER=admin
DOCS_PASSWORD=a_strong_random_password
```

---

## Startup Validation Behaviour

The env schema is validated with Zod **before any other code runs**. If validation fails:

```
Invalid environment variables:
{
  JWT_SECRET: [ 'JWT_SECRET must be at least 32 characters' ],
  ADMIN_API_KEY: [ 'Required' ]
}
```

The process exits with code `1`. This means a misconfigured deployment **fails loudly at boot time** rather than failing silently at runtime.
