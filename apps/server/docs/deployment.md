# Deployment Guide

> How to run this server in Docker (local) and in production.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 8+ | `npm install -g pnpm` |
| Docker | 24+ | https://docker.com |
| Docker Compose | V2 | Included with Docker Desktop |
| MongoDB | Atlas (prod) or Docker (dev) | |

---

## Local Development

### 1. Install Dependencies

```bash
# From repo root
pnpm install
```

### 2. Configure Environment

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env`:
- Set `MONGODB_URI` (MongoDB Atlas URI or leave as-is for Docker local)
- Generate and set `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_API_KEY`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Optionally set `GOOGLE_AI_API_KEY` for the word pipeline

### 3. Start the Server (with Hot Reload)

```bash
pnpm --filter server dev
# or from apps/server/: pnpm dev
```

The server starts at `http://localhost:5000`.  
API docs: `http://localhost:5000/api-docs` (login with `DOCS_USER` / `DOCS_PASSWORD`).

### 4. Run with Docker Compose (Local Stack)

```bash
# From repo root — starts both server and MongoDB
docker compose up --build
```

This uses `apps/server/.env` for the server and spins up a local MongoDB with authentication enabled.

> **Note:** The Docker compose MongoDB URI (`mongodb://root:devpassword@mongo:27017/wordle-clone?authSource=admin`) overrides whatever `MONGODB_URI` is in your `.env`. The local MongoDB only lives in the Docker volume.

---

## Docker Architecture

```
┌─────────────────────────────────┐
│  docker-compose.yml (dev stack) │
│                                 │
│  service: server                │
│    - Node 20 Alpine             │
│    - Builds from Dockerfile     │
│    - Port 5000:5000             │
│    - Reads apps/server/.env     │
│    - MONGODB_URI overridden     │
│      to point at mongo service  │
│                                 │
│  service: mongo                 │
│    - mongo:7 official image     │
│    - Port 127.0.0.1:27017:27017 │
│      (localhost only, not LAN)  │
│    - Auth: root / devpassword   │
│    - Volume: mongo_data         │
└─────────────────────────────────┘
```

### Dockerfile Walkthrough

```dockerfile
FROM node:20-alpine          # Small base image, Node 20 LTS

WORKDIR /app

RUN npm install -g pnpm      # Install pnpm globally

# Copy only package files first — enables Docker layer caching
# (only re-runs pnpm install if package.json or lockfile changes)
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile   # Exact versions from lockfile

# Copy source after installing deps (cache hit on pnpm install next time)
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

WORKDIR /app/apps/server

RUN pnpm build               # tsc → dist/

EXPOSE 5000

CMD ["node", "dist/index.js"]  # Run compiled output
```

**Layer caching explained:**  
Copying `package.json` files *before* source files means Docker can reuse the `pnpm install` layer on rebuilds as long as your dependencies don't change. Only a code change (not a dependency change) triggers the fast path.

---

## Production Deployment

### Option A — Cloud VM / VPS (e.g., EC2, DigitalOcean Droplet)

**1. Build the Docker image:**
```bash
docker build -t wordle-api:latest .
```

**2. Push to a container registry:**
```bash
docker tag wordle-api:latest your-registry/wordle-api:latest
docker push your-registry/wordle-api:latest
```

**3. On your server, create a production `.env`:**
```bash
# /etc/wordle/api.env  (not in repo, not in Docker image)
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://produser:prodpass@your-atlas-cluster.mongodb.net/wordle-clone
JWT_SECRET=<generated_secret>
JWT_REFRESH_SECRET=<generated_secret_different>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ALLOWED_ORIGINS=https://wordle.yourdomain.com
ADMIN_API_KEY=<generated_secret>
GOOGLE_AI_API_KEY=<your_gemini_key>
WORD_REFILL_THRESHOLD=30
WORD_FETCH_COUNT=500
DOCS_USER=admin
DOCS_PASSWORD=<strong_random_password>
```

**4. Run with Docker:**
```bash
docker run -d \
  --name wordle-api \
  --restart=unless-stopped \
  --env-file /etc/wordle/api.env \
  -p 5000:5000 \
  your-registry/wordle-api:latest
```

