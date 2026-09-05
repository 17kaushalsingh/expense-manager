# Frontend Design Document
This Frontend Design Document translates Coinbase’s polished, data-dense iOS design language into a responsive web application. The UI merges crisp financial typography, high-contrast dark/light tokens, tactile micro-interactions, and instant visual feedback to make tracking complex personal accounts and group split ledgers feel effortless.

## 1. Design Philosophy & Visual Tokens (Coinbase Inspiration)
Coinbase’s UI succeeds because it presents complex, fast-changing financial data with absolute visual clarity: bold primary metrics, crisp contrast, border-driven hierarchy, and zero clutter.
Key Principles
Bold Numerical Hierarchy: Financial balances are the visual anchor. Large numbers use tabular-nums to prevent text layout shift during real-time updates.
Tactile Surface Contrast: Instead of heavy drop shadows, elevation is defined by crisp, 1px subtle borders (border-neutral-800 in dark mode) and subtle background shifts.
Contextual Color Coding: Colors signify direction of money:
Positive / Receivables / Income: Crisp Mint/Emerald (Money coming in or owed to you).
Negative / Payables / Expense: Soft Crimson/Coral (Money going out or owed to others).
Neutral / Transfers: Coinbase Electric Blue (Internal movement / actions).
Color Palette (Tailwind Mapping)
Token	Dark Mode (Default)	Light Mode	Application
Background Base	#0A0D12 (slate-950)	#F8F9FA (gray-50)	Main canvas background
Surface Primary	#121721 (slate-900)	#FFFFFF (white)	Cards, sheets, persistent containers
Surface Secondary	#1B2230 (slate-800/60)	#F1F5F9 (slate-100)	Input fields, active tabs, hover states
Border Soft	#263040 (slate-800)	#E2E8F0 (slate-200)	1px clean card and divider boundaries
Brand Primary	#0052FF (Coinbase Blue)	#0052FF	CTAs, active indicators, selection rings
Positive / Asset	#00D395 (Emerald Mint)	#00A870	Incomes, net worth growth, friend owes you
Negative / Liability	#FF4D4D (Soft Crimson)	#E53935	Expenses, debt, you owe friend
Typography System
Primary Font: Inter, SF Pro Display, or system sans-serif stack.
Financial Numerals: Mandatory font-variant-numeric: tabular-nums (Tailwind: tabular-nums).
Scale:
Hero Balance: text-4xl to text-5xl, font-bold, tracking-tight (e.g., $42,850.50).
Section Titles: text-lg, font-semibold, text-slate-100.
Secondary / Labels: text-xs to text-sm, font-medium, text-slate-400.

## 2. Information Architecture & Key Screen Layouts
A. Dashboard Shell (The "Financial Control Center")
The layout uses a persistent left sidebar on desktop and a bottom navigation bar on mobile.
+------------------------------------------------------------------------------------+
| SIDEBAR      | HERO BALANCE CARD                                                   |
|              | Net Worth: $42,850.50  [+4.2% this month]                         |
| [Home]       | [ Assets: $50k ] [ Liabilities: $10k ] [ Group Balances: +$2.8k ]   |
| [Accounts]   +---------------------------------------------------------------------+
| [Groups]     | INTERACTIVE CASH FLOW & DEBT CHART                                  |
| [Analytics]  | [ 1D | 1W | 1M | 1Y | ALL ]  <-- Scrubber chart                     |
| [Settings]   +------------------------------------+--------------------------------+
|              | ACCOUNTS VAULT (Cards & Banks)     | QUICK SPLIT & DEBT ACTION BOX  |
|              | HDFC Bank: $12,400                 | Alex owes you: $120.00         |
|              | AMEX Credit: -$1,200 (Due 15th)    | You owe Group Trip: $45.00     |
|              | Groww ETFs: $31,000                | [ + Add Split ] [ Settle Up ]  |
+--------------+------------------------------------+--------------------------------+
B. Group Split Experience (Hybrid Ledger UI)
When viewing a group or split details:
Pill-Based Segmented Controls: Instant toggle between Group Ledger (All transactions) and Net Balance Matrix ("Who owes whom").
Dual-Perspective Transaction Card:
Left side: Transaction Icon + Category + Description + Date.
Right side:
Top line: Total paid amount (e.g., $120.00).
Bottom line (Badge): Contextual impact on your wallet (e.g., You lent $80.00 in Mint green, or You borrowed $40.00 in Crimson red).

## 3. UI Component Specifications (Coinbase Style)
Component 1: The Coinbase "Hero Value Card"
Visuals: Full-width surface card with subtle gradients or clean slate background. Includes interactive hover scrubbers over a mini Visx/Recharts line chart.
Interaction: Scrubbing across the time-series chart instantly updates the main balance number, percentage delta, and timestamp display with zero latency.
Component 2: Account Vault Card
Visuals: Compact rectangular card mimicking a physical/digital card layout.
Details:
Top row: Bank/Issuer logo + Account Name + Account Type Badge (Credit, Asset, Investment).
Middle row: Available Balance or Current Statement Balance.
Bottom row (Credit Cards): A visual progress bar showing credit utilization percentage (e.g., $1,200 / $5,000 limit with color shifts past 50% utilization).
Component 3: Split Builder Modal / Sheet
Visuals: A clean slide-over modal on desktop or bottom sheet on mobile.
UX Flow:
Input Amount & Description (Large Coinbase-style keypad / numeric input).
Select Source Account (Which owned asset/credit card paid for this?).
Select Group / Friends.
Select Split Mode using dynamic tabs: Equal | Exact | % | Shares.
Real-Time Math Guardrails: Shows a sticky footer banner indicating remaining unallocated amount (e.g., $12.00 left to split) before allowing submission.

## 4. Micro-Interactions & Motion Design
Following Coinbase's app polish, motion must be deliberate, fast, and physically grounded.
Transitions: Use Framer Motion with spring physics (stiffness: 400, damping: 30) for layout changes rather than linear CSS fades.
Numeric Counting Effect: Balances animate numbers smoothly (AnimateNumber counter) when switching filter ranges or logging new entries.
Optimistic UI Updates: When a transaction or settlement is submitted, insert it immediately into the UI with a pending status badge, reverting gracefully only if the backend RPC fails.
Tactile Press Feedback: Buttons and list items scale down slightly on click/tap (scale: 0.98) with quick recovery.

## 5. Recommended Frontend Tech Stack
Framework: Next.js 14/15 (App Router, Server Components for initial shell render).
Styling & Tokens: Tailwind CSS + clsx / tailwind-merge.
Primitive Components: Radix UI or Shadcn UI (for accessible Dialogs, Popovers, Tabs, and Dropdowns).
State Management:
TanStack Query (React Query): Caching, automatic refetching, and optimistic updates for backend transactions.
Zustand: Client-side UI state (active modal states, split drawer drafts, chart hover states).
Data Visualization: Recharts or Visx (Airbnb's low-level charting library for smooth scrubbing).
Animations: Framer Motion.