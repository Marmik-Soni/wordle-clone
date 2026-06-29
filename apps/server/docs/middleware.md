# Middleware

> Every middleware function in the server, what it does, and when it runs.

---

## Middleware Execution Order

```
Every request:
  helmet()           → applies security headers
  cors()             → validates Origin header
  express.json()     → parses body (10 KB limit)

Route-specific (applied in this order per route):
  [rate limiter]     → checks IP request count
  [auth]             → verifies identity
  catchAsync(fn)     → wraps controller, forwards errors

After all routes:
  notFoundHandler    → handles unmatched routes
  errorHandler       → maps all thrown errors to HTTP responses
```

---

## `auth.middleware.ts` — `requireAuth`

**Used on:** `GET /api/user/stats`  
**File:** `middleware/auth.middleware.ts`

Verifies a JWT access token and attaches the decoded payload to `req.user`.

```typescript
export interface AuthRequest extends Request {
  user?: TokenPayload; // { userId: string, email: string }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void
```

**Logic:**
1. Read `Authorization` header
2. If missing or doesn't start with `"Bearer "` → throw `UnauthorizedError("No token provided")`
3. Extract token: `header.split(" ")[1]`
4. `verifyAccessToken(token)` — calls `jwt.verify(token, JWT_SECRET)`
5. On success: `req.user = payload`, call `next()`
6. On failure (expired, invalid signature, malformed): throw `UnauthorizedError("Invalid or expired token")`

**What `AuthRequest` is:**  
An extended Express `Request` type that adds the optional `user` field. All controllers that need the user's identity accept `AuthRequest` instead of `Request`.

---

## `optionalAuth.ts` — `optionalAuth`

**Used on:** `GET /api/game/session`, `POST /api/game/guess`  
**File:** `middleware/optionalAuth.ts`

Like `requireAuth` but **never blocks**. If auth fails for any reason, the request continues with `req.user = undefined`.

```typescript
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void
```

**Logic:**
1. If no `Authorization` header or doesn't start with `"Bearer "` → call `next()` immediately (guest)
2. Extract and verify token
3. On success: `req.user = payload`
4. On failure: **silently swallow error** — continue as guest
5. Call `next()`

**Why this matters:** This allows the game to work for both logged-in users and anonymous visitors without separate routes. The controller checks `req.user?.userId ?? null` to determine whether to track stats.

---

## `adminAuth.middleware.ts` — `adminAuth`

**Used on:** All `GET /api/words/*` and `POST /api/words/*` routes (applied via `router.use()`)  
**File:** `middleware/adminAuth.middleware.ts`

Validates the `x-admin-key` header using `crypto.timingSafeEqual` to prevent timing attacks.

```typescript
export function adminAuth(req: Request, _res: Response, next: NextFunction): void
```

**Logic:**
1. Read `req.headers["x-admin-key"]`
2. If missing or not a string → throw `UnauthorizedError("Admin key required", "ADMIN_KEY_MISSING")`
3. Compare using `timingSafeEqual`:
   - Pad provided key to the length of expected key (prevents length-leaking)
   - Both lengths must match AND `timingSafeEqual` must return `true`
4. If mismatch → throw `ForbiddenError("Invalid admin key", "ADMIN_KEY_INVALID")`
5. Call `next()`

**Timing safety explained:**  
A naive `providedKey !== env.ADMIN_API_KEY` comparison short-circuits at the first differing character. An attacker can measure response time to determine how many characters are correct. `timingSafeEqual` always takes the same time regardless of where the values differ.

---

## `rateLimiter.ts` — `authRateLimiter` + `guessRateLimiter`

**File:** `middleware/rateLimiter.ts`  
**Library:** `express-rate-limit`

### `authRateLimiter`
**Used on:** `POST /api/auth/register`, `POST /api/auth/login`

| Setting | Value |
|---|---|
| Window | 15 minutes |
| Max requests | 10 per IP |
| Response on exceed | `429 TOO_MANY_REQUESTS` with structured error body |

### `guessRateLimiter`
**Used on:** `POST /api/game/guess`

| Setting | Value |
|---|---|
| Window | 10 minutes |
| Max requests | 30 per IP |
| Response on exceed | `429 TOO_MANY_REQUESTS` with structured error body |

Both use `standardHeaders: true` which sets `RateLimit-*` response headers so clients know their remaining quota.

**Rate limiting keying:** By default, `express-rate-limit` keys by `req.ip`. Behind a reverse proxy (nginx, AWS ALB), set `app.set('trust proxy', 1)` to ensure the real client IP from `X-Forwarded-For` is used instead of the proxy's IP.

---

## `swaggerAuth.ts` — `swaggerAuth`

**Used on:** `GET /api-docs` (before swagger UI serve)  
**File:** `middleware/swaggerAuth.ts`

