# Authentication

> A deep-dive into how auth works — from registration to token rotation to logout.

---

## Overview

The server uses **JWT-based stateless authentication** with two token types:

| Token | Lifetime | Purpose |
|---|---|---|
| Access Token | 15 minutes | Prove identity on every authenticated request |
| Refresh Token | 7 days | Silently get a new access token when it expires |

Both tokens are signed JWTs. **Refresh tokens are additionally stored as SHA-256 hashes in MongoDB**, which enables true server-side revocation (logout that actually works).

---

## Token Payloads

### Access Token (`JWT_SECRET`)
```json
{
  "userId": "6682a1b2c3d4e5f6a7b8c9d0",
  "email": "user@example.com",
  "iat": 1719619200,
  "exp": 1719620100
}
```

### Refresh Token (`JWT_REFRESH_SECRET`)
Same payload shape, different secret, longer `exp`.

---

## Full Auth Flow

### 1. Registration / Login

```
Client                              Server
  │                                   │
  │── POST /api/auth/register ────────►│
  │   { email, password }             │
  │                                   ├─ Validate email format
  │                                   ├─ Validate password length
  │                                   ├─ Check email not already used
  │                                   ├─ bcrypt.hash(password, 12)
  │                                   ├─ User.create(...)
  │                                   ├─ signAccessToken(payload)   → JWT (15m)
  │                                   ├─ signRefreshToken(payload)  → JWT (7d)
  │                                   ├─ hashToken(refreshToken)    → SHA-256 hex
  │                                   └─ RefreshToken.create({ userId, tokenHash, expiresAt })
  │◄── 201 { accessToken, refreshToken, user } ──┤
  │                                   │
```

### 2. Making Authenticated Requests

```
Client                              Server
  │                                   │
  │── GET /api/user/stats ────────────►│
  │   Authorization: Bearer <AT>      │
  │                                   ├─ requireAuth middleware
  │                                   ├─ Extract token from "Bearer ..." header
  │                                   ├─ verifyAccessToken(token)
  │                                   │   └─ jwt.verify(token, JWT_SECRET)
  │                                   ├─ Attach payload to req.user
  │                                   └─ Controller runs
  │◄── 200 { user: {...} } ───────────┤
```

### 3. Access Token Expiry — Silent Refresh

```
Client                              Server
  │                                   │
  │── GET /api/user/stats ────────────►│
  │   Authorization: Bearer <expired> │
  │                                   ├─ jwt.verify → TokenExpiredError
  │                                   └─ throw UnauthorizedError
  │◄── 401 UNAUTHORIZED ──────────────┤
  │                                   │
  │  [Client detects 401, has refresh token]
  │                                   │
  │── POST /api/auth/refresh ─────────►│
  │   { refreshToken: <RT> }          │
  │                                   ├─ verifyRefreshToken(RT) → valid payload
  │                                   ├─ hashToken(RT) → look up in RefreshToken collection
  │                                   ├─ [Found] → delete the old hash document
  │                                   ├─ User.findById(payload.userId) → verify user exists
  │                                   ├─ signAccessToken(newPayload) → new AT (15m)
  │                                   ├─ signRefreshToken(newPayload) → new RT (7d)
  │                                   └─ RefreshToken.create({ new hash })
  │◄── 200 { accessToken (new), refreshToken (new) } ─┤
  │                                   │
  │  [Retry original request with new access token]
```

### 4. Logout

```
Client                              Server
  │                                   │
  │── POST /api/auth/logout ──────────►│
  │   { refreshToken: <RT> }          │
  │                                   ├─ hashToken(RT)
  │                                   └─ RefreshToken.deleteOne({ tokenHash })
  │◄── 200 { message: "Logged out" } ─┤
  │                                   │
  │  [Old RT is now dead in DB]
  │  [AT expires naturally in <15 min]
  │  [Client discards both tokens]
```

---

## Token Rotation

Every successful `/refresh` call:

1. Deletes the **old** refresh token hash from MongoDB
2. Issues a **brand new** refresh token with a fresh 7-day expiry
3. Issues a **brand new** access token

This means:
- Each refresh token can only be used **once**
- A stolen refresh token that gets used first will **revoke** the legitimate user's session (they'll see `401 REFRESH_TOKEN_REVOKED`)
- The legitimate user can log in again to get new tokens

---

## Replay Attack Detection

If someone steals a refresh token and uses it **after** the legitimate user has already refreshed it:

```
Legitimate user:  POST /refresh with RT₁ → gets RT₂  (RT₁ deleted from DB)
Attacker:         POST /refresh with RT₁ → 401 REFRESH_TOKEN_REVOKED
                  (RT₁ hash not found — it was deleted)
```

If the **attacker refreshes first**:

```
Attacker:         POST /refresh with RT₁ → gets RT₂  (RT₁ deleted from DB)
Legitimate user:  POST /refresh with RT₁ → 401 REFRESH_TOKEN_REVOKED
                  (RT₁ no longer in DB)
```

In both cases a warning is logged:
```
🚨 Refresh token not found in DB for user <id> — possible replay attack
```

---

## Password Hashing

Passwords are hashed using **bcrypt with a cost factor of 12**.

- Cost 12 ≈ ~300ms on modern hardware — fast enough for UX, slow enough to resist brute force
- `bcryptjs` is the pure-JavaScript implementation (no native addon required)
- The plaintext password is **never** stored or logged

---

## Token Storage (Client Responsibility)

The server issues tokens in the response body — it does **not** set cookies. Client responsibility:

| Token | Recommended storage |
|---|---|
| Access Token | In-memory (JavaScript variable) — lost on page refresh (fine, use refresh) |
| Refresh Token | `localStorage` or `sessionStorage` (weigh XSS risk vs. convenience) |

> For maximum security, store the refresh token in an `httpOnly` cookie. This server currently doesn't do cookie-based auth but could be extended to support it.

---

## Guest Play

Routes that use `optionalAuth` (`GET /api/game/session`, `POST /api/game/guess`) work without any token:

- If no `Authorization` header is provided → `req.user` is `undefined`, the user is treated as a guest
- If an `Authorization: Bearer <token>` header **is** provided but the token is invalid or expired → the error is **silently swallowed** and the user is treated as a guest (this is intentional — `optionalAuth` never blocks a request)
- Guest sessions are stored in MongoDB and identified by the `sessionId` ObjectId returned from `GET /api/game/session`
- Guest stats are **not** tracked

---

## Security Properties Summary

| Property | How Achieved |
|---|---|
| Short-lived access tokens | 15-minute expiry, verified on every request |
| True logout | Refresh token hash deleted from DB on logout |
| Token rotation | Old RT deleted + new RT issued on every refresh |
| No plaintext secrets in DB | SHA-256 hash stored, original token is never persisted |
| Timing-safe comparisons | Not applicable to JWT (uses HMAC), but applied to admin key and swagger password |
| Brute-force protection | `authRateLimiter`: 10 login/register attempts per 15 min per IP |
| User enumeration prevention | Login always returns `INVALID_CREDENTIALS`, regardless of whether the email exists |
| Automatic token cleanup | MongoDB TTL index on `RefreshToken.expiresAt` auto-deletes expired documents |
