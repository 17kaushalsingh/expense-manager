# Expense Manager

A consolidated platform combining personal asset/liability management with group expense splitting. The core architecture relies on a Hybrid Ledger Engine, which automatically maps split transactions into personal double-entry balance sheets (Assets, Liabilities, Receivables, Payables) without double-counting expenses.

## Project Structure

- `frontend/` - Next.js App Router UI.
- `backend/` - Express API, Prisma client, and domain routes.
- `backend/prisma/` - Prisma schema and PostgreSQL migrations.
- `docker/` - Dockerfiles for both services.
- `docker-compose.yml` - Full stack containerization (Frontend, Backend, PostgreSQL).

## Local Development

### Option 1: Docker (Recommended)
You can run the entire application stack using Docker Compose:
```bash
docker-compose up -d --build
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`

### Option 2: Manual Setup
1. Configure backend environment:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Start PostgreSQL via Docker:
   ```bash
   docker-compose up -d postgres
   ```
3. Apply database migrations:
   ```bash
   npm run db:migrate -w backend
   ```
4. Run the frontend and backend concurrently:
   ```bash
   npm run dev
   ```

## Functional Requirements (Core Features)

1. **User & Identity**: JWT-based authentication. Configurable display currency and timezone.
2. **Personal Finance**: Track Cash, Bank Accounts, Cards, Investments, and Loans. Support for explicit Self Account Transfers.
3. **Group Expense Engine (Splitwise Core)**:
   - Support for multiple split algorithms: Equal, Exact, Percentage, and Shares.
   - Multi-payer support.
   - **Debt Simplification (Min-Cash-Flow)**: Condenses group debts into minimal transactions.
4. **Unified Hybrid Ledger**:
   - Automated Ledger Mapping: When an expense is split, the system performs a dual-ledger update linking cash outflows and personal expenses to virtual `ACCOUNTS_RECEIVABLE` and `ACCOUNTS_PAYABLE`.
   - Double-entry tracking with `linkedTransactionId`.
   - Immutable Audit Logging for all split modifications.
5. **Analytics**: Real-time Net Worth tracking and cash flow analysis.
6. **Smart Reminders**: Push/Email notifications for credit card bills, EMIs, and pending debts.

## Design Philosophy & Visual Tokens (Coinbase Inspiration)

The UI leverages a dark-mode first, high-contrast aesthetic heavily inspired by Coinbase.
- **Bold Numerical Hierarchy**: Financial balances are the visual anchor. Large numbers use `tabular-nums`.
- **Tactile Surface Contrast**: Instead of heavy drop shadows, elevation is defined by crisp, 1px subtle borders (`border-neutral-800`).
- **Contextual Color Coding**:
  - Positive / Receivables: Crisp Emerald (`#00D395`)
  - Negative / Payables: Soft Crimson (`#FF4D4D`)
  - Neutral / Brand: Coinbase Blue (`#0052FF`)

## AI Assistant Guidelines (GEMINI rules)

- **Isolated Development**: Develop features and flows one at a time. Each feature, fix, or enhancement should be developed in isolation, with its own dedicated branch.
- **Atomic Commits**: Write atomic commits with clear, descriptive messages representing a single logical change.
