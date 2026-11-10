# Splitwise feature-to-function parity

Audit date: **10 November 2026**. Scope: publicly documented Splitwise web/mobile Core, Pro, help-centre workflows, and separately identified banking products. This is a functional comparison, not an assertion of identical UI, API compatibility, or access to undocumented/experimental features.

**The application does not yet implement every Splitwise feature.** A related screen is not counted as parity: CSV is not bank sync, an uploaded receipt is not OCR, a reusable template is not an automatic default, and an offline fallback page is not offline expense entry.

The owner approved pursuing full parity, superseding the earlier exclusions for FX, offline writes, OCR, banking and payments. Paid-provider provisioning and actual money movement still require separate approval. No paid provider, bank account, wallet or card has been provisioned by this audit.

Status: **Implemented** = the mapped workflow exists; **Partial** = related behavior exists but listed acceptance remains; **Missing** = no equivalent workflow; **Different** = current behavior conflicts; **Commercial** = Splitwise's branded product/entitlement requires a separate business/provider decision. Code evidence is the current repository; the preceding 124-test release verification is in `VERIFICATION.md` and is not represented as a new November 10 test run.

| ID | Splitwise capability | App function / evidence | Status | Remaining acceptance for parity |
|---|---|---|---|---|
| SW01 | Groups | `group.routes.ts`, group list/details, `manage_group` | Implemented | Preserve membership isolation and accounting checks. |
| SW02 | Friends / friendship pages | Exact-email lookup, ad-hoc splits, debt people | Partial | Persistent friendship management, dedicated bilateral history and friend settings. |
| SW03 | Shared expenses and debt records | `split.routes.ts`, `create_split_expense_atomic`, `SplitBuilder` | Implemented | Permission/recovery differences are tracked separately below. |
| SW04 | Equal splits | `calculateSplitParticipants`, ledger RPC | Implemented | Deterministic cent allocation is tested. |
| SW05 | Exact unequal amounts | EXACT allocation | Implemented | Totals must reconcile before posting. |
| SW06 | Percentage splits | PERCENTAGE allocation | Implemented | Shares must sum to 100. |
| SW07 | Shares / couples / families | SHARES allocation | Implemented | Couples can be represented by weighted shares. |
| SW08 | Multiple payers | Split payer rows and account selection | Implemented | Other members' private account lists remain hidden. |
| SW09 | Total balances / who owes whom | Debt summaries, group graphs, AR/AP | Implemented | Settlement-adjusted, currency-safe calculations. |
| SW10 | Debt simplification and toggle | `simplify_debts` | Partial | Algorithm exists; enable/disable setting and historical-payment handling are missing. |
| SW11 | Recurring expenses | Hosted Cron, schedules and occurrence drafts | Different | Posting requires review; automatic recurring expense creation and full recurrence-edit semantics differ. |
| SW12 | Offline expense entry / synchronization | Public offline fallback only | Missing | Opt-in private device storage, idempotent queued writes, conflict resolution, safe replay after membership changes. |
| SW13 | Cloud synchronization | Supabase persistence, refreshed query cache | Implemented | Immediate cross-device subscriptions are separate from basic cloud persistence. |
| SW14 | Group totals by month / all time | `group_financial_summary`, `GroupReport`, `/groups/:id/summary` | Implemented | SQL aggregates, caller-local month boundaries, paid/share/payments and period net change; pending drafts excluded. |
| SW15 | Categories | Personal categories, split selection | Implemented | Group category reports are tracked with reporting. |
| SW16 | Seven-plus UI languages | English UI | Missing | Translation catalogue, locale setting, translated errors and responsive checks. |
| SW17 | 100-plus currencies per expense / group | Small currency picker, one accounting currency | Different | Currency registry, minor-unit correctness, per-currency graphs and settlement rules; no cross-currency netting without conversion. |
| SW18 | Payment integrations | Cash/bank/card method labels on recorded settlements | Missing | Labels do not execute payments. Provider credentials, user consent, callbacks, reconciliation and cancellation are required. |
| SW19 | Unlimited expenses / no ads | No daily expense quota or advertising SDK | Implemented | Accounting and upload safety limits are not daily paywalls. |
| SW20 | Connected card/bank transaction import | Reviewed CSV import | Missing | Bank consent, provider sync cursor, pending/posted reconciliation, disconnect and purchase-to-split flow. |
| SW21 | Currency conversion | No conversion engine | Missing | Explicit rate/date/source and immutable original amounts, atomic conversion, reversals and rounding reconciliation. |
| SW22 | Receipt scanning / OCR | Private receipt upload | Missing | Extract candidate fields/items, confidence/reconciliation, explicit review, no automatic ledger posting. |
| SW23 | Itemized bills with tax/tip/discounts | `itemization.ts`, `private.itemized_split_input`, item editor/summary | Implemented | Manual shared lines, proportional tax/tip/discount, deterministic cent allocation and independent SQL normalization. Scan-assisted entry is tracked under SW22. |
| SW24 | Charts and graphs | Personal Recharts cash flow/category views | Partial | Group/category/member reports and shared-expense period comparisons. |
| SW25 | Search all shared expenses | `/splits/search`, `/shared-expenses` | Implemented | Group/ad-hoc scope, literal description search, local dates, amount/mode/currency filters, stable pagination and details/comments/receipts. |
| SW26 | Saved automatic group default split | `group_split_defaults`, `Templates`, `DefaultEditor` | Implemented | Owner selects preference; new bills load ordered participants/weights automatically. Description, total, payer and private account are reviewed per bill; exact shares never silently rescale. Archived/invalid preferences are handled explicitly. |
| SW27 | Native iOS / Android apps | Installable responsive PWA | Partial | Native packages, secure storage/background behavior and real-device/store verification. |
| SW28 | Early-access Pro entitlement | No subscription tiers | Commercial | A product-release programme is not an accounting feature. No artificial paywall is planned. |
| SW29 | Expense receipt/image evidence | Private Storage receipts and scoped downloads | Implemented | Explicit upload limits; no public file URLs. |
| SW30 | Notes and comments | Group, individual-split and search-result comment dialogs; split-comment API | Implemented | Existing scoped create/edit/delete comment operations are reachable from both group and ad-hoc bills. Notification linking is tracked separately. |
| SW31 | Personal recent activity / change history | Group activity UI, immutable audit records | Partial | Private account-wide activity with actor identities and links to affected records. |
| SW32 | Expense-change email/mobile notifications | Manually created in-app reminders | Partial | Notification inbox/events/preferences, push/email delivery, deduplication and mute rules. |
| SW33 | Group/friend/data export | Private transaction CSV; `/groups/:id/export` | Partial | Group expense/settlement export now supports month/all time, names and allocations without private account/category IDs. Friend-scoped and full personal data export remain. |
| SW34 | Personal expenses | Accounts, manual income/expense and transfers | Implemented | This app additionally provides budgets and savings goals. |
| SW35 | Full/partial settle-up records | `execute_settlement_atomic`, settlement dialog | Implemented | Actual external payment execution is SW18/SW48. |
| SW36 | Undo a recorded cash settlement | `reverse_settlement_atomic`, `/settlements/:id/reverse`, payment history | Implemented | Atomic source-linked cash/AR/AP reversal, immutable tombstone/audit, concurrent retry protection; available for group and ad-hoc payment records. Does not cancel external funds. |
| SW37 | Restore a deleted expense | Hard deletion/reversal; audit headers | Missing | Complete recoverable snapshot, retained identity/history, authorization, duplicate restore protection and reconciliation. |
| SW38 | Delete/undelete a group with its history | Hard delete only when financial references allow | Different | Recoverable archive/delete state and restoration of the whole context. |
| SW39 | Add unregistered friends by name/email/phone | Parties must have registered Auth identities | Missing | Guest identity/claiming model without impersonation, duplicate identities or private-account leakage. |
| SW40 | Shared refunds/reimbursements | Positive shared expense totals only | Missing | Reverse shared obligations and cash appropriately; reduce spending analytics rather than fabricate income. |
| SW41 | Split by adjustment | Four ordinary split modes | Missing | Persist adjustment intent and independently normalize it into exact shares. |
| SW42 | Collaborative editing by any involved member | Creator/group-owner permissions | Different | Splitwise has no special group admins. Any expansion must preserve private account choices and audit permissions. |
| SW43 | Group invitations / joining | Expiring links with owner approval | Different | Existing secure approval flow differs from Splitwise's admission model; configurable admission policy is needed. |
| SW44 | Sign out on all devices / security history | Supabase global sign-out, recovery revocation | Partial | Explicit device/session controls and user-visible security history. |
| SW45 | Merge duplicate accounts / identities | No merge workflow | Missing | Verified ownership, atomic identity and debt reconciliation, duplicate/guest handling. |
| SW46 | Account deactivation/deletion | Financial-account deletion only | Missing | Auth-account lifecycle, retention/export choices and shared-history-safe anonymization. |
| SW47 | Abuse/block/report workflows | No blocking/reporting controls | Missing | Blocked invitations/contact, reporting/triage and financial-history preservation. |
| SW48 | Splitwise Pay wallet / bank funding | No wallet or money movement | Commercial | Regulated payment provider, identity checks, authorizations, funding/withdrawal lifecycle, disputes and approval. |
| SW49 | Splitwise Card | No issuing programme | Commercial | Issuer partnership, supported market, identity/compliance and physical/virtual card lifecycle. A renamed expense account is not equivalent. |
| SW50 | Full personal data export | Transaction CSV only | Partial | Include profile, memberships, comments, preferences, provenance and receipt metadata while respecting other members' privacy. |
| SW51 | Group organization / settled-up hiding | Basic group list | Partial | Search/filter/archive and recoverable history rather than destructive clearing. |
| SW52 | Change default currency independently | Currency immutable after activity | Different | Separate display/default preferences from stored accounting currency; depends on SW17/SW21. |
| SW53 | Turn a purchase into a shared expense | Manual and split forms are independent | Missing | Atomic conversion of a manual expense without double-counting cash or personal spending. |
| SW54 | Authentication / recovery | Supabase email/password, Google ID token and recovery screens | Partial | Core code exists; real email recovery and Google provider consent remain unverified/configuration dependent. |
| SW55 | Public developer API / third-party OAuth | Internal authenticated REST | Missing | Documented external API contract, OAuth app grants/scopes, revocation and compatibility tests. |
| SW56 | Immediate cross-device updates | Query invalidation and manual/route refresh | Partial | Scoped subscriptions, reconnect and stale-device reconciliation. |

