/**
 * DTO conventions
 * ----------------
 * - Civil dates (transaction.date, budget.startDate/endDate): `string` in
 *   YYYY-MM-DD format. See migration 0003 and formatCivilDate().
 * - Audit timestamps (createdAt, updatedAt): `string` in ISO 8601 format
 *   post-JSON-serialization.
 * - Money fields: `number` (coerced from Drizzle's numeric-as-string at the
 *   route boundary). See migration 0002.
 * - Never `string | number | Date` unions. Narrow at the DTO; coerce at
 *   the boundary.
 */

// ── Enums ────────────────────────────────────────────────────────────

export type TxType =
  | "expense"
  | "income"
  | "transfer"
  | "loan_given"
  | "loan_taken"
  | "repayment_received"
  | "repayment_made";
export type CategoryType = "expense" | "income" | "loan" | "transfer";
export type PaymentMethod = "cash" | "credit_card" | "debit_card" | "bank_transfer" | "upi" | "other";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RemittanceService = "wise" | "remitly" | "western_union" | "bank_wire" | "other";
export type BudgetPeriod = "weekly" | "monthly" | "yearly";

// ── Envelopes ────────────────────────────────────────────────────────

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiEnvelope<T> {
  data?: T;
  meta?: ListMeta;
  error?: string;
  details?: unknown;
}

// ── Category ─────────────────────────────────────────────────────────

export interface CategoryDTO {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  budgetLimit: number | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Transactions ─────────────────────────────────────────────────────

/** List-projection shape: tx row + joined category/card denormalized fields. */
export interface TransactionListItem {
  id: string;
  type: TxType;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  date: string;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  tags: string | null;
  categoryId: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  // Card-tag fields — optional because the cycle endpoint selects them but
  // the dashboard recent list doesn't. Undefined = card wasn't queried.
  creditCardId?: string | null;
  creditCardName?: string | null;
  creditCardLast4?: string | null;
  createdAt: string;
}

/** Detail / write-response shape: full transactions row with amount coerced. */
export interface TransactionDTO {
  id: string;
  userId: string;
  categoryId: string;
  type: TxType;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  date: string;
  paymentMethod: PaymentMethod;
  creditCardId: string | null;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  tags: string | null;
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Budgets ──────────────────────────────────────────────────────────

/** Write-response shape: full budgets row. */
export interface BudgetDTO {
  id: string;
  userId: string;
  categoryId: string | null;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** List-projection shape: budget row + computed spent + category denorms. */
export interface BudgetListItemDTO {
  id: string;
  categoryId: string | null;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  spent: number;
  periodFrom: string;
  periodTo: string;
}

// ── Credit cards ─────────────────────────────────────────────────────

/** Write-response shape: full credit_cards row with creditLimit coerced. */
export interface CreditCardDTO {
  id: string;
  userId: string;
  name: string;
  issuer: string;
  last4: string | null;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  minimumPaymentPercent: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** List endpoint adds per-card computed fields. `cycleSpend` is distinct
 *  from the detail endpoint's `totalExpense`/`totalPayments` split. */
export interface CreditCardListItemDTO extends CreditCardDTO {
  balance: number;
  utilizationPercent: number;
  currentCycleStart: string;
  currentCycleEnd: string;
  cycleSpend: number;
  nextDueDate: string;
  minPaymentEstimate: number;
}

/** Detail endpoint exposes the expense/payment split separately from balance. */
export interface CreditCardDetailDTO extends CreditCardDTO {
  balance: number;
  utilizationPercent: number;
  totalExpense: number;
  totalPayments: number;
  currentCycleStart: string;
  currentCycleEnd: string;
  nextDueDate: string;
  minPaymentEstimate: number;
}

/** GET /:id/cycle — composite of card summary + window + aggregates + tx list. */
export interface CreditCardCycleDTO {
  card: {
    id: string;
    name: string;
    issuer: string;
    last4: string | null;
    creditLimit: number;
    statementDay: number;
    paymentDueDay: number;
  };
  offset: number;
  start: string;
  end: string;
  totalExpense: number;
  totalPayments: number;
  count: number;
  categoryBreakdown: Array<{
    categoryId: string;
    name: string;
    icon: string;
    color: string;
    total: number;
    count: number;
  }>;
  transactions: TransactionListItem[];
}

// ── Remittances ──────────────────────────────────────────────────────

/** Joined shape: remittance columns + transaction-side display fields.
 *  Used by list, detail, POST, and PATCH responses. */
export interface RemittanceDTO {
  id: string;
  transactionId: string;
  fromCurrency: string;
  toCurrency: string;
  fxRate: number;
  fee: number;
  service: RemittanceService;
  recipientNote: string | null;
  createdAt: string;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  date: string;
  paymentMethod: PaymentMethod;
}

/** Detail/PATCH response includes tx-side recurrence + tags + owning userId
 *  that the list projection intentionally omits. */
export interface RemittanceDetailDTO extends RemittanceDTO {
  userId: string;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  tags: string | null;
}

export interface RemittanceStatsRowDTO {
  service: RemittanceService;
  count: number;
  totalSent: number;
  totalFees: number;
  avgFxRate: number;
  totalDelivered: number;
}

// ── Analytics ────────────────────────────────────────────────────────

export interface AnalyticsSummaryDTO {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  count: number;
  from: string;
  to: string;
}

export interface AnalyticsTrendPointDTO {
  bucket: string;
  income: number;
  expense: number;
  net: number;
}

export interface AnalyticsPaymentMethodDTO {
  paymentMethod: PaymentMethod;
  total: number;
  count: number;
}

export interface AnalyticsCategoryBreakdownDTO {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
}

// ── Export ───────────────────────────────────────────────────────────

/** Export /?format=json projection. Transactions are flattened (no card joins)
 *  and include the display-friendly `category` name directly. */
export interface TransactionExportRowDTO {
  id: string;
  date: string;
  type: TxType;
  category: string | null;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  tags: string | null;
}

export interface ExportJsonDTO {
  exportedAt: string;
  transactions: TransactionExportRowDTO[];
  categories: CategoryDTO[];
  budgets: BudgetDTO[];
}

// ── User ─────────────────────────────────────────────────────────────

export interface UserProfileDTO {
  id: string;
  name: string;
  email: string;
  currency: string;
  monthlyBudget: number | null;
}

// ── Terminal DTOs (small, reused) ────────────────────────────────────

export interface DeletedIdDTO {
  id: string;
}
export interface ArchivedIdDTO {
  id: string;
  archived: true;
}
export interface HardDeletedIdDTO {
  id: string;
  deleted: true;
}
export interface BulkDeletedDTO {
  deleted: number;
}
export interface PasswordUpdatedDTO {
  updated: true;
}
