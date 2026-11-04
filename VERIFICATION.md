# Vercel preparation and HTTP hardening — 5 November 2026

- Added Git-connected frontend/Express Vercel configuration and a hosting runbook; Supabase remains hosted separately, with its existing private Cron scheduler.
- API auth/finance/error responses now explicitly prohibit caching, suppress framework identification, and set MIME/referrer protections. Oversized JSON returns 413 without logging submitted credentials. HTTP regression checks cover successful/unauthorized responses and real parser rejection.
- Frontend response configuration suppresses framework identification and prevents invitation URLs leaking through outbound referrers.
- Backend build and frontend lint/production build passed. **82 tests passed, one Cron-coordinated test skipped** with `RUN_SUPABASE_INTEGRATION=1`: 65 local tests plus 17 real hosted integration tests. The skipped scheduler-coordination test was not represented as live verification in this run.
- Production dependency audit: zero reported vulnerabilities. Hosted security advisors still report the 20 intentional authenticated SECURITY DEFINER entrypoints and disabled leaked-password protection; no additional advisory categories appeared.
- Vercel team access is authorized. Initial GitHub import failed because the Git provider was not connected; after account connection the API reported missing repository integration access. Production deployment and live URL walkthrough are pending that grant. Unrelated tracked dependency files and OAuth credentials remain excluded from commits.

---

# Everyday money redesign and calendar verification — 2 November 2026

## Delivered and checked

