# Device, currency and portability release

Requested after production release `f35d519` on 2026-11-11. Work takes place on `codex/offline-mobile-parity`; production remains at the verified release until a subsequent merge/deployment.

## Architecture

- Keep Supabase Auth and hosted collaboration. Add an explicit device workspace for personal finances, with encrypted persistent storage, a passcode gate and a local-only option. Offline shared changes are pending until current server authorization and accounting validation succeed; an offline device cannot grant membership or execute a payment.
- Preserve the primary accounting currency. Record original foreign amounts, reference/custom rates, their effective dates and rounded accounting amounts as immutable source information. Add conversion entry and rate lookup without silently revaluing historical transactions. Provider coverage and minor units are explicit; unsupported automatic rates need manual input, never fabricated rates.
- Backups carry a versioned manifest, encrypted workspace data, attachments and integrity metadata. Validate and preview before an atomic device restore; never silently overwrite live group history or another authenticated identity. Cloud state and unsent operations must reconcile using idempotent operation IDs and conflict checks.
- Localize UI copy and formatting using checked message catalogs and explicit locale selection. No financial records or personal notes are sent to translation services.
- Reuse the application UI in native shells with bundled offline assets. Implement iOS WidgetKit and Android app widgets through a narrow snapshot bridge. Widgets hold no Supabase credentials, default to hidden amounts and open the app for financial actions. Clear widget values on logout/lock/workspace change.

## Milestones and acceptance

1. Currency conversion and source snapshots: real reference-rate lookup, manual rates, rounding and reversal tests; existing base-currency accounting remains correct.
2. Device vault and passcode: authenticated encryption, lock/reload behavior, key handling, isolation, throttling and corrupted-data rejection.
3. Full private-data archive/restore: versioning, attachment integrity, atomic import, confirmation and identity/scope safeguards; no secrets in an unencrypted export.
4. Offline personal workflows and pending collaboration: restart persistence, derived balances/analytics, dependency mapping, idempotent retries and explicit conflicts.
5. Localization: all surfaced messages go through catalogs, plural/date/number formatting and right-to-left support; missing-key checks.
6. Native packages and widgets: bundled web UI, bridge tests, privacy defaults, deep links, native build/device checks where available.
7. Final regression, security review and coverage documentation. Exact unpublished Premium entitlements remain unverified and will not be invented.

## Current environment limits

The machine has Java 26 and Apple command-line tools, but not a full Xcode installation or an Android SDK/ADB on PATH. iOS build/device verification requires Xcode and signing configuration. Native source, packaging and deterministic bridge/data tests can proceed independently. No paid provider, app-store purchase or real money movement is authorized.
