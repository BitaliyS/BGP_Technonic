FROM node:20-alpine AS deps
# Нельзя WORKDIR /app — совпадает с App Router (app/), Next путает маршруты:
# на / попадает app/app (ChatWorkspace + «Загрузка») вместо логина.
WORKDIR /frontend
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /frontend
COPY --from=deps /frontend/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=
ARG BACKEND_URL=http://technonicol-ai-backend:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && \
    echo "=== routes ===" && \
    ls -la .next/server/app/ && \
    (grep -oE 'Войти|Логин|Прикрепить|Загрузка' .next/server/app/page.js | sort | uniq -c || true)

FROM node:20-alpine AS runner
WORKDIR /frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_URL=http://technonicol-ai-backend:8000
COPY --from=builder /frontend/package.json ./
COPY --from=builder /frontend/package-lock.json* ./
COPY --from=builder /frontend/node_modules ./node_modules
COPY --from=builder /frontend/.next ./.next
COPY --from=builder /frontend/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
