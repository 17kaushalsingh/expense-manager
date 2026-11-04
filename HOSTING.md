# Hosting on Vercel

Use two Git-connected Vercel projects for `17kaushalsingh/expense-manager`:

| Project | Root directory | Framework | Production branch |
| --- | --- | --- | --- |
| expense-manager | frontend | Next.js | main |
| expense-manager-api | backend | Express | main |

Enable access to files outside each root directory so npm can resolve the root workspace lockfile. Use Node.js 22 and npm installation from the workspace lockfile. Both committed Vercel configurations select Mumbai (`bom1`), near the existing hosted Supabase database. Express is deployed through its default app export; no persistent server, Docker image, or API rewrite is required. Local development still uses `src/index.ts`.

## Production configuration

Configure these variables before triggering the production builds. Substitute the actual stable production domains assigned to the projects; deployment-specific URLs are unsuitable for permanent configuration.

| Project | Variable | Value |
| --- | --- | --- |
| API | SUPABASE_URL | Existing hosted Supabase project URL |
| API | SUPABASE_ANON_KEY | Project publishable key (or legacy anon key) |
| API | CORS_ORIGIN | Exact frontend HTTPS origin, without trailing slash |
| Frontend | NEXT_PUBLIC_API_URL | Stable API HTTPS origin followed by `/api` |
| Frontend | NEXT_PUBLIC_SUPABASE_URL | Same Supabase URL |
| Frontend | NEXT_PUBLIC_SUPABASE_ANON_KEY | Same publishable key |
| Frontend | NEXT_PUBLIC_GOOGLE_CLIENT_ID | Optional configured Google web client ID |

The app needs no Supabase service-role key. Never upload `oauth_client_secret.json`, local environment files, integration-test credentials, or `.vercel` state. Public-prefixed values are visible in the frontend bundle. Configure production variables for Production only; previews should use a separately initialized staging Supabase project, not production financial data. Until staging exists, previews without Supabase configuration are not functional finance environments.

In Supabase Auth, set the Site URL to the frontend production origin and allow its `/login` and `/join` URLs. Keep localhost redirects only if still required for development. Configure Google authorized origins/provider settings separately. Hosted Supabase Cron continues generating recurring drafts; Vercel does not run that scheduler.

## Release and verification

1. Run backend tests/build and frontend lint/build. Commit only intended source/configuration files, then push the reviewed commit to GitHub.
2. Create or verify both linked projects in the intended Vercel team. Check root directories, framework settings, Node version, production branch, and environment-variable scopes.
3. Deploy the same commit for the API and frontend. Confirm both builds reach READY and the stable aliases resolve to those deployments.
4. Check the API `/api/health` endpoint (200) and unauthenticated `/api/accounts` (401). Financial and auth responses must have `Cache-Control: no-store`; test CORS from the actual frontend origin.
5. Verify login, session restoration/refresh, sign-out, navigation, reads, and a reversible transaction through the live frontend. Verify email-confirmation and Google consent with the configured providers. Do not describe local tests as production verification.
6. Inspect build/runtime errors after the walkthrough. Preserve preview deployment protection; use supported authenticated access to inspect protected previews.

To recover from a faulty release, roll both projects back to a known compatible deployment. Supabase schema migrations are separate and must remain compatible with the selected code; rolling back Vercel does not reverse database migrations.

## Current provisioning status

Configuration is prepared in the repository. Vercel team access for `kaushal-singhs-projects-18943219` is authorized. GitHub must be connected in Vercel account authentication settings before the repository can be imported; the initial import returned `repo_not_found` and provider lookup returned `github_response_error`. No production URL is recorded here until a deployment has actually been verified.
