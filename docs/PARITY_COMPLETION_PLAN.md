# Parity completion work

Full objective remains active. This checklist preserves the requested scope; a passing sub-feature does not mean full parity is complete. Work started 14 November 2026 on `codex/account-sharing-completion`. Paid services and actual money movement require separate approval.

| Milestone | Requirements | Current evidence / status |
|---|---|---|
| Device acceptance | Android compilation, real iOS/widgets, passcode/archives, cold-start offline/reconnection, signing/store release | iOS app compiles; official simulator runtime is being provisioned. Android SDK, GUI/real-device and distribution checks remain. |
| Account controls | Device/session management, lifecycle/deletion/anonymization, duplicate identity merging, blocking/reporting | Session list/naming, selected/other/all-device revocation, own activity and immediate database JWT-session checks implemented. Remaining controls are open. |
| Sharing | Shared refunds, adjustments, purchase-to-split, simplification toggle | Recorded purchases and signed adjustment splits are implemented. Refunds and the simplification toggle remain open. |
| Current feature completion | Complete translations, advanced offline workflows, multi-currency wallets/groups/settlements | Existing device workspace and personal FX entries remain scoped foundations; all listed extensions remain open. |
| Friends | Persistent friends, bilateral history/settings, guests and secure claiming | Open. |
| Receipts | OCR extraction, confidence/reconciliation, explicit review before posting | Private files/manual itemization exist; OCR remains open. |
| Reporting | Group/category/member comparison, friend export, personal activity | Existing cash-flow/group totals/export remain available; additional reports are open. |
| Communication | Inbox/preferences, push/email, immediate cross-device updates | In-app reminders exist. All listed extensions remain open. |
| Recovery | Whole-group recovery and reviewed cloud restore beyond device archives | Split recovery/device archives exist. Whole-context/cloud recovery is open. |
| Integrations | Bank/card consent/sync/reconciliation, payment execution, public developer API/OAuth grants | Open; paid providers/payment execution remain approval-gated. |
| Operations | Persistent error tracking, monitoring and alerts | Vercel release scans exist; durable monitoring/alerts remain open. |
| Provider acceptance | Real Google consent and email confirmation/recovery delivery | Configuration-dependent live checks remain open; no live email/provider success is claimed. |

Owner-approved invitations and explicit posting of recurring drafts remain deliberate defaults.

## Account session milestone

