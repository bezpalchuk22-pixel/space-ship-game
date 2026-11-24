# Stage 1: dependencies
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN npm ci


# Stage 2: build
FROM deps AS build

COPY . .

RUN npm run build
RUN npm run build:server
RUN mkdir -p /app/logs


# Stage 3: production dependencies
FROM node:24-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN npm ci --omit=dev && npm cache clean --force

# Stage 4: stripped Node.js binary
FROM node:24-alpine AS node-runtime

RUN apk add --no-cache binutils \
    && strip --strip-debug --strip-unneeded \
       -o /usr/local/bin/node-stripped /usr/local/bin/node

# Stage 5: minimal Alpine production runtime
FROM alpine:3.24 AS runtime

WORKDIR /app

RUN addgroup -S -g 1000 node \
    && adduser -S -u 1000 -G node node

COPY --from=node-runtime /usr/local/bin/node-stripped /usr/local/bin/node
COPY --from=node:24-alpine /usr/lib/libstdc++.so.6.0.34 /usr/lib/
COPY --from=node:24-alpine /usr/lib/libgcc_s.so.1 /usr/lib/

RUN ln -s libstdc++.so.6.0.34 /usr/lib/libstdc++.so.6

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --from=build --chown=node:node /app/logs ./logs

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/server/src/index.js"]