## Implementation sequence and release gates

1. **Implemented this milestone:** shared search, group totals/export, automatic defaults, settlement reversal, receipt discounts and ad-hoc comments entry points. Real hosted permission/accounting tests and desktop/mobile walkthroughs are recorded below.
2. Friendship pages, comments/activity/inbox, archive/recovery, adjustments/discounts, purchase-to-split and refunds. Preserve source references and personal account attribution.
3. Multi-currency/minor units and audited conversion, then offline queues. These require accounting migrations and concurrency/replay tests, not UI-only changes.
4. On-device OCR and localization, native packaging and device checks. Do not send receipt images to a third-party OCR service without an approved provider/data flow.
5. Provider-backed bank/card import, email/push and payment products. Prepare concrete integrations for review; obtain approval before paid provisioning or money movement. No provider-dependent feature is marked complete before live verification.

The matrix is a release checklist. Overall parity remains **incomplete** until every applicable row meets its acceptance criteria. In-progress and provider-blocked rows must stay visible; screenshots, placeholders and mocks do not change their status.

## November 10 implementation verification

- Local/backend suite: **132 passed, one Cron test skipped** across 19 files with `RUN_SUPABASE_INTEGRATION=1 npm test --workspace=backend -- --testTimeout=30000 --hookTimeout=30000`. This includes 105 local tests and 27 hosted tests. The existing receipt test exceeded the five-second default on the first full run; the network-appropriate rerun passed. Cron generation was verified in the prior release and was not re-exercised in this run.
- New `backend/src/integration/parity.test.ts` covers RLS isolation, literal wildcard search, pagination, timezone-local dates, SQL totals, private-field-free CSV, owner-only defaults, rejected direct writes, partial settlement, unauthorized reversal and concurrent/retried reversal. `sharedExpenses.test.ts` covers invalid filters and API private-field projection. The discount test proves SQL ignores forged exact shares and rolls back over-discounted bills; 4,185 subtotal/discount/party combinations verify nonnegative allocations with exact totals.
- Backend TypeScript build, frontend ESLint and production build pass. All three new hosted migrations were applied and generated types refreshed.
- Browser walkthrough: 390×844 search/details and group totals; 1365×900 totals; automatic 2:1 allocation posted as 8/4 for a total of 12; partial recorded payment changed debt 11→8, reversal restored 11; mobile payment navigation and individual empty state. A separate receipt walkthrough entered a 10.00 shared line with a 2.00 discount, previewed/posted total 8.00 and shares 4.00/4.00, and verified the persisted discount in the receipt details. No external money moved. The CSV body was tested over HTTP; browser file download was not repeated after the earlier declined download permission.
- Database advisors: no missing RLS, search-path or FK-index findings. Fixed the new reversal-policy initialization warning in a follow-up migration. Remaining findings are 26 intentionally authenticated actor-checking SECURITY DEFINER functions, 16 unused-index information notices, and existing disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Reviewed RPC authorization is tested; the warning is not silently suppressed.
- New temporary walkthrough group, template, bills and payment were removed through their authorized APIs. Immutable reversal/audit provenance remains. Existing working-tree vendor changes and the ignored OAuth credential file are excluded from commits.
- Code remains on `codex/splitwise-parity`; frontend/API deployment and merging to main are not implied by a hosted additive migration. Email recovery delivery and Google OAuth still require live provider verification.

