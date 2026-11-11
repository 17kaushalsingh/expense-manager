# Personal finance capabilities

The Money Manager comparison is in [MONEY_MANAGER_PARITY.md](MONEY_MANAGER_PARITY.md). These capabilities add no paywall, advertising, bank connection, external money movement or paid provider. The application remains Express + Next.js + Supabase Auth and hosted PostgreSQL.

## Planning

`/planner` supports daily, weekly, biweekly, monthly, quarterly, yearly and custom budgets. Each repeating plan retains its initial date anchor. January 31 becomes February 28/29, then returns to March 31. End dates are inclusive. Amount overrides belong to one period, and changing a plan's cadence is blocked until its overrides are removed. Archiving hides a plan; its accounting records stay unchanged.

Period spending counts `analytics_amount` for personal expenses, including the user's share of a shared bill once. Parent categories include their direct subcategories. Overall and category limits can overlap; they are not added together. The pace allowance equals period limit × elapsed calendar days / period days. Optional 80% and 100% notices appear in-app and on Dashboard; they are not push notifications.

Payday (1–31) determines the monthly planner's inclusive start/exclusive end boundary in the saved timezone. Short months clamp the date while preserving the next month's anchor. Expected income, expected expenses and saving-rate targets are plans only. Existing `/budgets` limits continue to use calendar months, and calendar views keep their calendar layout.

## Assets and net worth

`/wealth` tracks property, vehicles, investments, valuables and other non-cash assets. Creating an asset and its first valuation is one transaction. Valuations have local calendar dates; future dates are rejected. Saving another value on the same date replaces it. Archived assets still count; record a zero valuation when an asset no longer has value.

Current net worth includes account assets + receivables − card/loan account liabilities − payables + latest non-cash values + outstanding private lending − outstanding private borrowing. Record the same investment or debt in one place to avoid double counting it. No inferred market prices or exchange rates are used.

History reconstructs current recorded ledger effects and dated valuations. It is recalculated when records are edited/reversed/deleted and is not an immutable bank statement or historical market-price feed. An account's opening balance begins at its earliest recorded account/transaction date. ALL uses month-end buckets (at most 100 years); shorter ranges use daily buckets.

## Trips and events

`/events` holds private trip, wedding, project and other budgets, date ranges, estimates and actual expenses. An expense can belong to one event. Only its personal analytics amount counts; transfers and generated balance adjustments cannot be linked as expenses. A shared personal-share entry can be linked without exposing other members' accounts.

Planned costs may be marked complete without a ledger entry. Recording one calls the existing expense engine, links the transaction and stores the posting pointer atomically. Concurrent retries return that transaction. Category defaults apply when recording. Actual amounts may differ from estimates. Deleting an event or planned cost leaves its actual transaction intact; unlinking changes reporting only. Replacing a multi-account payment requires removing event links first.

## Private loans

`/loans` tracks principal lent/borrowed, a private counterparty name, dates, weekly/monthly installments and actual repayments. It does not create a shared-group debt or contact another person. An optional initial account records the principal disbursement; choose “already recorded” only if no new cash entry is needed. This does not import or reconcile another loan account automatically.

Principal movements are `TRANSFER` entries with zero analytics. Interest is a separate `INCOME` entry for lending or `EXPENSE` for borrowing. Repayments update cash and outstanding principal in one transaction. Overpayments, another user's account, currency mismatches and duplicate request keys are checked in PostgreSQL. Zero-principal, interest-only payments are supported. Installment cents are allocated deterministically; principal payments cover oldest installments first.

Creation and payment request keys make retries idempotent. Payment reversal subtracts original ledger balance effects, removes the related entries, retains a reversed payment record and restores debt. Reversal can be retried safely. This never cancels an external payment. Loans with cash history must be fully repaid and archived; they cannot be hard-deleted. Reversed payment provenance may continue to reference an account and block its deletion.

## Personal bills and income

`/bills` supports once, daily, weekly, biweekly, monthly, quarterly and yearly schedules. Start dates must be today or later in the schedule's IANA timezone. Cadence and timezone are immutable. Name, amount, account, category and end-date changes affect future snapshots, not existing occurrences.

Hosted Cron `generate-personal-bills-hourly` calls private `generate_personal_bills()` at `0 * * * *` UTC. It creates up to 100 due snapshots per active schedule per run; retry/overlap cannot duplicate an occurrence. “Check due items” generates the caller's due snapshots immediately. The private worker cannot be called by browser roles. Upcoming previews use each schedule's own local date.

Occurrences remain outside balances/analytics until explicitly recorded. Review the actual amount/account/category before recording. Skip retains a record without posting; postponement changes only the review date, not recurrence identity. Review dates must be today or later in that schedule's timezone. Paused dates are skipped on resume; existing due items remain reviewable. Archiving is final and skips pending occurrences. Recorded occurrences can be reversed and cannot subsequently be reposted under the same identity.

## Transactions and categories

Labels are trimmed, lowercased, deduplicated and sorted by PostgreSQL: at most 20 labels, each 1–40 characters. History filters match a complete label. Categories support one parent and one subcategory level, with owner/system access and compatible type. Cycles and changing a referenced category's type are rejected.

Bulk operations update category, notes or labels, or delete/reverse 1–100 distinct owned manual entries. The entire batch rolls back if any entry is inaccessible, generated, incompatible with the category or protected by an attachment/reference. Monetary fields remain individually editable.

