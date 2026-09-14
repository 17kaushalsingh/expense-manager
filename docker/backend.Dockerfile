FROM node:22-alpine AS builder

WORKDIR /app

# Copy backend package files
COPY backend/package.json backend/package-lock.json* ./
RUN npm install

# Copy backend source
COPY backend/ ./

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
