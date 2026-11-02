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

In the Supabase Dashboard, set **Authentication → URL Configuration → Site URL** to `http://localhost:3000` for development and allow both `http://localhost:3000/login` and `http://localhost:3000/join` as redirect URLs. Set the deployed app's URL before production use. With email confirmation enabled, signup displays a confirmation instruction instead of creating an authenticated app session.

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

## Invitations, templates, and recurring drafts

Group owners can create/revoke/regenerate seven-day invitation links and approve or reject membership requests. Requesters must sign in through Supabase; until approval they see only the group name, currency, and request status. Currency mismatches block approval. Links use URL fragments so bearer tokens are not sent in server request URLs, and PostgreSQL stores only SHA-256 hashes. Save a newly generated link immediately: its token cannot be retrieved afterward. Creating a replacement revokes the previous link. Lookup and request limits are enforced per authenticated identity in PostgreSQL (60 lookups or 10 join attempts per one-minute window).

The browser retains a pending invitation through sign-in, registration, and confirmation in the same browser. If confirmation is opened on a different device/browser, reopen the original invitation link there. Allow `/join` in Supabase Auth redirect URLs for both development and production. There is no public user directory or anonymous group preview.

Any group member can save/use a template with equal, exact, percentage, or shares allocations and multiple payers. Its creator or group owner can edit/archive it. Templates contain ordered participants, payer amounts, and an optional total; they never retain account or personal category IDs. Applying a template opens the split editor for review. Removed participants are flagged; correct their allocations before posting. Exact allocations and multiple-payer amounts are not rescaled when totals change. Group members can record a group expense without owing a share themselves; ad-hoc expenses still require creator involvement.

Create a weekly, monthly, or yearly schedule from a complete template. Its creator or group owner can pause/archive it, change its end date, and review/edit/post/skip drafts. Cadence, start date, and timezone are fixed after creation; archive and create a new schedule to change them. Start dates cannot be in the past. Monthly/yearly schedules retain the original anchor, clamping short months and leap days. Resuming skips past paused dates; existing pending drafts remain reviewable. Archiving a template pauses linked schedules on the next scheduler run. Archive a member's schedules before removing that member.

The recurring migration enables hosted `pg_cron` and installs `generate-expense-drafts-hourly` (`0 * * * *`). It invokes a private database function directly, with no service-role key or always-on Express process. Jobs create snapshots only: **drafts do not change balances, debts, or analytics**. Template edits affect later occurrences, not existing snapshots. Catch-up processes up to 100 occurrences per schedule per run; any remaining backlog continues next hour. Posting and linking the expense happen in one accounting transaction. Concurrent/retried posting returns the original expense; deleting that expense never permits reposting the same occurrence.

Monitor the job in Supabase **Integrations → Cron**, or inspect `cron.job_run_details`. A failed run can be retried safely by an administrator with `select private.generate_expense_drafts();`. Browser roles cannot execute the scheduler. SQL date handling uses the hosted PostgreSQL timezone database; keep the hosted Postgres version current for regional timezone-rule changes.

### New REST resources

All paths below are under `/api`, require a Supabase access token, and retain camelCase responses:

| Resource | Operations |
| --- | --- |
| `/invitations/groups/:groupId` | GET owner metadata/requests; POST create/regenerate; DELETE revoke |
| `/invitations/lookup`, `/invitations/request` | POST `{ token }` for preview/request |
| `/invitations/groups/:groupId/requests/:requestId` | POST `{ decision: "APPROVE" or "REJECT" }` |
| `/templates/groups/:groupId` | GET list with `needsCorrection`; POST `{ name, payload }` |
| `/templates/groups/:groupId/:id` | PUT replacement; DELETE archive |
| `/recurring/schedules/groups/:groupId` | GET schedules visible to group members |
| `/recurring/schedules` | POST `{ templateId, frequency, startDate, endDate?, timezone }` |
| `/recurring/schedules/:id` | PUT `{ status?, endDate? }` |
| `/recurring/drafts?groupId=…` | GET group drafts; omit groupId for actionable dashboard drafts |
| `/recurring/drafts/:id` | PUT corrected split payload without account/category selections |
| `/recurring/drafts/:id/post`, `/recurring/drafts/:id/skip` | POST reviewed split payload or empty object, respectively |

## Budgets, savings goals, and collaboration

