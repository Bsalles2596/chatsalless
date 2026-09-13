FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
RUN pnpm config set minimum-release-age 0
RUN pnpm config set dangerouslyAllowAllBuilds true
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable
RUN pnpm config set minimum-release-age 0
RUN pnpm config set dangerouslyAllowAllBuilds true
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main.js"]
