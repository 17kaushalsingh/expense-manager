# Verification — 1 November 2026

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
