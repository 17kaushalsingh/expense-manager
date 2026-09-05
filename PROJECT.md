# Project Overview
This document specifies the Functional Requirements (FRs) for a consolidated platform combining personal asset/liability management with group expense splitting. The core architecture is the Hybrid Ledger Engine, which automatically maps split transactions into personal double-entry balance sheets (Assets, Liabilities, Receivables, Payables) without double-counting expenses.

## 1. User & Identity Management
FR-1.1 Authentication & AuthZ: Support OAuth 2.0 (Google) and email/password with JWT-based session management.
FR-1.2 User Profile & Currency: Allow users to set a primary display currency, system timezone, and default payment accounts.
FR-1.3 Multi-Currency Handling: Support real-time and historical currency exchange rate conversions for international expenses and group splits. #future-task

## 2. Personal Finance & Account Management
FR-2.1 Account Types: Support tracking across distinct account categories: Cash, Bank Account, Debit Card, Credit Card, Prepaid Cards, Investments, Loan, Insurance, Others/Custom. The user can create accounts from each of these templates.
Credit Cards: Billing cycle dates, payment due dates, credit limits, current statement balances. With optional reminder features #future-task
Investments: Stocks, ETFs, Mutual Funds, Fixed Deposits (manual for now ans API balance updates for #future-task).
Liabilities: Personal loans, Mortgages, Car loans with interest rate and EMI tracking.
Insurances: Term, Health, Vehicle insurance policies with premium due dates.
FR-2.2 Self Account Transfers: Enable fund transfers between owned accounts (e.g., Bank → Credit Card Payment, Bank → Investment) marked explicitly as transfers to prevent distorting net income/expense metrics.
FR-2.3 There are three types of transactions: Income, Expense, and Transfer. Each transaction can be tagged with categories and there are no subcategories for better reporting and ease of use. Each transaction can be associated with a single account and can have multiple participants for group expense splitting. Each participant can have a different share of the transaction amount, and the system will automatically calculate the owed amounts for each participant based on their share.

## 3. Personal Transaction Management
FR-3.1 Income & Expense Logging:
Fields: Date/Time, Amount, Account, Category, Tags, Notes, Attachments (Receipts).
FR-3.2 Category Engine: System defaults with support for hierarchical user-customizable categories (e.g., Food > Groceries, Housing > Rent).
FR-3.3 Recurring Transactions: Automate daily, weekly, monthly, or yearly recurring entries (e.g., Subscriptions, Salary, EMIs).

## 4. Group & Shared Expense Engine (Splitwise Core)
FR-4.1 Group Architecture: Support 1-on-1 friend splits and multi-user Groups (e.g., Trip, Apartment).
FR-4.2 Split Logic Execution: Support 5 core split algorithms:
Equal: Divided evenly among selected members.
Exact Amounts: Fixed numerical amounts per user.
Percentages: Total mapped by percentage allocations (must sum to 100%).
Shares/Proportions: Weighted ratio split (e.g., 2 shares vs. 1 share).
Itemized: Item-by-item breakdown with tax and tip proportional distribution.
FR-4.3 Multi-Payer Support: Allow expenses to be paid by one or multiple users simultaneously.
FR-4.4 Debt Simplification (Min-Cash-Flow): Implement a graph reduction algorithm within groups to minimize the total number of transactions needed to resolve balances.
FR-4.5 Settlement Engine: Record settlements between users with direct payment gateway integration (e.g., UPI, Stripe #future-task) or manual logging.

## 5. Unified Hybrid Ledger (Personal + Splitwise Integration)
FR-5.1 Automated Ledger Mapping: When a user creates or participates in a split transaction, the system must perform a dual-ledger update:
Payer View:
Cash Outflow=Total Amount
Personal Expense=Payer’s Share
Accounts Receivable (Asset)=Total Amount−Payer’s Share
Non-Payer View:
Personal Expense=User’s Share
Accounts Payable (Liability)=User’s Share
FR-5.2 Settlement Accounting:
Receiving Money: Increases selected Bank Account balance while decreasing Accounts Receivable. (Does not register as Income).
Paying Money: Decreases selected Bank/Credit Card balance while decreasing Accounts Payable. (Does not register as Expense).

## 6. Analytics & Financial Reporting
FR-6.1 Consolidated Net Worth: Calculate real-time net worth using:
Net Worth=(Assets+Receivables)−(Liabilities+Payables)
FR-6.2 Cash Flow Analysis: Real-time charts for Income vs. True Personal Expenses (excluding group pass-through funds).
FR-6.3 Group Debt Summary: Visual overview of "Who owes you" vs. "Who you owe" across all groups and 1-on-1 relationships.

## 7. System Architecture & Notifications
FR-7.1 Smart Reminders: Push/Email notifications for Credit Card bill due dates, Insurance renewals, Loan EMIs, and pending group debts.
FR-7.2 Activity Feed & Audit Trail: Immutable logging of all edits, additions, and deletions in group transactions for dispute resolution.