HTTP Basic Authentication for the Swagger UI. Uses timing-safe comparison.

```typescript
export function swaggerAuth(req: Request, res: Response, next: NextFunction): void
```

**Logic:**
1. Read `Authorization` header
2. If missing or not `"Basic ..."` → respond `401` with `WWW-Authenticate: Basic realm="API Docs"` header (triggers browser's native login dialog)
3. Base64-decode the credentials: `username:password`
   - Split on the first `:` only (passwords may contain `:`)
4. `safeCompare(username, env.DOCS_USER)` AND `safeCompare(password, env.DOCS_PASSWORD)`
5. If either fails → respond `401`
6. Call `next()`

**`safeCompare` helper:**
```typescript
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

---

## `errorHandler.ts` — `errorHandler`

**Position:** Last middleware registered (after all routes)  
**File:** `middleware/errorHandler.ts`

The central error-to-HTTP response mapper. Handles every thrown error in the server.

```typescript
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void
```

**Error cascade (checked in order):**

| Check | HTTP | Code |
|---|---|---|
| `err instanceof AppError` | `err.statusCode` | `err.code` |
| `err instanceof mongoose.Error.CastError` | `400` | `CAST_ERROR` |
| `err instanceof mongoose.Error.ValidationError` | `400` | `VALIDATION_ERROR` |
| `err.code === 11000` (MongoDB duplicate key) | `409` | `DUPLICATE_KEY` |
| `err.name === "MongoServerSelectionError"` | `503` | `DB_UNAVAILABLE` |
| `err.name === "TokenExpiredError"` | `401` | `TOKEN_EXPIRED` |
| `err.name === "JsonWebTokenError"` | `401` | `TOKEN_INVALID` |
| `err.type === "entity.parse.failed"` | `400` | `MALFORMED_JSON` |
| `err.type === "entity.too.large"` | `413` | `PAYLOAD_TOO_LARGE` |
| **Fallthrough** | `500` | `INTERNAL_ERROR` |

**500 handling:**  
The full error message and stack trace are logged to Winston. The client only sees `{ error: { message: "Internal server error", code: "INTERNAL_ERROR" } }` — no stack traces leaked.

**AppError >= 500 logging:**  
Any `AppError` with `statusCode >= 500` is also logged (in case a developer creates a 5xx AppError subclass).

---

## `notFound.ts` — `notFoundHandler`

**Position:** Just before `errorHandler` (after all routes)  
**File:** `middleware/notFound.ts`

Handles requests that matched no route.

```typescript
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
      code: "ROUTE_NOT_FOUND",
    },
  });
}
```

Note: this is **not** an error-handler middleware (only 3 parameters). It responds directly rather than calling `next(err)`, because a 404 isn't a thrown error — it's simply no route matched.

---

## `catchAsync.ts` — `catchAsync`

**File:** `utils/catchAsync.ts`  
**Used:** Wraps every async controller function in every route file

Express's error-handling pipeline only catches synchronous errors by default. Any `async` function that throws an unhandled rejection will **not** reach the `errorHandler` unless you either:
- Call `.catch(next)` manually, or
- Use `catchAsync`

```typescript
export function catchAsync<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: TReq, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
```

**Generic type `TReq extends Request`:**  
Controllers that use `AuthRequest` (extends `Request`) can be passed directly:
```typescript
router.get("/stats", requireAuth, catchAsync(getStats)); // getStats takes AuthRequest
```
Without the generic, TypeScript would complain that `AuthRequest` is not assignable to `Request`.

**Usage pattern in routes:**
```typescript
router.post("/register", authRateLimiter, catchAsync(register));
//                       ^ middleware      ^ async controller wrapped
```

---

## `helmet()` — HTTP Security Headers

Applied globally as the **first** middleware.

Key headers set by `helmet()`:

| Header | Value | Protects Against |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | MIME-type sniffing attacks |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` | SSL stripping (in prod) |
| `X-XSS-Protection` | `0` (disabled — modern browsers use CSP) | Legacy XSS filter |
| `Content-Security-Policy` | Default restrictive | XSS, data injection |
| `Referrer-Policy` | `no-referrer` | Referrer leakage |
| `X-Download-Options` | `noopen` | IE file execution |
| `X-Permitted-Cross-Domain-Policies` | `none` | Flash/PDF cross-domain |

---

## `cors()` — Cross-Origin Resource Sharing

Applied globally, second after helmet.

```typescript
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
}));
```

- Requests with **no Origin** (server-to-server, curl) → always allowed
- Requests from a **listed origin** → allowed
- Requests from an **unlisted origin** → CORS error (browser blocks the response)
- `credentials: true` → allows cookies and `Authorization` headers in cross-origin requests
