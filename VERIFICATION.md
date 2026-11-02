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