## Code entry points

- [Shared search and privacy projection](../backend/src/routes/split.routes.ts), [filter/privacy tests](../backend/src/services/sharedExpenses.test.ts), [search UI](../frontend/src/app/shared-expenses/page.tsx).
- [Group reports/export/default API](../backend/src/routes/group.routes.ts), [group totals UI](../frontend/src/components/groups/GroupReport.tsx), [default selection](../frontend/src/components/groups/Templates.tsx), [automatic split editor](../frontend/src/components/split/SplitBuilder.tsx).
- [Atomic reporting/default/reversal migration](../supabase/migrations/20261110133037_splitwise_core_parity.sql), [payment API](../backend/src/routes/settlement.routes.ts), [payment history/reversal UI](../frontend/src/components/settlements/SettlementHistory.tsx), [hosted acceptance tests](../backend/src/integration/parity.test.ts).

## Official sources

- [Splitwise core feature catalogue](https://www.splitwise.com/)
- [Splitwise Pro feature catalogue](https://www.splitwise.com/pro)
- [Splitwise Help Center](https://kb.splitwise.com/)
- [Split methods including adjustments, reimbursement and discounts](https://kb.splitwise.com/balances-and-expenses/what-are-different-ways-i-can-split-an-expense)
- [Group period totals](https://kb.splitwise.com/balances-and-expenses/can-you-explain-the-totals-screen)
- [Debt simplification setting and payments](https://kb.splitwise.com/balances-and-expenses/what-is-simplify-debts)
- [Undoing a settlement record versus cancelling funds](https://kb.splitwise.com/balances-and-expenses/i-accidentally-settled-up-how-can-i-undo-this)
- [Expense restoration and eligible users](https://kb.splitwise.com/balances-and-expenses/how-can-i-restore-a-deleted-expense)
- [Group permissions](https://kb.splitwise.com/groups/can-i-prevent-group-members-from-changing-expenses-or-set-permissions)
- [Deleting and restoring groups](https://kb.splitwise.com/groups/how-do-i-delete-or-undelete-a-group)
- [Account/security/export workflows](https://kb.splitwise.com/account-issues)
- [Payment integrations](https://kb.splitwise.com/payment-integrations)
- [Splitwise Pay](https://kb.splitwise.com/splitwise-pay)

Additional rows inferred from combinations of documented workflows are implementation requirements, not claims about undocumented Splitwise internals. Provider and market availability must be rechecked before integration.
