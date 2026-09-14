FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for workspaces
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

# Copy backend source
COPY backend/ ./backend/

WORKDIR /app/backend
# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
