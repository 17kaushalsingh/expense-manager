# Device workspaces, currency and native apps

This release was merged to `main` and deployed on 12 November 2026. The web application and Express API are live on their existing Vercel production domains; native packages have not been published to app stores. Additive database migrations are applied to the existing hosted Supabase project. No Docker, paid provider or external payment execution is involved.

## Start using a device ledger

Open **Settings → Device security & backups**. Choose a long passphrase (at least eight characters) and either protect the signed-in cloud account or create a private ledger with a name, currency and timezone. A private ledger needs no Supabase identity. In a browser, initial asset preparation needs a connection; native applications bundle their assets. Preparation confirms that code is cached before creating the vault. Security also offers a retry button after application updates.

Use `/device` for offline work. Activity supports income/expenses, transfers, foreign entries, multi-account allocations, history, editing/deletion and cached receipts. Other tabs provide accounts/categories, budgets, goals, assets/valuations, loans/repayments/reversals, reviewed personal bills, event plans, card terms, reminders and local cash-flow reports/CSV. Loan principal changes net worth without becoming income or spending. Generated financial entries are changed through their source operations.

Cloud workspaces start with an authorized snapshot and receipt files. Personal device changes update optimistic local totals; pending shared splits and settlements do not affect balances until accepted by the server. The Shared tab supports all four split modes and multiple payers, with member names and saved settlement-adjusted balances. Other people's private account lists are never exported. Current membership and settlement-history rules are rechecked online.

Review **Pending** and explicitly sync after reconnecting. Commands have persistent UUIDs and execute atomically with a recorded payload hash/result. A retry returns the original result. Account/category/resource references are remapped after creation without changing notes or descriptions. Server timestamps/row versions detect stale edits; a conflict stops later commands. Review the error and retry unchanged or explicitly discard unsynced operations and refresh. Refresh is disabled while pending changes exist. A server-accepted operation may remain pending if the device locks before acknowledgement; retry is safe.

Initial cloud sign-in, invitation approval, live group administration, provider-backed services and fresh shared data require connectivity. Template/schedule administration, online imports, PDF/XLSX generation and some advanced hosted-only screens are not duplicated in the device editor. CSV export is available offline. This is not a promise that every hosted screen performs offline writes.

## Foreign amounts

