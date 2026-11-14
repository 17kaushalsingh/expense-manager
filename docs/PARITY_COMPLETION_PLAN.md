# Parity completion work

Full objective remains active. This checklist preserves the requested scope; a passing sub-feature does not mean full parity is complete. Work started 14 November 2026 on `codex/account-sharing-completion`. Paid services and actual money movement require separate approval.

| Milestone | Requirements | Current evidence / status |
|---|---|---|
| Device acceptance | Android compilation, real iOS/widgets, passcode/archives, cold-start offline/reconnection, signing/store release | iOS app compiles; official simulator runtime is being provisioned. Android SDK, GUI/real-device and distribution checks remain. |
| Account controls | Device/session management, lifecycle/deletion/anonymization, duplicate identity merging, blocking/reporting | Session list/naming, selected/other/all-device revocation, own activity and immediate database JWT-session checks implemented. Remaining controls are open. |
| Sharing | Shared refunds, adjustments, purchase-to-split, simplification toggle | Open; existing settlement reversal and four ordinary split modes remain available. |
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
