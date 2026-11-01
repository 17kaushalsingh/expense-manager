# LedgerSync Expense Manager

Personal accounts, income/expense tracking, and group splitting backed by **hosted Supabase PostgreSQL and Supabase Auth**, with an Express API and Next.js frontend. No Docker or local database is required.

## Hosted project

The configured development project is [expense-manager (Mumbai)](https://supabase.com/dashboard/project/umguuvkeyeuhpgxvqxkt). Non-secret project metadata is in `supabase/project.json`. Database schema and accounting functions are versioned in `supabase/migrations/` and have been applied to this project through the Supabase integration.

## Run locally

Use Node.js 22 or later and install dependencies once at the repository root:

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Set both Supabase URLs to your hosted project's API URL. Set `SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the project's **publishable** key (legacy anon keys also work). The historical variable names remain for compatibility. The backend and frontend must use the same project. **No service-role key is needed by the application.** Local environment files are ignored by Git.

```sh
npm run dev
```

- App: [localhost:3000](http://localhost:3000)
- API health: [localhost:5000/api/health](http://localhost:5000/api/health)

Development and production builds use Webpack because Turbopack's CSS worker could not bind a port in this environment. The app retains the existing light/dark system-theme styling.

## Supabase Auth

Email/password registration, confirmation links, login, persistent sessions, automatic refresh, and logout use Supabase Auth. Credentials are never stored in application tables. The browser SDK owns session persistence; Express validates every bearer access token using Supabase before querying as that user. Query caches are cleared when the authenticated identity changes.

In the Supabase Dashboard, set **Authentication → URL Configuration → Site URL** to `http://localhost:3000` for development and allow `http://localhost:3000/login` as a redirect URL. Set the deployed app's URL before production use. With email confirmation enabled, signup displays a confirmation instruction instead of creating an authenticated app session.

For Google sign-in, enable **Authentication → Sign In / Providers → Google**, configure your Google OAuth web client ID and secret there, and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to that client ID. Configure the allowed JavaScript origin in Google Cloud Console. Google sign-in is hidden until this public client ID is configured. The browser exchanges the Google ID token with Supabase; Google secrets never belong in frontend environment variables. Live Google consent and email delivery require provider/dashboard configuration and were not verified by the automated tests.

## Database and accounting

For a new Supabase project, apply the SQL files in `supabase/migrations/` in filename order through the Supabase MCP integration or dashboard migrations. Alternatively, authenticate the Supabase CLI, link the project, and use its hosted migration workflow. Projects initially migrated through MCP should continue using that migration history unless CLI migration versions are reconciled first. Do not rerun schema creation against an already initialized database.

RLS isolates private financial records. Group membership and profile helpers expose only the member IDs and names needed by the UI. Exact-email lookup supports adding existing users without a browseable user directory. Group owners manage membership; expense creators and group owners manage expenses. Member removal requires a zero group balance, and groups with financial history cannot be deleted.

Accounting writes use authenticated, narrowly authorized PostgreSQL RPCs. They serialize financial mutations with a transaction-level advisory lock, validate ownership and currency in the database, and commit all entries and balance effects together. Direct account/transaction/split/settlement writes are denied to browser roles. The security advisor intentionally reports the authenticated `SECURITY DEFINER` entrypoints: their cross-user ledger writes are required, and their actor checks, permissions, and fixed search paths must be retained.

- Money uses `NUMERIC(14,2)`; proportional shares use `NUMERIC(14,4)`.
- Proportional splits floor each allocation to cents, then assign remainder cents in participant order.
- Each split records cash paid separately from personal expense attribution. Transfers, settlements, and virtual account adjustments are excluded from cash-flow analytics.
- Virtual AR/AP accounts reconcile remaining group and bilateral obligations, including offsetting expenses. Split updates/deletes reverse source-linked ledger effects. Once a settlement exists in that context, historical split changes are blocked.
- Group settlements follow current simplified debt edges. Ad-hoc settlements net bilateral obligations derived within each expense, keeping unrelated private expenses out of the graph.
- Each user and group uses one currency. Transfers requiring conversion are rejected; profile currency changes are blocked after financial activity or while in a group using another currency. No exchange-rate conversion is performed.
- Other users' private account lists are never selectable. Their split payments and settlement receipts use deterministic default cash accounts.
- Linked transfers and generated accounting entries are read-only in the manual transaction editor. Referenced accounts cannot be deleted; system accounts are protected.
- Reminders are in-app records; no scheduled email/push delivery service is included.

## API additions

Existing `/api` resources and camelCase response fields are retained. CRUD is complete for manual transactions, categories, groups, and split expenses. The API includes exact-email user lookup, group member removal, profile settings, validated reminders, and settlement recording.

`GET /api/transactions` accepts `type`, `accountId`, `categoryId`, `from`, and `to` filters. `GET /api/analytics/cash-flow` accepts `range=1W|1M|3M|1Y|ALL`, optional ISO `from`/`to`, and `groupBy=day|month`; it returns totals and zero-filled `series` buckets using the saved timezone. Transaction history is paginated internally through PostgREST so results are not silently truncated. `/api/analytics/debts` returns the caller's ad-hoc debt graph.

## Checks

```sh
npm test -w backend
npm run build -w backend
npm run lint -w frontend
npm run build -w frontend
```

Hosted database assertions are in `supabase/tests/accounting.sql`. Run the whole file as one transaction via Supabase MCP or a database client: it seeds four reserved identities, switches authenticated roles, verifies atomicity/reversals/RLS/settlements, and rolls everything back.

The opt-in HTTP/session/concurrency suite uses three dedicated fixture identities. For a dedicated test project:

1. Set `test.password` in a SQL transaction and run `supabase/tests/auth_fixtures.sql` in the same transaction. It creates only reserved `@example.invalid` users; do not seed it in a production project or reuse those UUIDs.
2. Set `SUPABASE_TEST_PASSWORD` in the ignored `backend/.env.integration.local` file. Backend `.env` supplies the same hosted URL and publishable key as the application.
3. Run `npm run test:integration -w backend` against those fixtures. Test-created accounts and transactions are cleaned after each run.
4. After closing any preview using a fixture login, run `supabase/tests/cleanup_auth_fixtures.sql`. It deletes only those reserved fixtures and their accounting records. Never use real user identities for these tests.

The HTTP integration checks include 20 concurrent accounting writes, reversal, RLS via both HTTP and PostgREST, token validation, refreshed/restored sessions, logout, and timezone settings. Unit tests run without a Supabase connection; the live suite is explicitly skipped unless opted in.

## Contribution workflow

Develop on a `codex/` feature branch and commit each logical milestone atomically. Never stage credentials, local environment files, or unrelated working-tree changes. The workspace root `package-lock.json` is the dependency source of truth for both applications.
