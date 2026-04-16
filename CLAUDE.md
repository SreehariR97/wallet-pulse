# WalletPulse

Privacy-first, self-hosted personal expense tracker. Production-grade Mint/YNAB-style app.

## Tech stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui (customized dark slate + indigo/cyan palette, Plus Jakarta Sans)
- **Drizzle ORM** + SQLite (`better-sqlite3`, file at `data/walletpulse.db`)
- **NextAuth v5** (credentials provider, JWT strategy, split edge-safe config)
- **Zustand** for client state (categories store)
- **Recharts** for charts · **date-fns** · **Zod** · **sonner** · **papaparse**
- Package manager: **pnpm**

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

Middleware imports ONLY `auth.config.ts` (no DB), because `better-sqlite3` breaks Edge Runtime. The Credentials provider lives in `auth.ts` which imports `db`. Keep this split.

## Database schema

Tables: `users`, `categories` (per-user), `transactions`, `budgets`. Timestamps stored as unix seconds. See `src/lib/db/schema.ts`.

18 default categories seeded on registration via `seedDefaultCategoriesForUser(userId)`.

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

## What to do next session

Pick from: additional polish (error boundaries per section, mobile tuning at 375px), multi-currency conversion, transaction receipts upload, recurring-transaction materialization (auto-create future instances), PWA manifest, E2E tests (Playwright), Postgres migration path.
