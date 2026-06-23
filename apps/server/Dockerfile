FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

WORKDIR /app/apps/server

RUN pnpm build

EXPOSE 5000

CMD ["node", "dist/index.js"]
