# Admin Guide

> Operational reference for admins and DevOps. Everything you need to run, monitor, and maintain the Wordle Clone backend.

---

## Admin Access

The admin API is protected by a 32+ character secret key in the `x-admin-key` request header.

```bash
# Test admin access
curl -H "x-admin-key: YOUR_ADMIN_API_KEY" http://localhost:5000/api/words/count
```

The Swagger UI (at `/api-docs`) is protected separately by HTTP Basic Auth (`DOCS_USER` / `DOCS_PASSWORD`). You can use it to test admin endpoints interactively.

---

## Word Pool Management

### What Is the Word Pool?

The `words` MongoDB collection is a growing stockpile of 5-letter words fetched from Google Gemini. These are used as **future daily answer candidates**.

> **Important distinction:** The current daily word system uses `data/answerWords.json` (a static file), not the `words` collection, for live game play. The MongoDB `words` collection is a growing bank for future use.

### Check Current Pool Size

```bash
curl -H "x-admin-key: YOUR_KEY" http://localhost:5000/api/words/count
```

Response:
```json
{ "unusedWords": 487 }
```

### Manually Trigger a Refill

```bash
curl -X POST \
     -H "x-admin-key: YOUR_KEY" \
     http://localhost:5000/api/words/fetch
```

Response:
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
| `validated` | Passed 5-letter + format check |
| `stored` | Successfully written to MongoDB (new words only) |
| `duplicates` | Already existed in the database — safely ignored |

### Auto-Refill (Cron)

The server automatically checks and refills the word pool every day at **2:00 AM UTC**:

```
if unusedWords < WORD_REFILL_THRESHOLD (default: 30):
  trigger word pipeline with adjusted count
```