- The confirmed design reference is Money Manager by Gunawan Santoso. Research sources and implementation choices are in DESIGN_RESEARCH.md.
- Rebuilt Home, transaction history, mobile navigation, group list/details, shared transaction forms, and appearance controls. Added a spending calendar, safe Decimal calculator, timezone-aware day/month/custom-date history filters, and settlement-adjusted group-card balances. Ad-hoc split editing preserves existing people and payer-only participation.
- **81 tests in 12 files passed** with hosted Supabase and Cron integration enabled: 63 local unit/route/privacy tests and 18 hosted API/auth/concurrency tests. This includes all split modes and recurrence/accounting suites retained from earlier releases, plus calculator validation and timezone-aware calendar/history coverage.
- The private scheduler was explicitly invoked for the Cron fixture; draft posting verification used the real hosted database. No mocks are reported as hosted checks.
- New hosted `calendar.sql` rollback assertions passed as the authenticated role: spring/fall DST boundaries (23/25 hours), leap day, Kolkata's half-hour offset, invalid date ranges, missing authentication, and denied anonymous execution. Fixture timezone updates were rolled back.
- Final backend build, frontend ESLint, and Next.js 16.4.4 production build passed after the last UI fixes.
- Browser checks at 390×844 verified Home quick actions, default owned account, amount-field focus, calculator `(12,5+3,5)÷2` → `8.00`, calendar day selection with 19 matching fixture entries, More navigation, and light/dark appearance persistence after reload. No expense was submitted during these UI checks. Existing preview cash remained 100.19.
- DOM width checks showed no horizontal overflow on Home/Settings/history/calendar at 390px after fixing the history toolbar. Desktop Home also had equal viewport/content widths at 1280px. These are desktop-browser viewport checks, not physical-device tests. Saved screenshots document the overview.
- Settings retains the saved timezone even when the browser exposes a different IANA alias; selecting no changes will not silently substitute UTC. Light mode was restored after appearance testing.
- Framework/dependency patches applied; `npm audit --omit=dev` reported **zero production vulnerabilities**. Sixteen moderate development-tooling findings remain in the ESLint/minimatch chain; no forced major downgrade was applied.
- Hosted security advisors still report the intentional actor-authorized SECURITY DEFINER entrypoints and existing [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The calendar function is SECURITY INVOKER; no new RLS/search-path findings were reported. See [Supabase's function advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Remaining checks and workspace notes

- Real Google consent, confirmation-email delivery, physical device installation, full offline-browser behavior, and exhaustive walkthroughs of every core form remain unverified. Earlier provider and CSV-download permission limits below remain unchanged.
- This is an installable responsive web app; no native store package, hosted frontend deployment, or bank/payment integration was created.
- No credentials were committed. Existing tracked `node_modules/concurrently` and `node_modules/shell-quote` files were regenerated by dependency installation and excluded from source commits; the root lockfile records the reproducible updates. The OAuth file was untouched. No branch push or merge was performed.

---

# Productivity and installable-app verification — 2 November 2026

## Delivered

- Private monthly overall/category budgets, atomic previous-month copying, and dashboard spending-limit alerts.
- Savings goals linked to owned asset accounts, with progress from real balances and no ledger mutations.
- Debounced transaction-note search, literal wildcard handling, source/amount filters, sorting, server pagination, and filtered CSV export.
- Live category-spending reports using personal analytics attribution; no transfers, settlements, or virtual adjustments counted.
- Append-only member-only group activity, plain-text expense comments, author editing, and owner moderation.
- Installable responsive web-app manifest/icons and Settings instructions; production-only service worker caches a self-contained public offline screen only.
- Three additional hosted migrations applied. Owner RLS protects planning records; group membership protects activity/comments. Currency changes cannot silently reinterpret saved plans.

## Passed

- **56 tests in 10 files** with hosted and Cron integration enabled: 39 local unit/route/privacy tests and 17 hosted API/auth/concurrency tests.
- The new hosted suite validates budget timezone boundaries, personal split attribution, budget-copy idempotency, account ownership, goal balance neutrality, literal `%`/`_` search, pagination/sorting, CSV response/escaping, outsider isolation, comment authorship/moderation, and feed immutability.
- CSV unit tests cover commas, quotes, Unicode, multiline notes, nulls, negative numeric values, and spreadsheet-formula neutralization.
- Service-worker tests verify only the public offline document is cached, API/non-navigation/cross-origin traffic is ignored, navigation failure returns the fallback, and unrelated caches are preserved.
- Hosted `planning.sql` rollback assertions passed, including planning currency guards and no ledger side effects. The existing full `accounting.sql` rollback suite also passed after activity triggers were installed.
- Backend build, frontend ESLint/typecheck, and Next.js production build passed. Manifest metadata was read from the running app; PNG icons have the required 192×192 and 512×512 dimensions.
- Browser checks verified budget creation/progress, savings goal creation/progress from the live account balance, new navigation, and transaction-search empty state. The previous release's desktop/mobile split and recurring checks are retained below.
- The combined test run exposed an older fixture logout test invalidating concurrent fixture sessions. It now signs out only its own session; the subsequent full 56-test run passed.
- Security/performance advisors report only intentional authenticated SECURITY DEFINER RPC warnings, the pre-existing leaked-password setting, and unused-index information. No new RLS/search-path/FK-index findings remain.
- Automated and browser-test planning records were removed. The original preview account still has exactly 100.19; no user drafts or credentials were changed.

## Explicit limits

- The browser CSV-download check was blocked because its download permission was declined. No alternate browser/download path was attempted. The HTTP endpoint and CSV format tests passed before that browser check.
- Actual phone/desktop app installation and a live offline-browser walkthrough were not performed. Production service-worker behavior is covered by code-level privacy tests; development intentionally does not register a worker. HTTPS hosting is required outside localhost. No native App Store/Play Store package or deployment was created.
- Real Google consent and confirmation-email delivery remain dependent on external provider/dashboard configuration. Existing Google/email caveats below still apply.
- Full access was not granted or changed by the agent. The supported unattended option is the user's permissions selector; some browser/provider actions still require separate approval. No payments, bank connections, external messages, or public publishing were performed.

---

# Verification — 2 November 2026

## Everyday expense-sharing release

- Branch: `codex/everyday-sharing`; four implementation milestone commits.
- Five new versioned migrations applied to the existing hosted Mumbai project: invitations, templates, recurring drafts, private rate-limit policy, and review/rejoin edge cases. Generated TypeScript database types reflect the new tables/functions.
- Hosted hourly job `generate-expense-drafts-hourly` is active with schedule `0 * * * *`. Its private function is not executable by browser roles; anonymous users cannot execute scheduling RPCs.
- **34 tests passed in seven Vitest files**, with both `RUN_SUPABASE_INTEGRATION=1` and `RUN_CRON_INTEGRATION=1`: 23 unit/route tests plus 11 hosted API/auth/concurrency tests. The cron test was coordinated with an administrator invocation of the actual private generator, not a mock.
- Concurrent owner approvals created one membership. Five concurrent draft-post requests returned one expense. Invalid posting left the draft pending and created no accounting records. A deleted posted expense could not be reposted.
- Hosted rollback SQL suites `accounting.sql`, `invitations.sql`, `templates.sql`, and `recurring.sql` passed. They cover expiration/regeneration, pending-user isolation, owner authorization, rejection/rejoining, currency mismatch, database rate limits, all allocation modes, invalid totals, multiple payers, private-field exclusion, member-removal correction flags, scheduler catch-up/deduplication, monthly/leap-year anchors, DST/local-midnight cutoffs, paused-period skipping, snapshot preservation, posting rollback, and owner posting without a personal share.
- Backend build, frontend lint/typecheck, and Next.js production build passed. Error-handler tests verify invitation/auth token-bearing bodies and error details are never logged, including malformed JSON.
- Browser checks against the live hosted backend: session restoration; group/template/schedule creation; invitation generation/revocation; generated-draft display; draft editing without posting; posting with selected account/category; refreshed draft and expense lists. The review/post workflow also passed at a 390×844 mobile viewport.
- Security/performance advisors were reviewed. No missing-FK-index, mutable-search-path, unexpected public access, or policy warnings remain. Intentional authenticated SECURITY DEFINER RPC warnings remain, as does the existing leaked-password-protection setting. Unused-index informational notices are expected for a lightly used development project; authorization/FK indexes were retained.
- All automated test groups and expenses were cleaned up or rolled back. The browser verification group was also reversed/removed after verification; the earlier preview account remains unchanged.

## Remaining external/manual limits

- Real Google consent and confirmation-email delivery remain unverified because provider credentials/mail delivery and dashboard redirect configuration are external prerequisites. Add both `/login` and `/join` to Supabase's allowed redirect URLs. Pending invitations survive login and confirmation in the same browser; on another browser/device, reopen the original invite link.
- The browser walkthrough covered the new workflows and mobile draft review/posting. It did not exhaustively repeat every legacy form and responsive breakpoint; the previous accounting/API coverage remains relevant below.
- The hosted Auth advisor still reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This setting was not changed.
- Authenticated privileged RPCs intentionally implement cross-user accounting and approval operations. Actor checks, fixed search paths, direct-write restrictions, and integration tests are required; see [Supabase's security-definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Longer SQL attempts initially hit expired tool confirmations; the committed suites were then simplified to avoid unnecessary helper objects and successfully executed with rollback.

---

# Previous migration verification — 1 November 2026

## Environment

- Hosted Supabase project: [expense-manager](https://supabase.com/dashboard/project/umguuvkeyeuhpgxvqxkt), Mumbai (`ap-south-1`).
- Supabase integration installed/connected; seven versioned schema/accounting migrations applied and inspected through that connection.
- Express and Next.js run locally against hosted Supabase. No Docker/local database dependency remains.
- Generated `backend/src/database.types.ts` reflects the hosted schema. Request-scoped database reads use these types.

## Passed

- Backend TypeScript compilation.
- Frontend TypeScript compilation, ESLint, and Next.js production build with Webpack.
- 28 Vitest tests with the hosted integration suite enabled: 21 unit/route-response tests and seven HTTP/auth/concurrency integration tests.
- Hosted SQL assertions in `supabase/tests/accounting.sql`, with all mutations rolled back: linked transfers, manual transaction editing/reversal, failed-operation rollback, all split modes, remainder cents, multi-payer expenses, valid/invalid split replacement, generated-entry protection, outsider RLS, owner controls, partial/full settlement, overpayment prevention, historical settlement guard, bilateral ad-hoc visibility, and reciprocal expense reconciliation/reversal.
- Twenty concurrent income writes preserved the exact expected account balance.
- Browser smoke checks: Supabase login, full-page session restoration, live transaction history/filter controls, and analytics showing hosted values with the saved timezone. No browser console errors were reported in the checked tab.
- Database advisor findings for missing foreign-key indexes and mutable search paths were addressed. Authenticated security-definer accounting RPCs are intentional; their authorization and direct-write protections are exercised by the hosted tests. See [Supabase’s security-definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) for the rationale behind that warning.

## Limits and retained preview data

- The preview uses reserved disposable integration identities (`@example.invalid`). The initial sample account/data remain available because an interactive draft split was open during verification. No user draft was intentionally submitted, deleted, or replaced. The repeatable HTTP suite cleans the accounts and transactions it creates on subsequent runs.
- After finishing preview work, run `supabase/tests/cleanup_auth_fixtures.sql` to remove the reserved test identities and sample data. The ignored test-password environment file is not committed.
- The hosted Auth advisor reports that [leaked-password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This dashboard setting was not changed; enable it before production use where available.
- Real Google consent and confirmation-email delivery were not tested. Configure Google provider credentials and production/site redirect URLs in the Supabase dashboard as described in README.md. Unit coverage checks the Google ID-token exchange and the confirmation-required signup response; these are not live provider tests.
- Full interactive walkthroughs of every frontend form and responsive breakpoint remain manual checks. Hosted SQL/API verification is not a substitute for that UI coverage.
- Turbopack failed to start its CSS worker in this environment. The supported Webpack backend passed and is now the configured development/build command.
- The deleted `scratch.txt` and the existing OAuth credential file were excluded from implementation commits.