**5. Reverse proxy with nginx:**
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Trust proxy:** If behind nginx, add `app.set('trust proxy', 1)` to `index.ts` so `express-rate-limit` uses the real client IP from `X-Forwarded-For`.

### Option B — Platform as a Service (Railway, Render, Fly.io)

All platforms support Docker deployments. General steps:

1. Connect your GitHub repo
2. Set the build context to repo root, Dockerfile to `apps/server/Dockerfile`
3. Set all environment variables in the platform's dashboard (never in the repo)
4. The platform handles TLS, port mapping, and restarts

### Option C — PM2 (without Docker)

```bash
# On the server
git clone your-repo
pnpm install
pnpm --filter server build

# Create ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'wordle-api',
    script: 'apps/server/dist/index.js',
    env_file: '/etc/wordle/api.env',
    restart_delay: 3000,
    max_restarts: 10,
  }]
};

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Auto-start on reboot
```

---

## MongoDB Atlas Setup (Production)

1. **Create a cluster** (M10+ for production, M0 free tier for staging)
2. **Create a database user:**
   - Username: `wordle-api-prod`
   - Password: Generate a strong random password
   - Roles: `readWrite` on database `wordle-clone` only (principle of least privilege)
3. **IP Access List:** Add only your server's IP(s). Never use `0.0.0.0/0` in production.
4. **Get the connection string:**
   ```
   mongodb+srv://wordle-api-prod:<password>@cluster0.xxxxx.mongodb.net/wordle-clone?retryWrites=true&w=majority
   ```
5. **Enable backups:** Continuous backup (M10+) or at least daily scheduled snapshots
6. **Set up alerts:** Atlas can alert on high connection count, slow queries, disk usage

---

## Environment Checklist (Pre-Launch)

- [ ] `NODE_ENV=production`
- [ ] `MONGODB_URI` points to production Atlas cluster
- [ ] `JWT_SECRET` is 32+ chars, randomly generated, different from refresh secret
- [ ] `JWT_REFRESH_SECRET` is 32+ chars, randomly generated
- [ ] `ALLOWED_ORIGINS` is set to exact production frontend domain(s)
- [ ] `ADMIN_API_KEY` is 32+ chars, randomly generated, stored securely
- [ ] `DOCS_PASSWORD` is changed from default
- [ ] `GOOGLE_AI_API_KEY` is set (or word pipeline is intentionally disabled)
- [ ] Server is behind HTTPS / TLS (nginx + Let's Encrypt or platform-managed)
- [ ] MongoDB IP Access List does NOT include `0.0.0.0/0`
- [ ] Health endpoint responding: `GET /health → { "status": "ok" }`
- [ ] `trust proxy` set if behind a reverse proxy (for correct IP-based rate limiting)

---

## Build Pipeline (CI/CD)

Recommended GitHub Actions workflow:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t your-registry/wordle-api:${{ github.sha }} .

      - name: Push to registry
        run: |
          docker push your-registry/wordle-api:${{ github.sha }}
          docker tag your-registry/wordle-api:${{ github.sha }} your-registry/wordle-api:latest
          docker push your-registry/wordle-api:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        # SSH to server and pull + restart the container
        run: |
          ssh user@your-server "docker pull your-registry/wordle-api:latest && docker restart wordle-api"
```

**Secrets to configure in GitHub:**
- `REGISTRY_TOKEN` — container registry authentication
- `SERVER_SSH_KEY` — SSH private key for deployment
- Never put app secrets in GitHub Actions — inject them at runtime via env file on the server

---

## Upgrading Dependencies

```bash
# Check for outdated packages
pnpm --filter server outdated

# Upgrade within semver ranges
pnpm --filter server update

# Upgrade a specific package
pnpm --filter server add express@latest

# After any upgrade, rebuild and test
pnpm --filter server build
pnpm --filter server test
```

Security-critical packages to monitor:
- `jsonwebtoken` — auth
- `bcryptjs` — password hashing
- `mongoose` — database
- `express` — framework
- `helmet` — security headers
- `express-rate-limit` — rate limiting
