FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs ptvtracker

COPY --from=deps /app/node_modules ./node_modules
COPY config ./config
COPY middleware ./middleware
COPY routes ./routes
COPY server.js package.json ./

EXPOSE 3000
USER ptvtracker
ENV NODE_ENV=production
CMD ["node", "server.js"]