Transaction history offers **Foreign amount**. Review the original currency/amount, accounting currency, date and rate before saving. Reference quotes use [Frankfurter v2](https://frankfurter.dev/) over HTTPS, with no API key or monetary charge; only the currency pair/date are sent. Manual statement rates work offline. Reference rates are informational and may differ from a bank's rate. Unsupported pairs need a manual rate.

Source records preserve decimal strings, original amounts, the chosen rate, its effective date and the rounded accounting amount. Editing reverses recorded effects and replaces the same source; deletion reverses once. ISO original-currency minor units are validated, including zero- and three-decimal currencies. The primary accounting currency remains fixed after financial activity. Existing legacy entry forms retain their two-decimal constraints. This release does not introduce FX wallets, automatic cross-currency shared debts or retrospective balance revaluation.

## Passcodes and archive recovery

The vault uses AES-256-GCM with a fresh 96-bit IV per write and PBKDF2-SHA256 (600,000 iterations, random 128-bit salt). Keys are non-extractable and stay in memory. Financial records, file bytes, queued operations and saved Supabase sessions are inside ciphertext. Locks clear keys, auth state, query caches and widget values after five idle minutes, on hiding/backgrounding or explicit lock. Writes use serialized copy-on-write and IndexedDB revision/generation checks, including erase/recreate races between tabs.

There is no passcode recovery. Security can change the passcode while unlocked. After forgetting it, type **ERASE DEVICE** to remove this device's vault; cloud records remain intact. Switching cloud identities requires exporting/erasing the old workspace first. Browser storage removal also removes local-only finances, so keep backups outside the device.

Create a `.ledgerbackup` using a separate backup passphrase. It includes all accessible snapshot tables, pending operations and receipt bytes/SHA-256 checksums, but excludes authentication tokens. Import validates encryption/version/size/schema/identity/file hashes, shows record/receipt/command counts, then requires explicit replacement. Restore is atomic and resets widget amount sharing. A cloud archive must match the workspace owner and is restored to the device, **not over live shared/cloud history**. Pending operations still require review. Local-ledger records are not automatically uploaded to a new cloud account.

Cloud exports have an explicit 20,000-row/table and 100-MiB total bound; device encrypted plaintext is limited to 128 MiB, and import envelopes to 180 MiB. Exceeding limits fails without producing a partial backup. Missing/changed cloud receipt files also fail the export. This is a full archive within those bounds, not a server disaster-recovery substitute. Hosted Supabase's database/PITR backups remain separately managed.

Browsers use their download controls. Native builds use the OS document picker for encrypted backup export; imports use the file picker. The iOS picker compiles, but actual save/restore and WebCrypto/IndexedDB behavior still need a device walkthrough. A passcode is storage protection, not protection from malicious code in an unlocked app or a compromised device.

## Languages

Settings offers English, Hindi, Spanish and Arabic. Language preference persists on the device and in the encrypted workspace. Common navigation/forms use checked catalogs; dates/numbers/currency use `Intl` with the saved timezone. Arabic switches document/layout direction to RTL. Names, notes and other user text are never translated or sent to a translation provider. Some detailed help, validation errors and advanced controls still use English; full translation coverage is not yet claimed.

## Native builds

The checked-in Capacitor 8.6 projects use application ID `app.ledgersync.expenses` and bundled assets with `/device` as the start page. Configure the public Supabase variables in `frontend/.env.local`. `NATIVE_API_URL` optionally overrides the production HTTPS API during the build. Never bundle service-role keys. Backend CORS explicitly supports `capacitor://localhost` and `https://localhost`, with the usual token verification.

```sh
npm ci
npm run native:sync -w frontend
npm run native:sdk -w frontend
npm run native:ios -w frontend
```

`native:build` runs Next static export in an isolated temporary source copy, leaving the live dynamic group route intact even after failure/interruption. `native:sync` copies assets and regenerates the plugin/WidgetKit configuration. `native:sdk` downloads official Capacitor/Cordova iOS binary frameworks, verifies pinned upstream SHA-256 checksums, then extracts to ignored local files. This avoids a SwiftPM artifact downloader stall encountered here; no framework binaries or signing credentials are committed.

Unsigned simulator compilation:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project frontend/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath /tmp/ledgersync-ios-derived build
```

For Android, install Android Studio/SDK and an appropriate supported JDK, sync assets, then open with `npm run native:android -w frontend`. The generated Gradle wrapper downloads its distribution; this machine timed out at that step and has no SDK/ADB configured. Android app compilation is not verified.

iOS WidgetKit and Android AppWidget show a private, expiring summary and open the device workspace for entry. Amounts are hidden by default; explicitly sharing totals never shares accounts, identity, notes or credentials. Background/lock clears values. iOS uses `group.app.ledgersync.expenses`; configure the same App Group on the app and extension in your Apple signing team. Android disables OS backup and screen capture. The official iOS 27.2 simulator runtime is installed, and installation/launch of the updated app passed on 14 November. GUI passcode/backup/offline flows, device signing, store distribution and actual widget rendering remain outstanding; no paid Apple/Google service was provisioned.

## Verification commands and acceptance limits

```sh
RUN_SUPABASE_INTEGRATION=1 npm test -w backend -- \
  --no-file-parallelism --testTimeout=30000 --hookTimeout=30000
npm run build -w backend
npm run lint -w frontend
npm run build -w frontend
npm run native:sync -w frontend
npm audit
```

Integration credentials belong only to the reserved synthetic users in ignored backend environment files. Tests exercise real hosted RLS/RPCs and restore cash effects; immutable synthetic loan/audit history may remain. Unit browser/storage stubs and the JVM widget boundary test are separate from native runtime verification. See [VERIFICATION.md](../VERIFICATION.md) for the final run and browser evidence. Real Google consent/email delivery, cold-start offline UI, device PIN/backup flows and physical widgets still require live acceptance. Exact unpublished Money Manager Premium entitlements remain unverified.
