# WalletPulse

Privacy-first personal expense tracker. Production-grade Mint/YNAB-style app. Deployable to Vercel with Neon Postgres, or self-host anywhere Node runs.

## Tech stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui (customized dark slate + indigo/cyan palette, Plus Jakarta Sans)
- **Drizzle ORM** + **Postgres** via `@neondatabase/serverless` (HTTP driver — no connection pool issues on Lambda)
  - Runtime queries: `drizzle-orm/neon-http` with a **lazy Proxy** client in `src/lib/db/index.ts`. The client is constructed on first property access, so routes that don't touch the DB (landing page, login form render) don't crash if DATABASE_URL is misconfigured.
  - Migrator: `pg` + `drizzle-orm/node-postgres/migrator` in `src/lib/db/migrate.ts` (the HTTP driver can't run transactional DDL).
  - Local dev Postgres: `docker-compose.yml` ships a Postgres 16 container. Bring it up with `docker compose up -d postgres`.
- **Node 22.x** pinned in `engines` — Vercel uses this exact runtime, which has prebuilt binaries for every native dep we might optionally install.
- **NextAuth v5** (credentials provider, JWT strategy, split edge-safe config)
- **SWR** for client data fetching (`SWRProvider` in the protected layout) — see "Client data fetching" below
- **Zustand** for client state (categories store)
- **Recharts** for charts · **date-fns** · **Zod** · **sonner** · **papaparse**
- Package manager: **pnpm@9.12.0** (pinned via `packageManager` field)

## Scripts

```
pnpm dev          # next dev (port 3000)
pnpm build        # production build
pnpm type-check   # tsc --noEmit
pnpm db:generate  # drizzle migration
pnpm db:migrate   # tsx src/lib/db/migrate.ts
pnpm db:studio    # drizzle studio (port 4983)
pnpm db:seed      # seed default categories
```

`.claude/launch.json` has `next-dev` and `drizzle-studio` configured.

## Architecture

```
src/
├── app/
│   ├── (auth)/{login,register}/page.tsx
│   ├── (protected)/
│   │   ├── layout.tsx                    # sidebar + topbar + mobile nav + QuickAddFab
│   │   ├── dashboard/page.tsx
│   │   ├── transactions/{page,new,[id]/edit}.tsx
│   │   ├── analytics/page.tsx
│   │   ├── budgets/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── accounts/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── auth/{register,[...nextauth]}
│   │   ├── transactions/{route, [id]/route, bulk/route}
│   │   ├── categories/{route, [id]/route}
│   │   ├── budgets/{route, [id]/route}
│   │   ├── accounts/{route, [id]/route, [id]/reconcile/route}  # balances; DELETE archives
│   │   ├── analytics/{summary, trends, category-breakdown, payment-methods}
│   │   ├── export/route.ts               # CSV + JSON
│   │   ├── import/route.ts               # CSV with column mapping
│   │   └── user/{profile, password}
│   ├── layout.tsx                        # ThemeProvider + SessionProvider + Toaster
│   └── page.tsx                          # landing
├── components/
│   ├── ui/                               # shadcn primitives
│   ├── layout/{sidebar,topbar,mobile-nav,nav-items}
│   ├── shared/{page-header,empty-state,confirm-dialog}
│   ├── dashboard/{summary-cards,budget-progress,recent-transactions,dashboard-view}
│   ├── charts/{chart-container,trend-chart,category-donut,category-bar,income-expense-bars,payment-donut,spending-heatmap}
│   ├── analytics/{analytics-view,mom-table}
│   ├── budgets/budgets-view.tsx
│   ├── accounts/{accounts-view,account-form,account-tile,account-select,reconcile-dialog}
│   ├── categories/categories-view.tsx
│   ├── transactions/{transaction-table,transaction-form,transaction-filters,transactions-view,quick-add-fab}
│   ├── settings/{settings-view,import-dialog}
│   ├── auth/{login-form,register-form}
│   ├── theme-provider.tsx
│   └── session-provider.tsx
├── lib/
│   ├── auth.ts                           # full NextAuth (db-backed Credentials)
│   ├── auth.config.ts                    # edge-safe shared config (for middleware)
│   ├── api.ts                            # ok/fail/zodFail/requireUser helpers
│   ├── dto.ts                            # toTransactionDTO, toAccountDTO
│   ├── accounts.ts                       # balances, validateAccountLinks
│   ├── analytics-flows.ts                # spending vs cash-flow predicates
│   ├── db/{index,schema,migrate,seed,defaults}.ts
│   ├── validations/{auth,transaction,category,budget,user}.ts
│   └── utils.ts                          # formatCurrency, CURRENCIES, etc.
├── hooks/{useMonthRange,useUrlState,useAccounts}.ts
├── stores/categories.ts                  # Zustand
├── types/index.ts
├── styles/globals.css                    # HSL theme tokens (dark + light)
└── middleware.ts                         # uses authConfig only (no db import)
```

### Critical: auth split

Middleware imports ONLY `auth.config.ts` (no DB). The Credentials provider lives in `auth.ts` which imports `db`. This is the standard Auth.js v5 pattern — keep the split.

### Critical: session revocation and auth rate limits

- `auth.ts` extends the edge-safe `jwt` callback with `revalidateSessionToken` (`src/lib/auth/credentials.ts`): every server-side `auth()` call does one PK lookup on `users` and ends the session if the user is gone or `users.session_version` no longer matches the token's `sv`. It also refreshes `currency` from the DB. Password change bumps `session_version`, which signs out every device.
- Because middleware can't see the DB, it must never redirect based on "looks signed in" — a revoked token would loop between `/login` and `/dashboard`. The "signed-in user visiting /login" redirect lives in `src/app/(auth)/layout.tsx`.
- Login (per IP + per email), registration (per IP) and password change (per user) are rate-limited by `src/lib/rate-limit.ts`, a fixed-window counter in the `rate_limits` table (one atomic upsert per check). Use `consumeRateLimit` for any new unauthenticated or credential-checking endpoint.
- Security headers (CSP, frame-ancestors, HSTS, nosniff…) are set in `next.config.mjs`. Adding a third-party script/font/API origin means adding it to the CSP there.

### Critical: Postgres driver choices

- **Runtime queries** use `@neondatabase/serverless` + `drizzle-orm/neon-http` (`src/lib/db/index.ts`). HTTP-based, no connection pooling needed, works on Vercel Edge + Node runtimes.
- **Migrations** use `pg` + `drizzle-orm/node-postgres/migrator` (`src/lib/db/migrate.ts`). The HTTP driver can't run transactional DDL.
- **SQL**: API queries are dialect-neutral except `to_char(date, 'YYYY-MM-DD')` in `src/app/api/analytics/trends/route.ts` and `DISTINCT ON` in `reconciliationStatus()` (`src/lib/accounts.ts`).
- **Search**: use `ilike()` (not `like()`) for case-insensitive search — Postgres `LIKE` is case-sensitive.

### Critical: atomic multi-statement writes

The neon-http driver does NOT support interactive transactions — calling `db.transaction(async (trx) => ...)` throws "No transactions support in neon-http driver" at runtime in production. The type system does not catch this because `db` is a union (`NeonHttpDatabase | NodePgDatabase`) and `.transaction()` exists on both.

For routes that write multiple rows atomically:
- Use `db.batch([...queries])` on neon-http (atomic server-side via Neon's implicit transaction)
- Use `db.transaction(async trx => ...)` on node-postgres
- Dispatch at runtime via `typeof (db as { batch?: unknown }).batch === "function"`

Pre-generate UUIDs client-side so inserts don't depend on each other's results — `db.batch` doesn't allow reading one insert's result before writing the next. For the canonical implementation, see the POST and PATCH handlers in `src/app/api/remittances/route.ts` and `src/app/api/remittances/[id]/route.ts`.

This pattern was added after two routes (remittances POST and PATCH) shipped with `db.transaction()` and broke on production while local dev (pg driver) kept working. If you add a new route with multi-statement atomic writes, use the same dispatch.

### Credit-card cycles

`credit_card_cycles` is the source of truth for statement dates, balances, minimums, and payment progress. Every card has exactly one projected cycle (the one currently accruing) plus any number of issued (real) cycles behind it. The legacy `credit_cards.statement_day` / `payment_due_day` integers are gone — all cycle reads flow through the cycles table. Card POST writes card + cycle atomically; every route that reads "current cycle" selects the row with the newest `cycleCloseDate`.

The database enforces the invariant: `ccc_one_projected_per_card` (partial unique index on `card_id WHERE is_projected`) and `ccc_card_close_uniq` (`card_id, cycle_close_date`). So **any path that writes a real (issued) cycle must insert the next projected cycle in the same atomic unit** — use `nextProjectedCycleDates()` from `src/lib/credit-cards.ts`. The three such paths: mark-statement-issued (PATCH `/api/credit-cards/:id/cycles/:cycleId`, the normal one; its UPDATE is guarded by `is_projected` so a double submit returns 409), card POST with a statement balance + minimum, and card PATCH with a statement balance + minimum.

### Credit-card cycle allocation

Payments on a credit card (type=transfer + creditCardId) are allocated to a cycle row via the half-open interval `(cycleCloseDate, paymentDueDate]`. The `amount_paid` column is kept in sync by:

- `POST /api/credit-cards/:id/pay` — atomic batch of `[lockCard, INSERT tx, reallocateCardCycles]`
- Mark-issued and card PATCH — end their atomic batch with `reallocateCardCycles` (cycle dates may move)
- `POST /api/transactions` — recomputes after an inserted transfer
- `PUT /api/transactions/:id` — recomputes after any allocation-affecting edit (date, amount, creditCardId, or type flip into/out of transfer); sweeps old AND new card when the link changes
- `DELETE /api/transactions/:id` and `DELETE /api/transactions/bulk` — recompute after removing transfers

The pure allocation rule lives in `src/lib/credit-cards.ts::allocateCycleForPayment` (reference implementation: `computeCycleAmountsPaid`). What gets persisted is its SQL port, `reallocateCardCycles` in `src/lib/credit-card-allocation.ts` — one UPDATE that re-derives every cycle's `amount_paid` from scratch, so divergence self-corrects. A test pins the SQL to the JS rule on randomized data.

`GET /api/credit-cards/:id/cycles` also lists each cycle's `payments` (with the paying account) by running `allocateCycleForPayment` over the cycles oldest-first — read-only, so it's fine in JS; a test checks the listed payments always sum to `amount_paid`. The card page shows "from <account>" per statement, and the pay dialog defaults "Paid from" to the account of the card's latest payment.

**Never compute `amount_paid` in JS and write it back** — two concurrent payments each read a snapshot and one overwrites the other (reproduced: 20 parallel $10 payments recorded $30). Instead, in one atomic unit: `lockCard` (SELECT … FOR UPDATE on the card row) first, then your writes, then `reallocateCardCycles`. Under READ COMMITTED each statement gets a fresh snapshot, so the UPDATE after the lock sees every committed payment. `recomputeCardCycleAllocations` does exactly this for callers outside a batch. CSV import never links transactions to cards, so it doesn't recompute.

### Accounts and cash flow

`accounts` (checking, savings, cash, wallet…) hold an `opening_balance`; the current balance is never stored. `accountTotals()` in `src/lib/accounts.ts` derives it: opening + every transaction whose `account_id` is the account (income, loan_taken, repayment_received add — `INFLOW_TYPES`; everything else subtracts) + every transfer whose `transfer_account_id` is the account.

- A **transfer** with both `account_id` and `transfer_account_id` is a move between two of the user's accounts (category "Account Transfer"). With only `transfer_account_id` it's money arriving from outside (e.g. a positive balance adjustment). With neither, it leaves your accounts: a card payment (`credit_card_id`) or a remittance.
- A **card-paid expense** has no account — the card is the instrument; money leaves an account when the card is paid. The DB CHECK `transactions_transfer_account_check` plus `validateAccountLinks()` enforce the combinations. Call `validateAccountLinks(userId, next, previous)` in every route that writes `account_id`/`transfer_account_id` (transactions POST/PUT, card pay, remittances POST/PATCH, import); it also refuses *new* links to archived accounts while keeping existing ones.
- Accounts are archived (`is_active=false`), never deleted by the API. Creating an account with `claimUnassigned` adopts every unassigned, non-card-purchase transaction in the same atomic unit.

Analytics routes take `view=spending|cashflow` and `accountId` (`analyticsScopeSchema` + `flowPredicates()` in `src/lib/analytics-flows.ts`):
- **spending** (default, unchanged): income vs expense; card purchases count when made.
- **cashflow**: in = INFLOW_TYPES plus transfers arriving from outside; out = expenses not on a card, loan_given, repayment_made, and transfers leaving your accounts. Card purchases don't count until paid; account-to-account moves cancel out.
- With `accountId`, cash flow equals exactly that account's balance movement (including transfers to/from your other accounts). A test pins this.

**Reconciliation** (`/api/accounts/:id/reconcile`): the user enters a statement date and balance; `accountTotals(…, asOf)` gives WalletPulse's balance at the end of that date. POST records an `account_reconciliations` row (append-only history: statement balance, computed balance, optional adjustment link) and, if asked, a "Balance Adjustment" transfer for the difference, dated on the statement, in the same atomic unit. The client sends the balance it showed as `expectedBalance`; a mismatch returns 409 instead of adjusting by a stale difference. The accounts list reports each account's latest reconciliation with the balance for that date recomputed now (`reconciliationStatus`), so editing a transaction on or before a reconciled date shows the account as out of sync.

**Reconciled-period lock** (`src/lib/reconcile-lock.ts`): a transaction is *reconciled* when it's linked to an account (either side) and dated on or before that account's latest reconciliation — derived, never stored. Any write that would change a reconciled balance returns **409 with `details.reconciled`** (the affected accounts) unless the request sends `x-confirm-reconciled: 1`. Guarded: transactions POST/PUT/DELETE and bulk delete, card pay, remittances POST/PATCH/DELETE, import with an account, and account PATCH of `openingBalance`. PUT/PATCH only guard edits where `balanceChanged()` (amount, date, type, account links) — renames and recategorising always pass. **Any new route that writes `transactions` must call `guardReconciled()`** with the before/after states. The reconcile route itself is exempt. Client side, wrap such writes in `useReconciledWrite()` (`src/components/shared/reconciled-confirm.tsx`): it asks "Change a reconciled period?" and retries with the header, or throws `WriteCancelled` (catch it and return without a toast). The transaction list returns `reconciled` per row (lock badge).

## Database schema

Tables: `users`, `categories` (per-user), `transactions`, `budgets`, `accounts`, `account_reconciliations`, `credit_cards`, `credit_card_cycles`, `remittances`, `rate_limits`. Timestamps stored as `timestamp with time zone`; transaction/budget dates are civil `date` columns compared as YYYY-MM-DD strings. Money is `numeric(14,2)` (converted with `Number()` only when building DTOs). See `src/lib/db/schema.ts`.

Constraints worth knowing (migration 0009): one budget per `(user, category, period)` including the category-less overall budget (`NULLS NOT DISTINCT`, so Postgres 15+); one copy of each *default* category name per user (user-created categories may share names); `amount > 0` and enum CHECKs on transactions/budgets/categories (added `NOT VALID`, so legacy rows aren't re-checked). Catch unique violations with `isUniqueViolation(err)` from `src/lib/api.ts` and return 409. Validate dates with `isoDate()` and money with `moneyAmount()` from `src/lib/validations/common.ts` — a bare regex accepts 2026-02-31 and `.positive()` accepts 0.001.

24 default categories seeded on registration, in the same atomic unit as the user row (`defaultCategoryRows(userId)` in `src/lib/db/seed.ts`). The categories GET backfill only restores the four transfer categories (`TRANSFER_CATEGORY_NAMES`) that the pay/remittance/transfer/reconcile flows look up by name (reconcile also recreates its own if missing); other deleted defaults stay deleted. Account names are unique per user, case-insensitively (`accounts_user_name_uniq`, migration 0010).

## API conventions

- Every route: `requireUser()` first, return 401 if unauthenticated
- Validate bodies/query with Zod, return `zodFail(err)` on 400
- All queries scoped to `userId`
- Response envelope: `{ data, meta? }` or `{ error, details? }`
- See `src/lib/api.ts`

## Client data fetching

- Read API data with `useSWR<ApiEnvelope<T>>(url)`; the provider's fetcher is `apiFetch`. Don't `fetch` in a `useEffect`: SWR only renders the response for the current key (no out-of-order races), dedupes identical requests across components, and exposes `error`.
- Write with `apiFetch(url, jsonBody(method, payload))` inside `try { } catch { toast.error(errorMessage(err, "…")) } finally { setPending(false) }`. It throws `ApiError` (with the server's `details`) on any non-2xx, and a 401 sends the user to `/login?callbackUrl=…`.
- After any write call `revalidateAll()` — one transaction changes the dashboard, budgets, analytics and card balances at once. `router.refresh()` alone never reaches client-fetched views.
- Show `ErrorState` (with a retry) when a request failed; `EmptyState` only for a successful empty result.
- Charts load through `src/components/charts/lazy.tsx` (Recharts stays out of first-load JS); import chart types from the chart modules directly.
- Recharts 3: Tooltip formatters get `number | string | array` — convert with `tooltipNumber()` from `src/components/charts/recharts-helpers.ts`. Tooltip and Legend now sort items alphabetically by default; pass an explicit sorter (e.g. `INCOME_FIRST_TOOLTIP` / `INCOME_FIRST_LEGEND`) when order matters. A chart inside an `aria-hidden` wrapper (with an sr-only table) must set `accessibilityLayer={false}`, or its SVG becomes a hidden focus stop (axe `aria-hidden-focus`).
- Route boundaries: `src/app/(protected)/{loading,error,not-found}.tsx`, plus `src/app/{not-found,global-error}.tsx`.
- List/view state that a user would expect to survive refresh or a shared link (transactions filters/search/sort/page/account, dashboard month, analytics range/view/account) lives in the URL: read initial values with `useSearchParams()` through the parsers in `src/lib/url-state.ts` (they drop malformed values), write with `useSyncToUrl()` from `src/hooks/useUrlState.ts` (history.replaceState — no server round-trip). Keep `src/lib/url-state.ts` free of Zod: it ships to the browser.

## Code conventions

- Server Components by default; `"use client"` only where needed
- No `any` (enforced by ESLint `@typescript-eslint/no-explicit-any`). Types flow from Drizzle → DTOs in `src/types/index.ts` → components
- Every form control has a `<Label htmlFor>`/`id` pair (or `aria-label`); toggle-button groups use `role="radiogroup"` + `role="radio"`/`aria-checked`; icon-only buttons need `aria-label`
- `cn()` for className merging, `formatCurrency(amount, currency, signed?)` for money. Formatting locale follows the currency (`localeForCurrency`: INR → en-IN lakh/crore grouping, CAD/AUD → plain "$"); use `formatAmountFor(amount, currency)` for a symbol-less amount. Never `toLocaleString("en-US")`.
- Colors: both themes pass axe WCAG 2 A/AA on every main page — check contrast before changing a token in `globals.css` (dark `--destructive` is a light red with dark `--destructive-foreground` on purpose).
- Empty states via `EmptyState`; skeletons via `Skeleton`; toasts via `sonner`
- ConfirmDialog `onConfirm` signature is `() => void | Promise<void>` — wrap logic in async callback, don't use `&&`
- Don't shadow the global `fetch` when destructuring the Zustand categories store — alias as `fetchCategories`

## Demo account

- Email: `demo@walletpulse.test`
- Password: `demo123`
- Seeded with 16 transactions across Apr 1–15, 2026, plus Groceries ($400/mo) and Dining Out ($150/mo) budgets

## Status: all phases complete ✅

- Phase 1 foundation, Phase 2 CRUD, Phase 3 dashboard+analytics, Phase 4 budgets+settings
- `pnpm type-check` passes, `pnpm build` succeeds
- Known harmless warning: "Serializing big strings" from webpack cache on dev build

## Vercel deployment

Env vars required: `DATABASE_URL` (Neon pooled connection), `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST=true`. Apply schema once with `DATABASE_URL=... pnpm db:migrate` before first deploy. No build-time DB access required — routes are serverless functions that open an HTTP connection per request.

## What to do next session

Pick from: additional polish (error boundaries per section, mobile tuning at 375px), multi-currency conversion, transaction receipts upload, recurring-transaction materialization (auto-create future instances), PWA manifest, E2E tests (Playwright).
