# Recovery, receipts, itemization and CSV imports

## Recover an account

Choose **Forgot password?** on the sign-in screen. Supabase sends the recovery email, validates the one-use link, and updates the password. The app confirms both password entries and requests global refresh-session revocation afterward. Already issued access tokens retain Supabase's configured expiry; the app does not issue its own tokens. If revocation is unavailable after a successful update, the UI accurately reports that the password changed and asks the user to sign out of other devices.

The production Supabase redirect allowlist includes `https://expense-manager-nine-sable.vercel.app/reset-password`, in addition to `/login` and `/join`. Add the exact reset URL for any other environment that needs email recovery. Pending group invitations remain in the same browser through the recovery/sign-in flow. Expired or invalid links direct users to request another email. The request confirmation does not reveal whether an email is registered.

Real email delivery and a successful user-driven password change remain provider/manual checks. No real user's password is changed by the verification suite.

## Attach receipts

Open **Activity → transaction → details** for a manual transaction, or **Details & receipts** on a shared expense. Save a new expense before attaching files. Expense owners, split creators and group owners can manage receipts; ordinary group members can read shared receipts. Other users cannot read personal receipts. A removed group member who has no remaining participant/creator/payer access loses access.

- Supported: JPEG, PNG, WebP and PDF, up to 5 MB each and 10 receipts per expense.
- Files live in a private hosted Supabase Storage bucket, with metadata and object RLS. No service-role key is used by the app.
- Uploads first reserve a permitted path, then upload, then verify stored size/media type before becoming visible to ordinary readers. Current expense managers can inspect and remove incomplete uploads, including another manager’s abandoned upload, so pending files cannot permanently block expense deletion.
- Downloads use attachment disposition and normalized media-appropriate filenames. Prepare a new link when its 60-second validity expires. An already issued link can remain usable until that short expiry even after membership changes.
- File removal uses Storage API deletion followed by metadata deletion. Both stages are permission checked and retryable. The database refuses metadata deletion while an object remains, and refuses financial deletion while receipt records remain. Remove receipts first; this avoids orphan files during financial reversals.
- Editing a manual transaction updates it in place, preserving receipt and import provenance links. Generated ledger entries cannot have personal receipt attachments; attach their evidence to the original shared expense.

Receipts are manual attachments. OCR, automatic extraction, receipt previews, and antivirus scanning are not part of this release.

## Split a receipt by items

In a new or existing ordinary shared expense, select **Split by receipt items**. Enter each line's full amount and select its consumers. A line can be shared by several people. Add tax and tip as monetary amounts. The total is calculated from the lines and adjustments; payer amounts still need review when using multiple payers.

Each line is divided in integer cents; remaining cents go in the selected participant order. Tax and tip are allocated proportionally to already allocated item amounts, with remainder cents assigned in that same order among people with a positive item share. People with no item share receive no tax/tip. The client uses a dedicated high-precision Decimal context, and PostgreSQL independently derives EXACT shares within the atomic split operation. Client-supplied exact amounts cannot override the itemization. The sum must equal the expense total.

Itemization is stored on the split and displayed in its details. Ordinary group/ad-hoc expense editing supports it; template creation does not offer an itemization mode in this release. Existing settlement-history restrictions still apply. Posting an itemized expense uses the same cash, receivable/payable and analytics rules as other shared expenses; item lines do not create duplicate personal expenses.

## Import CSV transactions

Choose **Import CSV** in Activity. Select one destination account and upload a file of at most 200 KB / 500 data rows / 40 columns. Match its headers, choose the date and decimal formats, then preview. The file is parsed for review, not stored as a receipt. No financial writes occur during preview.

A simple file looks like:

```csv
Date,Amount,Type,Notes
2026-11-05,125.00,INCOME,Refund
2026-11-05,12.50,EXPENSE,Lunch
```

- Header names can be mapped manually. Comma, semicolon and tab separators, BOM, CRLF, quoted commas, escaped quotes and multiline quoted notes are supported.
- Amounts use a selected decimal point or comma, without thousands separators. With an explicit type, amounts are treated as magnitudes; `INCOME`/`EXPENSE` and `CREDIT`/`DEBIT` are supported. Without a type column, choose signed amounts (negative expense/positive income), all expenses, or all income.
- ISO dates and explicit-offset timestamps are supported. Choose DMY or MDY for ambiguous slash dates. Date-only records use noon in the saved IANA timezone. A timezone change between preview and posting requires another preview.
- Currency must match the selected account. Mapped account names must match the destination. Unknown or ambiguous categories are rejected; create them first or explicitly ignore the category column. Generated splits, settlements and transfers cannot be imported as manual entries when their source is mapped.
- Review each row. Invalid rows cannot be selected. Matching existing/imported/file rows are unchecked by default. Including a matching row as a new transaction requires both enabling that option and selecting it.
- Posting validates the whole selected batch again, then commits all transactions and balances together. Any failure rolls back every write. Concurrent changes are serialized by the accounting lock.
- The same batch ID and payload return the original result on retry. Reusing that ID with different rows is rejected. Starting a new preview creates a new batch: after a timeout, retry the existing batch before considering a new import.
- Imported transactions remain editable manual entries. Immutable import fingerprints survive editing/deletion, so the original CSV does not silently recreate changed or deleted transactions. Explicit duplicate inclusion remains available in a new reviewed batch.

Import provenance is private and audit records are immutable. Test cleanup deletes test financial entries and files; import/audit records remain as provenance. There is no automatic bank connection or bulk import undo in this release.
