# WalletPulse

**A privacy-first, self-hosted personal finance tracker. Your money, beautifully tracked — on your own machine.**

WalletPulse is a production-grade, Mint / YNAB-style expense tracker that runs entirely on your hardware. No third-party aggregators, no bank linking, no analytics pixels — every transaction, category, and budget lives in a single SQLite file you control.

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white" />
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
  <img alt="NextAuth" src="https://img.shields.io/badge/Auth.js-v5-A855F7" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## Highlights

- **Privacy by design** — data never leaves your machine. Single-file SQLite database, no telemetry, no cloud.
- **Full CRUD workflow** for transactions, categories, and budgets, with bulk operations and advanced filtering.
- **Rich analytics** — trend charts, category breakdowns, spending heatmap, month-over-month comparison, payment-method distribution.
- **Budgets with alerts** — per-category or overall, with progress bars that flip to warning/destructive when you exceed them.
- **Loan tracking** — first-class transaction types for money lent, borrowed, and repaid, so loans don't pollute your income/expense totals.
- **CSV import / export** with column mapping, plus JSON backup for full portability.
- **Recurring transactions** flagged with a badge so you can see your fixed costs at a glance.
- **Dark-first UI** on a refined slate + indigo/cyan palette, using Plus Jakarta Sans. Responsive down to 375px with a mobile nav and quick-add FAB.
- **Polished UX** — toasts, skeletons, empty states, confirm dialogs, and keyboard-accessible Radix primitives throughout.

---

## Screenshots

> _Log in with the demo account below to see every screen populated with realistic data._

| | |
| --- | --- |
| **Dashboard** — month navigator, summary cards, budget progress, trend chart, recent transactions | **Transactions** — filterable, sortable table with bulk delete and inline actions |
| **Analytics** — time-range selector, heatmap, donut + bar, income-vs-expense, MoM table | **Budgets** — create, edit, and visualize per-category or overall budget progress |

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 14** (App Router) + React 18 + TypeScript |
| Styling | **Tailwind CSS** + custom HSL theme tokens (dark + light) |
| UI primitives | **shadcn/ui** on top of **Radix UI** |
| Charts | **Recharts** |
| Database | **SQLite** via **better-sqlite3** |
| ORM & migrations | **Drizzle ORM** + **drizzle-kit** |
| Authentication | **NextAuth v5** (Auth.js) — credentials provider, JWT strategy |
| Forms & validation | **react-hook-form** + **Zod** |
| Client state | **Zustand** |
| Notifications | **sonner** |
| CSV | **papaparse** |
| Package manager | **pnpm** |

---

## Quick start

### Prerequisites

- **Node.js** ≥ 18.17 (LTS recommended)
- **pnpm** ≥ 9 — install via `npm install -g pnpm` or `corepack enable`

### 1. Clone and install

```bash
git clone https://github.com/SreehariR97/wallet-pulse.git
cd wallet-pulse
pnpm install
```

### 2. Configure environment

Copy the example file and generate a secret:

```bash
cp .env.example .env.local
```

Then open `.env.local` and replace `your-secret-here` in both `NEXTAUTH_SECRET` and `AUTH_SECRET` with a random string. A good one-liner:

```bash
openssl rand -base64 32
```

Minimal `.env.local`:

```env
NEXTAUTH_SECRET=<your-generated-secret>
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=<your-generated-secret>
AUTH_TRUST_HOST=true
DATABASE_URL=file:./data/walletpulse.db
```

### 3. Initialize the database

```bash
pnpm db:migrate   # applies Drizzle migrations
pnpm db:seed      # seeds the demo user + default categories
```

### 4. Run the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo account

| Field | Value |
| --- | --- |
| Email | `demo@walletpulse.test` |
| Password | `demo123` |

The demo user ships with a handful of transactions and two budgets (Groceries $400 / month, Dining Out $150 / month) so you can see every screen with realistic data.

---

## Available scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Start the built app |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | `tsc --noEmit` across the whole codebase |
| `pnpm db:generate` | Generate a new Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations to the SQLite file |
| `pnpm db:studio` | Open Drizzle Studio on port 4983 to browse the DB |
| `pnpm db:seed` | Seed default categories + demo user |

---

## Project structure

```
src/
├── app/
│   ├── (auth)/               # login + register
│   ├── (protected)/          # dashboard, transactions, analytics, budgets, categories, settings
│   └── api/                  # REST-ish route handlers
│       ├── auth/             # NextAuth handlers + registration
│       ├── transactions/     # CRUD + bulk delete
│       ├── categories/       # CRUD
│       ├── budgets/          # CRUD
│       ├── analytics/        # summary, trends, category-breakdown, payment-methods
│       ├── export/           # CSV + JSON
│       ├── import/           # CSV ingest with column mapping
│       └── user/             # profile + password update
├── components/
│   ├── ui/                   # shadcn primitives
│   ├── layout/               # sidebar, topbar, mobile nav
│   ├── dashboard/            # summary cards, budget progress, recent transactions
│   ├── charts/               # trend, donut, bar, heatmap, income-vs-expense
│   ├── analytics/            # analytics view + MoM table
│   ├── budgets/              # budgets view + dialog
│   ├── categories/           # categories view
│   ├── transactions/         # table, form, filters, quick-add FAB
│   └── settings/             # settings view + import dialog
├── lib/
│   ├── auth.ts               # NextAuth config (DB-backed credentials)
│   ├── auth.config.ts        # Edge-safe config for middleware
│   ├── api.ts                # ok / fail / zodFail / requireUser helpers
│   ├── db/                   # schema, migrations, seed, defaults
│   ├── validations/          # Zod schemas per domain
│   └── utils.ts              # formatCurrency, CURRENCIES, cn, etc.
├── hooks/                    # useMonthRange
├── stores/                   # Zustand categories store
├── types/                    # DTOs shared between server and client
└── middleware.ts             # route protection via authConfig
```

