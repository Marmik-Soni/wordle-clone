# Wordle Clone — Backend Documentation

> **Complete technical reference for the `apps/server` package.**  
> Covers every module, design decision, API endpoint, environment variable, and operational procedure.

---

## Table of Contents

| Document | Audience | Description |
|---|---|---|
| [README.md](./README.md) *(this file)* | All | Project overview, quick start |
| [architecture.md](./architecture.md) | Developers | System design, request lifecycle, data flow |
| [environment.md](./environment.md) | Devs + Ops | Every environment variable explained |
| [api-reference.md](./api-reference.md) | Devs + Clients | Every endpoint with request/response examples |
| [authentication.md](./authentication.md) | Developers | JWT flow, refresh token rotation, security model |
| [database.md](./database.md) | Developers | All Mongoose models, indexes, relationships |
| [services.md](./services.md) | Developers | Business logic layer — all services documented |
| [middleware.md](./middleware.md) | Developers | Every middleware piece documented |
| [utilities.md](./utilities.md) | Developers | errors, jwt, catchAsync, colorCalculator, logger, shared types |
| [admin-guide.md](./admin-guide.md) | Admins / Ops | Word pipeline, cron jobs, monitoring, operations |
| [deployment.md](./deployment.md) | Devs + Ops | Docker, production setup, secrets management |

---

## What Is This?

A **REST API** backend for a Wordle-clone game. It handles:

- **Authentication** — JWT-based register/login with rotating, revocable refresh tokens
- **Daily Game** — One puzzle per day, deterministic word selection, 6-guess limit
- **Guest + Auth play** — Games work without an account; stats are tracked only for authenticated users
- **Word Management** — AI-powered word pipeline (Gemini) with scheduled auto-refill
- **Admin API** — Protected endpoints for operational control of the word pool

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (ESM) |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | MongoDB via Mongoose 8 |
| Auth | `jsonwebtoken` (JWT), `bcryptjs` |
| Security | `helmet`, `cors`, `express-rate-limit` |
| AI | Google Gemini API (via `fetch`) |
| Scheduling | `node-cron` |
| Logging | Winston |
| Validation | Zod (env), manual (controllers) |
| Build | `tsc` (TypeScript compiler) |
| Dev server | `nodemon` + `tsx` |
| Monorepo | pnpm workspaces |

## Quick Start

```bash
# 1. From the repo root
pnpm install

# 2. Create the server .env file
cp apps/server/.env.example apps/server/.env
# Fill in MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_API_KEY

# 3. Start in dev mode
pnpm --filter server dev

# Server starts on http://localhost:5000
# API docs at http://localhost:5000/api-docs (Basic Auth required)
```

## Source Map

```
apps/server/src/
├── index.ts              — Express app bootstrap, middleware registration
├── config/
│   ├── env.ts            — Zod-validated environment config (singleton)
│   ├── db.ts             — MongoDB connection lifecycle
│   └── swagger.ts        — OpenAPI 3.0 spec generation
├── routes/
│   ├── auth.routes.ts    — POST /api/auth/*
│   ├── user.routes.ts    — GET  /api/user/*
│   ├── game.routes.ts    — GET/POST /api/game/*
│   └── words.routes.ts   — GET/POST /api/words/* (admin-only)
├── controllers/
│   ├── auth.controller.ts
│   ├── user.controller.ts
│   ├── game.controller.ts
│   └── words.controller.ts
├── services/
│   ├── game.service.ts        — Core game logic (sessions, guesses)
│   ├── user.service.ts        — User stats updates
│   ├── dailyWord.service.ts   — In-memory daily word cache
│   ├── wordList.service.ts    — Static word lists (JSON), day-index math
│   └── wordPipeline.service.ts — Gemini AI word fetcher + DB storage
├── middleware/
│   ├── auth.middleware.ts      — requireAuth (JWT verification)
│   ├── optionalAuth.ts         — optionalAuth (guest-friendly)
│   ├── adminAuth.middleware.ts — adminAuth (x-admin-key)
│   ├── rateLimiter.ts          — authRateLimiter, guessRateLimiter
│   ├── swaggerAuth.ts          — Basic Auth for /api-docs
│   ├── errorHandler.ts         — Centralised error → HTTP response
│   └── notFound.ts             — 404 catch-all
├── models/
│   ├── User.ts            — User document + stats schema
│   ├── GameSession.ts     — Per-user/guest game session
│   ├── Word.ts            — AI-fetched word pool
│   └── RefreshToken.ts    — Stored refresh token hashes (TTL-indexed)
├── jobs/
│   └── wordCron.ts        — node-cron: daily cache clear + word refill
├── utils/
│   ├── jwt.ts             — sign/verify/hash helpers
│   ├── errors.ts          — Typed AppError hierarchy
│   ├── catchAsync.ts      — Async error wrapper for Express
│   ├── logger.ts          — Winston logger singleton
│   ├── colorCalculator.ts — Wordle color logic (green/yellow/gray)
│   └── wordValidator.ts   — 5-letter format + profanity check
└── data/
    ├── answerWords.json   — Curated answer word list
    └── validWords.json    — Extended valid-guess dictionary
```
