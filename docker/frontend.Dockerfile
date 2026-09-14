FROM node:22-alpine AS builder

WORKDIR /app

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Build Next.js
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:5000/api}
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
