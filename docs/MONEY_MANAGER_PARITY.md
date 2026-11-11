# Money Manager parity

Reference: **Gunawan Santoso / Micro App Digital**, not Realbyte. Audited 2026-11-11 using the [iOS listing](https://apps.apple.com/id/app/money-manager-daily-expenses/id6753577383) and [Android listing](https://play.google.com/store/apps/details?id=com.microappdigital.moneymanager). Listings differ by release. Android describes Premium as removing ads and limits; neither source publishes a complete tier entitlement table. We implement capabilities without adding a paywall. Exact unpublished premium limits are **unverified**.

This is a functional comparison, not a claim of identical internals, design, privacy promises, or native platform support. LedgerSync remains a Supabase-authenticated, hosted application. No paid provider or external money movement is authorized by this document.

| ID | Capability | Initial coverage / work required |
|---|---|---|
| MM01 | Income, expenses, transfers | Implemented; atomic ledger |
| MM02 | Calculator | Implemented |
| MM03 | Categories, subcategories | Categories implemented; hierarchy missing |
| MM04 | Labels, notes | Notes implemented; labels stored but incomplete UI/filtering |
| MM05 | Receipts | Private attachments implemented |
| MM06 | Multiple payment accounts | Missing for personal entries |
| MM07 | Personal recurrence | Missing; group review drafts exist |
| MM08 | Search and filters | Implemented except labels |
| MM09 | Bulk edits | Missing |
| MM10 | Exchange rates | Missing; single accounting currency enforced |
| MM11 | Flexible budget periods | Monthly only |
| MM12 | Payday boundaries | Missing |
| MM13 | Budget pace | Missing |
| MM14 | Period overrides | Monthly limits editable; reusable plans missing |
| MM15 | Threshold alerts | In-app monthly 80% notices only |
| MM16 | Bill timeline | Missing |
| MM17 | Record, skip, postpone | Missing for personal bills |
| MM18 | Account types | Implemented; savings/e-wallet use existing asset types |
| MM19 | Card terms/installments | Missing |
| MM20 | Asset values/history | Missing |
| MM21 | Net-worth history | Current value only |
| MM22 | Account transfer history | Implemented |
| MM23 | Private borrowing/lending | Shared debts only |
| MM24 | Loan installments/interest | Missing |
| MM25 | Savings milestones | Account progress implemented; milestones missing |
| MM26 | Monthly plan vs actual | Missing |
| MM27 | Trips/events | Missing |
| MM28 | Cash-flow/category reports | Implemented |
| MM29 | Daily trends/heatmap | Calendar implemented; heatmap missing |
| MM30 | Monthly/yearly summaries | Date/range reports implemented |
| MM31 | Health/wealth indicators | Missing; no published scoring formula |
| MM32 | PDF/Excel reports | CSV only |
| MM33 | Native widgets/quick actions | PWA shortcuts only; native work missing |
| MM34 | Passcode lock | Missing; authenticated sessions exist |
| MM35 | Dark mode/theme | Implemented |
| MM36 | Languages | English only |
| MM37 | Backup/restore | CSV import/export; full private-data backup missing |
| MM38 | Offline/no account | Different architecture; offline financial writes missing |
| MM39 | Premium ad/limit removal | No ads or premium paywall in LedgerSync |

The capabilities above are concise paraphrases of store descriptions, not an exhaustive inspection of paid app binaries. Newer Android release notes also mention gold-denominated debt and a split calculator; shared splitting exists here, gold pricing does not. Do not conflate the developer's separate “AI Budget” app with this reference.

## Implementation milestones

1. Flexible budgets, reusable periods, overrides, payday preferences, pace, monthly planner.
2. Private assets with valuation history and net-worth reporting; event budgets and planned costs.
3. Private loans, principal/interest separation, installments and atomic repayments.
4. Personal recurring bills/income with reviewed, idempotent recording and schedule controls.
5. Transaction productivity: labels, category hierarchy, multi-account entries, atomic bulk actions.
6. Reports, portable exports, goal milestones, privacy controls and verification.

Each milestone must include applicable ownership/RLS tests and UI states. Currency conversion, offline synchronization, native apps and full localization require their own verified implementations; they are not complete because an entry exists in this table. Status updates must cite actual code and live checks.