The requested count is inflated based on estimated duplicate rate — see [Services docs](./services.md#checkandrefillwords) for details.

### Efficiency Warnings

If pipeline efficiency drops below 30%, a warning is logged:
```
⚠️  Pipeline efficiency low (18%) — word pool may be exhausting
```

This means the AI is generating mostly words already in the database. Options:
- The word pool is naturally growing full — this is expected over time
- Manually check the DB size: run `db.words.count()` in MongoDB shell
- Consider expanding the pool limit constant (`TOTAL_POSSIBLE_WORDS = 5000`) in `wordPipeline.service.ts`

---

## Cron Jobs

Two jobs run automatically:

| Job | Schedule | Action |
|---|---|---|
| Daily word refresh | `30 18 * * *` (18:30 UTC = midnight IST) | Clears the in-memory daily word cache |
| Word pool refill | `0 2 * * *` (2:00 AM UTC) | Checks threshold and triggers pipeline if needed |

**Timezone note:** The daily word refresh is timed for midnight IST (Indian Standard Time = UTC+5:30). Adjust the cron expression if your target timezone changes.

**Cron expression format:** `minute hour day-of-month month day-of-week`

---

## Logs

The server uses **Winston** for structured logging. Log behaviour by environment:

| Environment | Format | Level |
|---|---|---|
| `development` | Human-readable with emoji, timestamp `HH:mm:ss` | `debug` (all messages) |
| `production` | Compact JSON (each log line = one JSON object) | `info` (skips debug) |

### Log Events to Watch

| Emoji | Event | Severity |
|---|---|---|
| ✅ | MongoDB connected | Info |
| ✅ | New user registered | Info |
| ✅ | User logged in | Info |
| 📅 | Daily word selected (answer hidden) | Info |
| 🎮 | New game session created | Info |
| 🎯 | Guess submitted (WIN/LOSS/continuing) | Info |
| 📊 | User stats updated | Info |
| ⏰ | Cron job fired | Info |
| 🔄 | Daily word cache cleared | Info |
| 🚀 | Word pipeline started | Info |
| 🎉 | Pipeline complete | Info |
| ⚠️ | Failed login attempt | Warn |
| ⚠️ | Pipeline efficiency low | Warn |
| ⚠️ | Word refill needed but no API key | Warn |
| 🚨 | Possible refresh token replay attack | Warn |
| ❌ | MongoDB connection failed | Error |
| ❌ | Database unreachable (503) | Error |
| ❌ | Word pipeline fetch failed | Error |
| ❌ | Unhandled server error (500) | Error |

### Production Log Ingestion

In production, redirect stdout to your log aggregation system:

```bash
# PM2 example
pm2 start dist/index.js --name wordle-api --log /var/log/wordle/app.log

# Docker example
docker logs -f wordle-api-container | your-log-forwarder

# Pipe to a file
node dist/index.js >> /var/log/wordle/app.log 2>&1
```

JSON log format in production (one line per event):
```json
{"level":"info","message":"✅ User logged in: user@example.com","timestamp":"2026-06-29T05:30:00.000Z"}
```

---

## Health Monitoring

```bash
# Simple ping
curl http://localhost:5000/health
# → { "status": "ok" }

# With timing
curl -w "\nTime: %{time_total}s\n" http://localhost:5000/health
```

Use this endpoint for:
- Load balancer health checks (set healthy threshold to `200 OK` + `{ status: "ok" }`)
- Uptime monitoring (UptimeRobot, Better Uptime, etc.)
- Container liveness probes (Kubernetes)

---

## Database Operations

### Connect to MongoDB (Local Docker)

```bash
# Start the compose stack
docker compose up -d

# Connect to MongoDB shell
docker exec -it <container_name> mongosh \
  -u root -p devpassword \
  --authenticationDatabase admin \
  wordle-clone
```

### Common Queries

```js
// Count documents per collection
db.users.countDocuments()
db.gamesessions.countDocuments()
db.words.countDocuments()
db.refreshtokens.countDocuments()

// Check word pool
db.words.countDocuments({ used: false })
db.words.countDocuments({ used: true })

// Today's active sessions
db.gamesessions.countDocuments({ date: "2026-06-29", completed: false })

// Sessions won today
db.gamesessions.countDocuments({ date: "2026-06-29", won: true })

// Find a user by email
db.users.findOne({ email: "user@example.com" }, { passwordHash: 0 })

// Active (non-expired) refresh tokens for a user
db.refreshtokens.find({ userId: ObjectId("...") })

// Purge all expired refresh tokens manually (normally auto-deleted by TTL index)
db.refreshtokens.deleteMany({ expiresAt: { $lt: new Date() } })
```

### Backup and Restore

```bash
# Backup (mongodump)
mongodump \
  --uri="mongodb+srv://user:pass@cluster.mongodb.net/wordle-clone" \
  --out=./backup/$(date +%Y-%m-%d)

# Restore
mongorestore \
  --uri="mongodb+srv://user:pass@cluster.mongodb.net/wordle-clone" \
  ./backup/2026-06-29/wordle-clone
```

---

## Secret Rotation

### Rotate JWT Secrets

1. Generate new secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `JWT_SECRET` and/or `JWT_REFRESH_SECRET` in your environment
3. Restart the server
4. **Effect:** All access tokens and refresh tokens signed with the old secret become invalid. All users will need to log in again. (Expect a surge in login traffic.)

### Rotate ADMIN_API_KEY

1. Generate a new key: same `crypto.randomBytes(32)` command
2. Update `ADMIN_API_KEY` in your environment
3. Update the key in any scripts, CI/CD pipelines, or admin tools that use it
4. Restart the server

### Rotate MONGODB_URI (Credentials)

1. Create a new database user in MongoDB Atlas with the same permissions
2. Update `MONGODB_URI` with the new credentials
3. Restart the server
4. Verify connection, then delete the old database user

### Rotate GOOGLE_AI_API_KEY

1. Generate a new key in Google AI Studio / Cloud Console
2. Update `GOOGLE_AI_API_KEY` in your environment
3. Restart the server (or the cron + admin pipeline will pick it up on next run)

---

## Rate Limit Tuning

Current limits (adjustable in `middleware/rateLimiter.ts`):

| Endpoint | Current Limit | Change If... |
|---|---|---|
| Login / Register | 10 req / 15 min | Too restrictive for power users → raise to 20 |
| Guess submission | 30 req / 10 min | Bots get through → lower to 15; players complain → raise to 60 |

After changing limits, restart the server. Rate limit state is in-memory — it resets on restart.

For distributed deployments (multiple server instances), use a Redis store:
```bash
pnpm add rate-limit-redis ioredis
```
Configure in `rateLimiter.ts` with `store: new RedisStore(...)`.

---

## Scaling Considerations

| Concern | Current Approach | At Scale |
|---|---|---|
| Rate limiting | In-memory (per process) | Add Redis store for distributed rate limiting |
| Session cache | In-memory per process | Already stateless — horizontal scale works fine |
| Daily word cache | Module-level variable | Works per process — clear cron fires on each instance |
| MongoDB connections | Single connection per process | Use connection pooling (Mongoose default) or MongoDB Atlas connection pooling proxy |
| Word pipeline | Runs on cron, one instance | Add a lock (Redis SETNX) to prevent multiple instances running pipeline simultaneously |
