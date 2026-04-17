# Post-redesign follow-ups

Items intentionally left out of the Superhuman redesign PR to keep scope
tight. Each is a discrete, independent task.

## 1. Align `warning` semantics across the app

The warning token (`35 70% 45%`) is currently overloaded:

- **Budget progress** — 80-99% band on [budget-progress.tsx](src/components/dashboard/budget-progress.tsx) and [budgets-view.tsx](src/components/budgets/budgets-view.tsx) (`barColor`/`colorHex` at 80-99%).
- **Loan given** transaction type — amount color in [transaction-table.tsx](src/components/transactions/transaction-table.tsx) and the `loan_given` type button in [transaction-form.tsx](src/components/transactions/transaction-form.tsx).

These convey different things ("watch out, about to overspend" vs "money
out as a loan"). Pick one or introduce a distinct token for the other
context. Likely outcome: budget keeps amber; loan types move to a neutral
or lavender treatment.

## 2. Empty-state audit

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
rewritten this way during stage 5.5 as a template.

## 3. Drop unused `Badge` import

[categories-view.tsx:7](src/components/categories/categories-view.tsx) — the "default" indicator was demoted from a `Badge` to a plain caption span in stage 5.7, but the `Badge` import was left in to comply with the "no unrelated cleanup" rule of the redesign. Trivial delete, zero risk.

## 4. Chart/data visibility for sparse periods

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

## 5. Pie geometry quirk

In stage 6, bumping `innerRadius` 60→62, `outerRadius` 95→96 and
`paddingAngle` 2→1.5 on `<Pie>` in [category-donut.tsx](src/components/charts/category-donut.tsx) and
[payment-donut.tsx](src/components/charts/payment-donut.tsx) caused
Recharts to render empty sector groups (no path children). Reverted to
original values. Worth reporting upstream or pinning a Recharts version
note — a 1–2 pixel sizing change should not silently break SVG path
generation.

## 6. Chart palette: SSR vs CSS-var tradeoff (context for future maintainers)

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
  palette is tuned to read on both white and Mysteria-purple surfaces
  (verified in stage 6). If the dark palette ever needs to diverge
  meaningfully, introduce a `useChartPalette()` hook that returns a theme-
  specific tuple — but only after benchmarking the hydration-flicker cost.

If anyone re-homogenizes these to `hsl(var(--*))` in a future pass: confirm
no FOUC on analytics page with throttled CPU/network in DevTools. Stage 6
tested with the Pie geometry bug (item 5) which made the regression
obvious; otherwise the FOUC is subtle but present.

## 7. Theme toggle hydration guard

[settings-view.tsx](src/components/settings/settings-view.tsx) uses a
`themeReady` flag so the active theme button doesn't render as `outline`
during SSR hydration. The topbar has the same issue (it already does
this). If a third theme-reactive control lands anywhere else, replicate
the pattern or lift it to a shared `useMountedTheme()` hook.