- Settings lists only the caller's active Supabase Auth sessions, names devices, revokes one/other/all sessions, and paginates first-use/naming/revocation activity. The current device is identified server-side. Regular sign-out is local; all-device revocation is explicit.
- The API receives identity from an actor-checked RPC **after PostgREST JWT signature/expiry validation**. A pre-request hook protects privileged Data API RPCs; restrictive RLS guards table and Storage-origin access. Revocation deletes the selected Auth session and cascades its refresh tokens. No service-role key, JWT or IP address is exposed to the client. The hook runs as SECURITY INVOKER; anonymous requests do not access private session data.
- Accounting, ownership and RLS regression: 235 passed, one existing Cron test skipped in 37 files against hosted Supabase. The new four-case hosted test proves owner isolation, naming validation, immediate REST/RPC denial, fresh receipt denial, signed-link denial, failed refresh, safe retry, other-device preservation and all-device revocation. It uses only reserved synthetic identities and reverses its temporary financial/file fixtures.
- A Storage test exposed a real cache caveat: files previously authorized and cached at Supabase's CDN can remain readable after logout. New uncached files and new signed-link requests are denied. Already-downloaded files cannot be recalled. The UI states this explicitly. See [Supabase's cache guidance](https://supabase.com/kb/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout). Strict proxy-only file delivery/cache migration remains security-hardening work; no instant cached-file erasure is claimed.
- Backend build and frontend lint/build pass. New control copy is translated into Hindi, Spanish and Arabic. A GUI session-control walkthrough remains acceptance work. No newly created user passcode was entered by the agent.
- Four versioned migrations are applied. Security advisors retain only 43 intentional authenticated SECURITY DEFINER entrypoints and existing disabled leaked-password protection; the new anonymous-definer warning was eliminated by narrowing the pre-request hook.

This branch is not merged or deployed. Hosted additive security migrations are applied; do not replay them. Unrelated vendor edits and OAuth credentials remain excluded.

## Offline sharing acceptance repair

Source inspection against the authoritative snapshot schema found that the device Shared screen used `split_id` instead of `split_expense_id` for payer/participant rows. This incorrectly displayed saved balances and preselected edit allocations. The screen now uses canonical database fields and a shared Decimal balance calculation. Three new regression cases cover saved shares, partial/reversed settlements, unrelated-group isolation and zero balances. Ten offline-sharing tests pass. Unposted shared operations remain excluded. Full cold-start/device GUI acceptance remains open.

## Recorded purchase sharing

- Transaction details offer a review flow for converting an owned manual expense into a group or ad-hoc split. All four allocation modes are available. The original total, date, payer and payment account remain fixed; at least one other participant is required. Receipt access changes require an explicit checkbox before review. New copy is translated in Hindi, Spanish and Arabic.
- The actor-checked accounting RPC reverses/replaces the original entry in one transaction, preserving the final cash/card balance and attributing personal spending only once. It records private source provenance and an idempotency hash; concurrent retries return one expense, changed retry payloads conflict, and stale purchases are rejected. Existing split authorization, currency, membership and settlement-history restrictions apply.
- Original personal notes/labels stay on the caller's private generated entries. CSV import references move to the surviving funding entry so reimport detection remains intact. Event/installment links must be removed before conversion. A conversion retry cannot resurrect a deleted shared expense; authorized expense recovery preserves its identity.
- Hosted integration covers all four modes, concurrent posting, invalid-total rollback, outsider/membership/stale-input rejection, explicit category clearing, receipt consent/access, CSV duplicate detection, deletion/recovery, credit-card attribution and temporary account-limit boundaries. The same hosted snapshot is checked against saved offline group balances. Fixture data is synthetic and cleaned through authorized accounting operations.
- This flow currently requires connectivity. Offline purchase conversion and a full browser walkthrough remain acceptance work. Source remains on the current branch; no new web/API deployment is claimed.

## Adjustment splits

- A fifth split mode accepts signed personal extras/reductions and shares the remaining common portion equally. SQL independently computes nonnegative exact shares, assigns remainder cents in participant order and persists the original adjustment intent. The editor previews final shares; existing expenses retain their adjustments through editing and authorized deletion/recovery.
- Supported in group/ad-hoc creation, multiple-payer bills, purchase conversion, saved/default templates, recurring draft review/posting, shared search and the offline shared queue. Private account/category isolation and settlement-history restrictions remain enforced. A template without a total can be saved but cannot activate a schedule until a valid complete allocation exists.
- Full serial regression: 261 passed, one existing Cron test skipped across 41 files. Seven hosted adjustment cases cover signed/zero values, multiple payers, invalid/forged allocations, privacy, mode replacement, recovery, payment-history guards and templates. Five new unit cases include hundreds of signed/count/cent combinations checked against both client and API calculations.
- Hosted rollback SQL verifies month-end/leap-day snapshots, repeated scheduler execution, unchanged balances before posting, failed-post rollback, repeat posting and repeat offline commands. Accounting/planning/invitation/recurrence SQL suites were updated with rollback-only session contexts and pass under the new active-session policy. Follow-up queries confirmed no SQL test identities, sessions or groups persisted.
- Backend build, frontend lint/build and refreshed native static export/sync pass. App plus widget extension compile for the simulator. Security advisor findings remain 44 intentional authenticated actor-checking privileged entrypoints and existing disabled leaked-password protection. No new RLS/search-path warning. GUI/native runtime walkthroughs remain acceptance work; no deployment is claimed.
