# Everyday money experience — 2 November 2026

## Reference and research

The user confirmed **Money Manager by Gunawan Santoso**. The reference is [Money Manager: Daily Expenses on Apple's App Store](https://apps.apple.com/id/app/money-manager-daily-expenses/id6753577383), not Realbyte's similarly named product. Its official screenshots informed the sage balance summary, light grouped surfaces, compact category rows, small colorful shortcuts, and bottom navigation. LedgerSync uses its own components, icons, wording, and layouts; no reference screenshots or proprietary assets are shipped.

Reddit is useful for identifying friction, not establishing a reliable popularity ranking. These discussions were read directly:

- [A request for a simpler Splitwise alternative](https://www.reddit.com/r/apps/comments/1nzie0q/i_cant_find_splitwise_alternative_that_suits_my/): the original poster wants straightforward iOS entry and a roommate's balance beside their shared activity. Several replies promote the authors' own products.
- [Frustration with Splitwise](https://www.reddit.com/r/apps/comments/1izw2zx/im_tired_of_splitwise_any_other_suggestions_for/): complaints include limits/paywalls; the discussion also asks for saved percentage allocations and better decimal-comma entry.
- [Personal finance feature discussion](https://www.reddit.com/r/iosapps/comments/1sox9qh/discussion_wat_personal_finance_features_are/): collaboration, category insight, and iOS presentation appear in a promotional discussion. This is directional evidence, not independent consensus.

## Implemented response

| Need | Delivered |
| --- | --- |
| Faster everyday entry | Home shortcuts; shared manual-entry sheet; owned account default; immediate amount focus; arithmetic calculator with decimal-comma support |
| Clear daily spending | Monthly calendar using the saved timezone; select a local day to filter history; daily grouped rows; month totals; custom date filters |
| Shared balances visible immediately | Settlement-adjusted personal balance on every group card and group header; details organized into expenses, balances, recurring, activity, and members |
| Repeat less work | Existing split templates, recurring review drafts, and budget copying remain available; ad-hoc split editing now retains the original people |
| Consistent mobile interface | Five bottom tabs; compact white surfaces; sage accents; Apple system font stack; safe-area spacing; desktop sidebar; light/dark/system appearance |
| Useful reporting | Existing live category reports, budgets, goals, filters, CSV endpoint, and cash-flow ranges retained; income and expenses have distinct chart colors |

Calendar totals count personal analytics amounts, including only the caller's share of shared bills. Transfers, settlements, and virtual adjustments do not inflate spending. The calculator uses Decimal arithmetic and a small expression parser, never JavaScript evaluation. Exact allocations are still reviewed in the split editor; no accounting rules were relaxed for the redesign.

## Follow-up candidates

Receipt attachments with private storage, explicit item-by-item sharing, and validated CSV import are valuable next releases. Each needs its own storage/privacy or accounting design and tests. Bank connections, OCR, automatic recurring posting, offline writes, and exchange-rate conversion remain outside this release. Native store distribution is separate from the existing installable web app.
