# Expense Manager

Monorepo for a personal finance and group expense splitting app.

## Project Structure

- `frontend/` - Next.js App Router UI.
- `backend/` - Express API, Prisma client, and domain routes.
- `backend/prisma/` - Prisma schema and PostgreSQL migrations.
- `docker-compose.yml` - Local PostgreSQL database for development.
- `PROJECT.md` - Product and functional requirements.
- `FRONTEND.md` - UI design direction.

## Local Development

1. Configure backend environment:

   ```bash
   cp backend/.env.example backend/.env
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Apply database migrations:

   ```bash
   npm run db:migrate
   ```

4. Run the frontend and backend:

   ```bash
   npm run dev
   ```

The backend listens on `http://localhost:5000` by default. The frontend expects `NEXT_PUBLIC_API_URL` to point at the backend API root, defaulting to `http://localhost:5000/api`.

## Design Notes

- Backend app composition lives in `backend/src/app.ts`; `backend/src/index.ts` only starts the HTTP server.
- Shared persistence goes through Prisma. Avoid raw SQL in route handlers unless there is a measured reason.
- Money is still represented as `Float` in the current schema. Before production use, migrate monetary fields to `Decimal` and centralize currency rounding rules.
- Route handlers currently own validation and orchestration. As flows grow, move request validation into schemas and business rules into domain services to keep routes thin.