---

## Architecture notes

### Edge-safe auth split

`middleware.ts` runs in the Edge Runtime, which cannot load native modules like `better-sqlite3`. WalletPulse solves this with a two-file auth setup:

- **`src/lib/auth.config.ts`** — pure config (providers list, callbacks, pages). Zero DB imports. Safe to import from middleware.
- **`src/lib/auth.ts`** — spreads `authConfig` and adds the Credentials provider, which calls into Drizzle/SQLite to verify the user. Used by API routes and Server Components.

This mirrors the pattern recommended by the Auth.js maintainers and keeps middleware fast, deterministic, and Edge-compatible.

### Server Components by default

Every route is a Server Component unless it needs client state, event handlers, or browser APIs. `"use client"` is used sparingly — typically for forms, charts, filters, and dialogs. Data is fetched on the server and streamed into the page.

### Validated everywhere, authorized everywhere

Every API handler follows the same pattern:

```ts
export async function POST(req: Request) {
  const user = await requireUser();                 // 401 if unauthenticated
  const body = transactionCreateSchema.parse(...);  // 400 on invalid shape
  // all DB queries are scoped to user.id
}
```

Every query is scoped to the authenticated user's ID — there is no global admin view and there are no cross-tenant reads.

### Response envelope

All API responses use a small shared envelope:

```ts
{ data: T, meta?: { ... } }   // success
{ error: string, details?: unknown } // failure
```

Helpers live in `src/lib/api.ts`.

---

## API at a glance

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a new account (also seeds default categories) |
| `GET`  | `/api/transactions` | Paginated list with filters (category, type, payment method, date range, search, amount range, tags) |
| `POST` | `/api/transactions` | Create a transaction |
| `PUT`  | `/api/transactions/:id` | Update |
| `DELETE` | `/api/transactions/:id` | Delete |
| `POST` | `/api/transactions/bulk` | Bulk delete by IDs |
| `GET`  | `/api/categories` | List user categories |
| `POST` | `/api/categories` | Create |
| `PUT`  | `/api/categories/:id` | Update |
| `DELETE` | `/api/categories/:id` | Delete (restricted if still in use) |
| `GET`  | `/api/budgets` | List with computed `spent` for the active period |
| `POST` | `/api/budgets` | Create |
| `PUT`  | `/api/budgets/:id` | Update |
| `DELETE` | `/api/budgets/:id` | Delete |
| `GET`  | `/api/analytics/summary` | Income, expense, net, savings rate for a range |
| `GET`  | `/api/analytics/trends` | Daily / weekly / monthly series |
| `GET`  | `/api/analytics/category-breakdown` | Totals per category |
| `GET`  | `/api/analytics/payment-methods` | Totals per payment method |
| `GET`  | `/api/export?format=csv\|json` | Download full backup |
| `POST` | `/api/import` | Ingest a CSV-parsed array of rows |
| `PUT`  | `/api/user/profile` | Update name, email, currency, monthly budget |
| `PUT`  | `/api/user/password` | Change password (bcrypt verify + update) |
| `DELETE` | `/api/user/profile` | Delete account and cascade all data |

---

## Data model

```
users
 ├─< categories        (per-user, type = expense | income | loan)
 ├─< transactions      (type = expense | income | loan_given | loan_taken | repayment_made | repayment_received)
 └─< budgets           (overall or per-category, period = weekly | monthly | yearly)
```

Timestamps are stored as Unix seconds (compact, index-friendly, timezone-agnostic). Amounts are `REAL`. The schema lives in `src/lib/db/schema.ts`.

---

## Deployment

WalletPulse is designed to be self-hosted on any box that can run a Node process and hold a writable SQLite file.

1. Provision a VM or container with Node 18+.
2. Copy the project, run `pnpm install --prod` and `pnpm build`.
3. Set the same env vars as local (`AUTH_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL`).
4. Run `pnpm db:migrate`, then `pnpm start` behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel, etc.).
5. Back up `data/walletpulse.db` on whatever cadence you like — it's just a single file.

Because middleware is Edge-safe and the rest of the app runs on the Node runtime, you can also deploy to Vercel, Railway, Fly, or any Node-capable PaaS; the only caveat is that the SQLite file must live on persistent storage.

---

## Roadmap

- Multi-currency conversion with daily FX rates
- Receipt uploads attached to transactions
- Recurring-transaction materialization (auto-create future instances)
- Progressive Web App manifest + offline shell
- Playwright end-to-end tests
- Optional Postgres migration path for multi-device sync

---

## Contributing

This is a personal project, but issues and pull requests are welcome. If you're building on top of it, please keep the privacy-first posture — no telemetry, no third-party aggregators, no bank linking without explicit opt-in.

---

## License

MIT © Sreehari Revuri