- **Budgets**: set overall or category limits per calendar month. Spending uses your saved timezone and counts only personal expenses; shared bills count your share once. Overall and category limits overlap and are never added together. Copying the previous month is atomic and leaves existing limits unchanged. The dashboard highlights limits at 80% usage and above. Deleting a category removes its budgets while clearing its historical transaction references.
- **Savings goals**: link one goal to each owned asset account and follow its actual balance. Targets and optional dates are planning information, not money movements. Accounts linked to a goal cannot be deleted until the goal is removed. Remove planning records before changing accounting currency.
- **Transaction history**: search notes (including literal `%` and `_`), filter source and amount ranges, sort by date or amount, and browse pages of 50 records. Existing unpaginated REST responses remain compatible.
- **CSV export**: export all records matching the current filters, not just the displayed page. CSV includes actual balance deltas and personal analytics amounts separately; generated adjustments may have zero personal spending. Dates are UTC, currency is explicit, Unicode is supported, and user-controlled formula-like text is neutralized for spreadsheets.
- **Category reports**: Analytics shows live category spending for the selected range with percentages. Transfers, settlements, and AR/AP adjustments are excluded.
- **Group activity and comments**: new expense changes, settlements, membership changes, and comments appear in a member-only immutable activity feed. Authors edit their comments; group owners can moderate deletion. Removed comments retain a `[Deleted]` marker. No messages, email, or push notifications are sent to external services.

Planning routes are `/api/planning/budgets?month=YYYY-MM`, `/budgets/:id`, `/budgets/copy`, `/goals`, and `/goals/:id`. Budget writes take `{ month: "YYYY-MM-01", categoryId?, amount, currency }`; goal writes take `{ name, accountId, targetAmount, targetDate?, currency }`. All records have owner RLS and database validation; neither feature writes ledger entries.

`GET /api/transactions/page` returns `{ items, total, limit, offset }`; `GET /api/transactions/export` returns a CSV attachment. Both accept existing filters plus `q`, `sourceType`, `minAmount`, `maxAmount`, `sort=newest|oldest|highest|lowest`, `limit`, and `offset`. Export ignores pagination and retains the other filters. Category reporting is `/api/analytics/category-spending?range=1W|1M|3M|1Y|ALL`.

Collaboration routes are `/api/collaboration/groups/:id/activity?offset=0`, `/splits/:id/comments` (GET/POST), and `/comments/:id` (PUT/DELETE). Comment bodies are plain text, limited to 2,000 characters, and visible only to current members of that expense’s group. Historical actor names are retained in the group feed. Existing history is not retroactively fabricated.

## Installable app

The frontend includes a web-app manifest, app icons, standalone display mode, and installation guidance in Settings. Supporting browsers can install LedgerSync from HTTPS or localhost; iOS uses Safari → Share → Add to Home Screen. This is an installable responsive web app, not an App Store/Play Store native package.

The service worker registers only in production. It caches one self-contained public offline page and never caches financial pages, API responses, credentials, or authenticated data. An internet connection is required for financial reads and writes; offline changes are not queued. Run the frontend production build/start to exercise service-worker registration. Automated tests cover its caching/privacy rules; actual device installation and a live offline-browser walkthrough remain separate device checks.

## Checks

```sh
npm test -w backend
npm run build -w backend
npm run lint -w frontend
npm run build -w frontend
```

Hosted rollback suites are in `supabase/tests/accounting.sql`, `invitations.sql`, `templates.sql`, `recurring.sql`, and `planning.sql`. Run each whole file as one transaction through Supabase MCP or a database client. The sharing suites require the reserved HTTP fixture identities below; every suite rolls its mutations back. Never run these suites with real user identities.

For a dedicated test project:

1. Set `test.password` in a SQL transaction and run `supabase/tests/auth_fixtures.sql` in the same transaction. It creates three reserved `@example.invalid` users; do not seed them in production or reuse those UUIDs.
2. Set `SUPABASE_TEST_PASSWORD` in ignored `backend/.env.integration.local`. Backend `.env` supplies the hosted URL and publishable key.
3. Run `npm run test:integration -w backend`. This runs HTTP/session/concurrency and sharing tests, cleaning their own accounts, transactions, and groups. No browser server is needed.
4. To include concurrent draft posting, run `RUN_SUPABASE_INTEGRATION=1 RUN_CRON_INTEGRATION=1 npm test -w backend`. When `CRON_FIXTURE_READY` appears, invoke `select private.generate_expense_drafts();` through an administrator connection. The test waits up to 90 seconds for its draft. This is an explicit manual coordination step because browser credentials cannot run the private scheduler.
5. Close previews using fixture logins before running `supabase/tests/cleanup_auth_fixtures.sql`. It deletes only reserved identities and their fixture records. Never use it with real users.

See `VERIFICATION.md` for passed checks and external provider limitations.

## Contribution workflow

Develop on a `codex/` feature branch and commit each logical milestone atomically. Never stage credentials, local environment files, or unrelated working-tree changes. The workspace root `package-lock.json` is the dependency source of truth for both applications.