“Pay across accounts” creates one personal entry funded by 1–20 distinct owned accounts. Component amounts must exactly equal the total. Components contribute their amounts once to analytics and remain linked to their source. Individual components cannot be changed through manual endpoints. Replacement reverses the old components and posts the replacement atomically. Deletion is idempotent and retains a tombstone. Remove receipts and event links before replacement/deletion. Receipt access also supports owned personal bill/loan/entry components; foreign keys protect attached records against reversal until their attachments are removed.

## Cards and reports

`/cards` stores owner-private credit limits, statement days and payment days. Statement boundaries clamp short months and use the saved timezone. Opening/closing balances, charges and credits are reconstructed from the recorded card ledger. They are not issuer statements and do not infer fees, interest or bank payments. Record actual card repayments as transfers to that account.

Installment plans split an existing recorded card purchase's principal into exact monthly amounts. Paid principal is an explicit manual reconciliation marker; it does not move cash. Remove the plan before deleting or changing its purchase's amount/account/type. Creating a plan never duplicates the original expense.

`/reports` accepts inclusive local date ranges and an optional account filter. It provides personal totals, savings rate, a heatmap and category totals grouped by identity (including parent labels). Day links open matching transaction history. PDF contains summary/category/daily pages; XLSX has Summary, Transactions, Categories and Daily worksheets. Text is written as literal string cells, never formulas. Notes and labels remain in Excel, and amount, balance delta and personal analytics amount are distinct columns.

Reports reject more than 10,000 entries, periods over ten years and generated downloads above 4 MiB rather than silently truncating. PDF fonts are bundled under the SIL Open Font License; Latin and Devanagari rendering were checked. Full-script PDF coverage and UI localization are not claimed. CSV import/export remains available; these downloads are not a full application backup/restore facility.

## API resources

All routes below are under `/api`, require a validated Supabase access token and return camelCase. Ordinary queries use the caller's JWT and RLS. Private finance tables are not exposed to group members.

| Resource | Operations |
| --- | --- |
| `/personal-planning/preferences` | GET / PUT `{ payDay }` |
| `/personal-planning/budget-plans?date=YYYY-MM-DD` | GET period summaries; POST a plan |
| `/personal-planning/budget-plans/:id` | PUT replacement / DELETE |
| `/personal-planning/budget-plans/:id/override` | PUT `{ periodStart, amount }` |
| `/personal-planning/budget-overrides/:id` | DELETE period override |
| `/personal-planning/monthly-plan?month=YYYY-MM-01` | GET payday summary; PUT month/income/expense/saving-rate plan |
| `/personal-planning/monthly-plan/:id` | DELETE |
| `/wealth/assets`, `/wealth/assets/:id` | GET list, POST with initial value / PUT metadata / DELETE |
| `/wealth/assets/:id/valuations`, `/wealth/valuations/:id` | PUT date/value / DELETE valuation |
| `/wealth/history?range=1W\|1M\|3M\|1Y\|ALL` | GET net-worth series |
| `/wealth/events`, `/wealth/events/:id` | GET summary / POST / PUT / DELETE |
| `/wealth/events/:id/costs`, `/wealth/costs/:id` | GET / POST / PUT / DELETE |
| `/wealth/costs/:id/record` | POST reviewed account/amount/dateTime |
| `/wealth/events/:id/transactions`, `/wealth/event-transactions/:id` | GET / POST `{ transactionId }` / DELETE link |
| `/loans`, `/loans/:id` | GET / POST / PUT details / DELETE if no cash history |
| `/loans/:id/payments`, `/loans/payments/:id/reverse` | GET / POST principal/interest/account/dateTime/requestKey / POST reversal |
| `/bills`, `/bills/:id`, `/bills/refresh` | GET / POST / PUT schedule / POST due refresh |
| `/bills/occurrences?status=…&limit=25&offset=0` | GET paginated occurrences |
| `/bills/occurrences/:id/record\|skip\|postpone\|reverse` | POST reviewed operation |
| `/transactions/labels`, `/transactions/bulk` | GET labels / POST `{ ids, changes, delete? }` |
| `/transactions/personal-entries`, `/transactions/personal-entries/:id` | POST / GET allocations / PUT replacement / DELETE whole entry |
| `/cards`, `/cards/:id/settings`, `/cards/:id/statement?month=YYYY-MM` | GET cards / PUT terms / GET statement |
| `/cards/:id/installments`, `/cards/installments/:id` | GET / POST / PUT / DELETE plan |
| `/reports?fromDate=…&toDate=…&accountId?&format=json\|pdf\|xlsx` | GET report or download |

## Verification and deployment

Apply every versioned migration in order on a fresh database, or apply only new versions to an existing hosted project. The app needs no service-role key and no new external provider secret. Vercel must include `backend/assets/fonts/**` in the API function; `backend/vercel.json` explicitly includes them for the detected `src/app.ts` entrypoint. No Docker setup is used.

Run backend unit/hosted tests, backend build, frontend lint/build and Supabase advisors. Hosted tests use reserved synthetic identities and clean their own disposable records. Immutable reversed/archived loan, bill and audit provenance intentionally remains on those test identities. Never point this suite at real user identities. See the dated verification entry for actual evidence and remaining checks.
