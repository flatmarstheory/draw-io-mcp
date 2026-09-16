FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY src ./src

FROM base AS test
COPY test ./test
RUN node --test

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production DRAWIO_OUTPUT_DIR=/data
COPY --from=base --chown=node:node /app /app
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
ENTRYPOINT ["node", "src/server.js"]
