# Adjustment splits

Choose **Adjustment** in the split editor. Enter an extra cost or reduction for each selected person; zero means no adjustment. The common portion is `(total − sum of adjustments) / number of participants`, and each final share is that common portion plus their adjustment. A total of 100 across three people with an extra 10 for the first person produces 40, 30 and 30. Negative adjustments are allowed only while every final share stays nonnegative.

All arithmetic uses integer cents. Fractional results are rounded down, then remainder cents are assigned in the saved participant order. Review the final shares before posting. Changing the total recalculates the equal common portion while keeping the entered extras fixed. Itemization and adjustments are separate allocation methods and cannot be combined in one expense.

The mode is available for group and individual bills, multiple payers, recorded-purchase review, templates, recurring drafts and queued offline shared entries. Offline commands are checked again against current membership, currency and settlement history when synchronized. Other people's private accounts remain hidden. Pending drafts and commands do not change shared balances.

Requests use `splitType: "ADJUSTMENT"` and signed `participants[].shareValue` extras. The stored/returned `adjustments` array preserves that ordered intent. Stored participant rows retain normalized exact `share_value`/`amount_owed` accounting values; editors must read the adjustment intent when reopening the bill. Historical snapshots, authorized expense recovery and private device exports include this metadata. Templates store signed extras, never private accounts or categories, and activation/posting requires a valid total and complete payer amounts.

The database independently validates totals, duplicate parties, cents, final nonnegative shares, membership, currency, category/account ownership and existing settlement restrictions. A forged client preview cannot alter the actual allocation. See [verification](../VERIFICATION.md) for hosted HTTP, SQL and unit evidence.

The reference capability is described in [Splitwise's official split-method guide](https://kb.splitwise.com/balances-and-expenses/what-are-different-ways-i-can-split-an-expense). LedgerSync additionally retains the adjustment intent explicitly for later review.
