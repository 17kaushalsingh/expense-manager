FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for workspaces
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

# Copy frontend source
COPY frontend/ ./frontend/

WORKDIR /app/frontend
# Build Next.js
ENV NEXT_PUBLIC_API_URL=http://localhost:5000/api
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/package.json ./frontend/
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public

WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
