FROM node:20-alpine AS deps

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

FROM node:20-alpine AS builder

WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_DEFAULT_BACKEND_ID=local-docker
ARG NEXT_PUBLIC_DEFAULT_BACKEND_NAME=Local Docker Backend
ARG NEXT_PUBLIC_DEFAULT_BACKEND_URL=http://api:18437
ARG NEXT_PUBLIC_DEFAULT_BACKEND_INSECURE_TLS=false
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_DEFAULT_BACKEND_ID=$NEXT_PUBLIC_DEFAULT_BACKEND_ID
ENV NEXT_PUBLIC_DEFAULT_BACKEND_NAME=$NEXT_PUBLIC_DEFAULT_BACKEND_NAME
ENV NEXT_PUBLIC_DEFAULT_BACKEND_URL=$NEXT_PUBLIC_DEFAULT_BACKEND_URL
ENV NEXT_PUBLIC_DEFAULT_BACKEND_INSECURE_TLS=$NEXT_PUBLIC_DEFAULT_BACKEND_INSECURE_TLS
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/. .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV FRONTEND_HOST=0.0.0.0
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/server.js ./server.js

EXPOSE 8080
CMD ["node", "server.js"]
