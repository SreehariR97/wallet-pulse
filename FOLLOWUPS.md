# Follow-ups

Items intentionally left out of recent PRs to keep scope tight. Each is a
discrete, independent task. Check before adding — this file has been
consolidated; don't re-file entries.

Grouped by the PR they were deferred from.

---

## Deployment notes

Things to run after a schema-changing PR lands in production. Not
technical debt — these are real steps, kept here so they don't get lost
in a long README.

### credit-cards + remittances feature

_Resolved — migration 0001 applied, `scripts/backfill-transfer-categories.ts`
run against production. Kept for reference: any fresh staging/self-host
database needs the same two steps (migrate + backfill categories) before
existing users see the transfer categories._

### Credit-card cycle-history migration (Phases 1–5, 2026-04)

_Resolved — migrations 0006 + 0007 applied to production Neon;
`scripts/backfill-credit-card-cycles.ts` ran once during Phase 1 and is
now `@ts-nocheck` historical reference. The integer day-of-month model
is fully gone; cycle dates + payment allocation + status badges all flow
through `credit_card_cycles`._

---

## Credit cards + remittances

### Cash-flow view toggle

The stage-2 plan intentionally deferred this. Analytics queries today
sum `type IN ('income','expense')` only — the "real spending view" where
credit-card spend counts as an expense regardless of when the card is
paid. A "cash flow" view would instead count card *repayments* (transfer
transactions with a `creditCardId`) and remittances (transfer
transactions with a remittance row) as outflows, while excluding card
*expenses* (they don't leave the bank account until the card is paid).

Implement as a toggle in the analytics filter bar. Server-side: either a
new `?view=cashflow` param that switches the CASE expressions, or a
dedicated endpoint (`/api/analytics/cashflow-summary` etc.). UI copy
should explain the difference inline so users know what they're
looking at.

### Snapshot card balances on statement close

_Partially resolved by Phases 3–4: `credit_card_cycles` now stores
`statement_balance` + `minimum_payment` per issued cycle, and `amount_paid`
is auto-allocated from transfer transactions. The "Cycle history" list on
`/cards/[id]` surfaces the per-cycle history already._

**Still open:** the card-level `balance` is computed live as
`SUM(expense) - SUM(transfer)` scoped to that card — no closing-balance
snapshot per cycle. If later edits move transactions around, you can't
reconstruct what the balance WAS at close time from the current cycle row
(`statement_balance` is whatever the user typed when marking issued).
A future "audit trail" PR could snapshot the computed balance at the
instant `is_projected` flips false, separately from the user-entered
`statement_balance`, so we can surface "we computed $X from your
transactions; you told us the statement said $Y" diagnostics.

### Multiple accounts as first-class entities

Implied by the cash-flow toggle but bigger: right now "my cash account"
is an implicit singleton (everything not tagged to a card is "cash").
Real users have checking + savings + multiple debit cards. Model these
as a `bank_accounts` table with the same shape as `credit_cards` but
without cycle fields. Transactions gain an optional `bankAccountId`.
Card repayments then become real transfers between two first-class
accounts instead of "money disappears from cash, card balance shrinks."

### FX rate auto-fetch

Remittances require the user to type the rate manually. Annoying when
their service emails them the exact rate — they're retyping from an
email. Pick a free-tier FX source (exchangerate.host, frankfurter.app)
and offer a "Fill rate for <date>" button on the remittance form that
fetches the mid-market rate for the date. User can still override.

### N+1 queries on GET /api/credit-cards

[src/app/api/credit-cards/route.ts](src/app/api/credit-cards/route.ts)
issues ~3 queries per card via `Promise.all`: (1) latest cycle row,
(2) prior cycle row (for the window start), (3) current-cycle expense
aggregate. Total ~3N queries on top of three base queries (cards,
balance, past-due). Fine for realistic card counts (≤10) — each hits
the relevant index and Neon HTTP is fast. **Trigger:** if any user
accumulates ~30+ active cards (or `?includeArchived=1` becomes a hot
path), collapse into:

- One `SELECT DISTINCT ON (card_id) ... ORDER BY card_id, cycle_close_date DESC`
  for the latest cycle + previous cycle (two passes, or a window function).
- One `UNION ALL` across per-card date windows for the expense aggregate.

Or move `cycleSpend` + cycle metadata out of the list response entirely
and fetch per-card on hover/detail-view mount. Phase 5 deliberately kept
the per-card approach for driver-agnostic simplicity across
pglite/neon-http/node-pg.

### Vitest coverage beyond credit-cards.ts

Stage 6 added Vitest with a minimal config (`src/**/*.test.ts`, no
jsdom). Current suite (77 tests across 9 files) covers: money-pipeline
invariants, user-isolation on every route, credit-card allocation
(pure + integration), and a few targeted API assertions. Gaps:

- No UI component tests — that needs `@testing-library/react` + `jsdom`.
- No direct tests of `GET /api/credit-cards/:id/cycle` window math or
  the list endpoint's cycle-sourcing output shape after the Phase 5
  rewrite (deleted 14 integer-helper tests without replacing).
- No end-to-end flow test (Playwright is still in the roadmap).

**Trigger:** if a bug lands in either the cycle-window derivation or the
list DTO, add one integration test per regression rather than a full
E2E pass.

---

## Post-redesign

### Align `warning` semantics across the app

The warning token (`35 70% 45%`) is currently overloaded:

- **Budget progress** — 80-99% band on [budget-progress.tsx](src/components/dashboard/budget-progress.tsx) and [budgets-view.tsx](src/components/budgets/budgets-view.tsx) (`barColor`/`colorHex` at 80-99%).
- **Loan given** transaction type — amount color in [transaction-table.tsx](src/components/transactions/transaction-table.tsx) and the `loan_given` type button in [transaction-form.tsx](src/components/transactions/transaction-form.tsx).

These convey different things ("watch out, about to overspend" vs "money
out as a loan"). Pick one or introduce a distinct token for the other
context. Likely outcome: budget keeps amber; loan types move to a
neutral or lavender treatment.

### Empty-state audit

Several `EmptyState` usages weren't reachable during the redesign because
the demo account has data. These were not runtime-verified:

- `EmptyState` shared component — [empty-state.tsx](src/components/shared/empty-state.tsx)
- Dashboard budget list empty — in [budget-progress.tsx](src/components/dashboard/budget-progress.tsx)
- Transactions list empty — in [transactions-view.tsx](src/components/transactions/transactions-view.tsx)
- Budgets empty — in [budgets-view.tsx](src/components/budgets/budgets-view.tsx)
- Categories empty per-tab — in [categories-view.tsx](src/components/categories/categories-view.tsx)
- Recent transactions empty — in [recent-transactions.tsx](src/components/dashboard/recent-transactions.tsx)

Action: sign in as a blank user, walk every route, confirm each empty
state reads as intentional whitespace + centered headline + muted
explainer (Superhuman voice), not as a broken page. The
[mom-table.tsx](src/components/analytics/mom-table.tsx) empty state was
rewritten this way during the redesign as a template, and the new
[/cards](src/components/credit-cards/cards-view.tsx),
[/cards/[id]](src/components/credit-cards/card-detail-view.tsx), and
[/remittances](src/components/remittances/remittances-view.tsx) empty
states all match it.

### Drop unused `Badge` import

[categories-view.tsx:7](src/components/categories/categories-view.tsx) — the "default" indicator was demoted from a `Badge` to a plain caption span during the redesign, but the `Badge` import was left in to comply with the "no unrelated cleanup" rule. Trivial delete, zero risk.

### Chart/data visibility for sparse periods

The demo has 15 days of April 2026 transactions with a single income spike
on Apr 1. On the dashboard trend chart (area mode, daily granularity), 14
of 15 data points sit at $0, so both income and expense curves hug the
x-axis and look like "no data" even though the chart is rendering
correctly (confirmed by SVG path inspection). Fixes to consider:

- Add line-mode dots for area-mode too (for data visibility on sparse days).
- Raise the minimum Y-axis value dynamically instead of starting at $0.
- Switch the default dashboard period to a range that typically shows
  denser activity.

Not a redesign concern — the chart tokens are correct; this is a data-viz
readability tradeoff.

### Pie geometry quirk

Bumping `innerRadius` 60→62, `outerRadius` 95→96 and `paddingAngle` 2→1.5
on `<Pie>` in [category-donut.tsx](src/components/charts/category-donut.tsx)
and [payment-donut.tsx](src/components/charts/payment-donut.tsx) caused
Recharts to render empty sector groups (no path children). Reverted to
original values. Worth reporting upstream or pinning a Recharts version
note — a 1–2 pixel sizing change should not silently break SVG path
generation.

### Chart palette: SSR vs CSS-var tradeoff (context for future maintainers)

Charts in [src/components/charts/](src/components/charts/) use baked HSL
literals in [palette.ts](src/components/charts/palette.ts) rather than
`hsl(var(--chart-N))` for fills/strokes. This is a deliberate choice:

- **Why literals?** SSR renders chart SVG with the first-paint CSS variable
  values. On chart-heavy pages (analytics), unresolved CSS vars during
  hydration can cause a flash of unstyled chart (FOUC). Literals are stable
  across hydration and paint the same on the server and first client render.
- **Why still use `hsl(var(--*))` for axes/gridlines/tooltips?** These are
  low-risk (1px lines, text) and need to flip with the theme. Slight paint
  flicker on them is invisible compared to chart body FOUC.
- **Tradeoff**: Baked literals don't auto-adapt to theme. The current
  palette is tuned to read on both white and Mysteria-purple surfaces.
  If the dark palette ever needs to diverge meaningfully, introduce a
  `useChartPalette()` hook that returns a theme-specific tuple — but only
  after benchmarking the hydration-flicker cost.

If anyone re-homogenizes these to `hsl(var(--*))` in a future pass:
confirm no FOUC on analytics page with throttled CPU/network in DevTools.

### Theme toggle hydration guard

[settings-view.tsx](src/components/settings/settings-view.tsx) uses a
`themeReady` flag so the active theme button doesn't render as `outline`
during SSR hydration. The topbar has the same issue (it already does
this). If a third theme-reactive control lands anywhere else, replicate
the pattern or lift it to a shared `useMountedTheme()` hook.
