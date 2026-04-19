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
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── auth/{register,[...nextauth]}
│   │   ├── transactions/{route, [id]/route, bulk/route}
│   │   ├── categories/{route, [id]/route}
│   │   ├── budgets/{route, [id]/route}
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
│   ├── db/{index,schema,migrate,seed,defaults}.ts
│   ├── validations/{auth,transaction,category,budget,user}.ts
│   └── utils.ts                          # formatCurrency, CURRENCIES, etc.
├── hooks/useMonthRange.ts
├── stores/categories.ts                  # Zustand
├── types/index.ts
├── styles/globals.css                    # HSL theme tokens (dark + light)
└── middleware.ts                         # uses authConfig only (no db import)
```

### Critical: auth split

Middleware imports ONLY `auth.config.ts` (no DB). The Credentials provider lives in `auth.ts` which imports `db`. This is the standard Auth.js v5 pattern — keep the split.

### Critical: Postgres driver choices

- **Runtime queries** use `@neondatabase/serverless` + `drizzle-orm/neon-http` (`src/lib/db/index.ts`). HTTP-based, no connection pooling needed, works on Vercel Edge + Node runtimes.
- **Migrations** use `pg` + `drizzle-orm/node-postgres/migrator` (`src/lib/db/migrate.ts`). The HTTP driver can't run transactional DDL.
- **SQL**: all API queries are dialect-neutral. The only Postgres-specific SQL is `to_char(date, 'YYYY-MM-DD')` in `src/app/api/analytics/trends/route.ts`.
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

`credit_card_cycles` is the source of truth for statement dates, balances, minimums, and payment progress. Every card has exactly one projected cycle (the one currently accruing) plus any number of issued (real) cycles behind it. The legacy `credit_cards.statement_day` / `payment_due_day` integers are gone — all cycle reads flow through the cycles table. Card POST writes card + projected cycle atomically; every route that reads "current cycle" selects the row with the newest `cycleCloseDate`.

"Mark statement issued" is the only path that promotes a projected cycle to a real one — PATCH `/api/credit-cards/:id/cycles/:cycleId` flips `is_projected` false, stamps `statement_balance` + `minimum_payment`, and inserts the next projected cycle atomically.

### Credit-card cycle allocation

Payments on a credit card (type=transfer + creditCardId) are allocated to a cycle row via the half-open interval `(cycleCloseDate, paymentDueDate]`. The `amount_paid` column is kept in sync by:

- `POST /api/credit-cards/:id/pay` — atomic batch of `[INSERT tx, ...UPDATE cycles]`
- `POST /api/transactions` — recomputes after an inserted transfer
- `PUT /api/transactions/:id` — recomputes after any allocation-affecting edit (date, amount, creditCardId, or type flip into/out of transfer); sweeps old AND new card when the link changes
- `DELETE /api/transactions/:id` — recomputes after removing a transfer

The pure allocation rule lives in `src/lib/credit-cards.ts::allocateCycleForPayment`. The DB-touching `recomputeCardCycleAllocations` (in `src/lib/credit-card-allocation.ts`) is a self-healing full sweep — it re-derives every cycle's `amount_paid` from scratch each time, so an occasional divergence self-corrects on the next write. CSV import and bulk-delete intentionally do NOT recompute (cost/complexity trade-off); the next pay or transaction edit sweeps them in.

## Database schema

Tables: `users`, `categories` (per-user), `transactions`, `budgets`. Timestamps stored as `timestamp with time zone`. Amounts as `double precision`. See `src/lib/db/schema.ts`.

20 default categories seeded on registration via `seedDefaultCategoriesForUser(userId)` (18 expense/income + 2 loan). `seedDefaultCategoriesForUser` is now `async`, so it must be `await`ed.

## API conventions

- Every route: `requireUser()` first, return 401 if unauthenticated
- Validate bodies/query with Zod, return `zodFail(err)` on 400
- All queries scoped to `userId`
- Response envelope: `{ data, meta? }` or `{ error, details? }`
- See `src/lib/api.ts`

## Code conventions

- Server Components by default; `"use client"` only where needed
- No `any`. Types flow from Drizzle → DTOs in `src/types/index.ts` → components
- `cn()` for className merging, `formatCurrency(amount, currency, signed?)` for money
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
