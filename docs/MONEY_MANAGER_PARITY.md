# Money Manager parity

Reference: **Gunawan Santoso / Micro App Digital**, not Realbyte. Audited 2026-11-11 using the [iOS listing](https://apps.apple.com/id/app/money-manager-daily-expenses/id6753577383) and [Android listing](https://play.google.com/store/apps/details?id=com.microappdigital.moneymanager). Listings differ by release. Android describes Premium as removing ads and limits; neither source publishes a complete tier entitlement table. We implement capabilities without adding a paywall. Exact unpublished premium limits are **unverified**.

This is a functional comparison, not a claim of identical internals, design, privacy promises, or native platform support. LedgerSync remains a Supabase-authenticated, hosted application. No paid provider or external money movement is authorized by this document.

| ID | Capability | Current coverage / remaining work |
|---|---|---|
| MM01 | Income, expenses, transfers | Implemented; atomic ledger |
| MM02 | Calculator | Implemented |
| MM03 | Categories, subcategories | Implemented: parent + one subcategory level; parent budget rollups |
| MM04 | Labels, notes | Implemented: normalized labels, edit/detail/filter and exports |
| MM05 | Receipts | Private attachments implemented |
| MM06 | Multiple payment accounts | Implemented: atomic allocation, replacement and whole-record reversal |
| MM07 | Personal recurrence | Different: hourly hosted review occurrences, explicit recording; no unattended ledger posting |
| MM08 | Search and filters | Implemented including label filters |
| MM09 | Bulk edits | Partial: atomic manual category/labels/notes replacement and deletion; amounts remain individual edits |
| MM10 | Exchange rates | Missing; single accounting currency enforced |
| MM11 | Flexible budget periods | Implemented: daily, weekly, biweekly, monthly, quarterly, yearly, custom |
| MM12 | Payday boundaries | Implemented in monthly planning; calendar views retain calendar months |
| MM13 | Budget pace | Implemented with period elapsed and pace allowance |
| MM14 | Period overrides | Implemented without changing future plan amounts |
| MM15 | Threshold alerts | Partial: configurable in-app 80%/100% warnings; no device push |
| MM16 | Bill timeline | Implemented: due/history views, next-date preview, dashboard review list |
| MM17 | Record, skip, postpone | Implemented with atomic recording and record reversal |
| MM18 | Account types | Implemented; savings/e-wallet use existing asset types |
| MM19 | Card terms/installments | Implemented as recorded-ledger statements and manual principal plans; no issuer sync or inferred fees |
| MM20 | Asset values/history | Implemented: dated values and private asset CRUD |
| MM21 | Net-worth history | Implemented: recorded account effects, dated assets and outstanding private loans |
| MM22 | Account transfer history | Implemented |
| MM23 | Private borrowing/lending | Implemented independently of group debts |
| MM24 | Loan installments/interest | Implemented: exact principal schedules, separate interest, repayments/reversals |
| MM25 | Savings milestones | Implemented: account-linked progress and 25/50/75/100% milestones |
| MM26 | Monthly plan vs actual | Implemented: payday periods, planned income/expenses and savings targets |
| MM27 | Trips/events | Implemented: budgets, daily allowance, planned costs and linked actual expenses |
| MM28 | Cash-flow/category reports | Implemented |
| MM29 | Daily trends/heatmap | Implemented: calendar and report heatmap with day drilldown |
| MM30 | Monthly/yearly summaries | Date/range reports implemented |
| MM31 | Health/wealth indicators | Partial: actual savings rate/net worth; proprietary health/wealth scoring not reproduced |
| MM32 | PDF/Excel reports | Implemented: generated PDF summaries and four-sheet XLSX with literal text cells |
| MM33 | Native widgets/quick actions | PWA shortcuts only; native work missing |
| MM34 | Passcode lock | Missing; authenticated sessions exist |
| MM35 | Dark mode/theme | Implemented: light/dark/system plus five accent palettes |
| MM36 | Languages | English only |
| MM37 | Backup/restore | CSV import/export; full private-data backup missing |
| MM38 | Offline/no account | Different architecture; offline financial writes missing |
| MM39 | Premium ad/limit removal | No ads or premium paywall in LedgerSync |

The capabilities above are concise paraphrases of store descriptions, not an exhaustive inspection of paid app binaries. Newer Android release notes also mention gold-denominated debt and a split calculator; shared splitting exists here, gold pricing does not. Do not conflate the developer's separate “AI Budget” app with this reference.

## Delivered milestones

1. Flexible budgets, period overrides, payday preferences, pace, monthly planner.
2. Assets/valuations, net-worth history, events and planned costs.
3. Private loans, installments, principal/interest separation and atomic repayments/reversals.
4. Hosted personal bill/income schedules, reviewed occurrences and controls.
5. Labels, category hierarchy, multi-account entries and atomic bulk actions.
6. Card terms, statements and installment planning.
7. PDF/Excel reports, heatmaps and goal milestones.
8. Consistency guards, validation messages, auth availability handling, accent palettes and verification.

See [PERSONAL_FINANCE.md](PERSONAL_FINANCE.md) for interfaces, accounting rules and limits, and [VERIFICATION.md](../VERIFICATION.md) for evidence. This release **does not achieve full Money Manager parity**. MM10, MM33, MM34, MM36, MM37 and MM38 remain open, alongside the partial/different behavior above. Native store distribution/widgets need mobile clients and device checks; optional local-only storage, offline synchronization and currency conversion require additional accounting/data architecture. These are engineering gaps, not claims that paid-provider approval alone will complete them. Google consent and real email delivery remain unverified provider flows.
