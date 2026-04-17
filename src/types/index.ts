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
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
}

export interface TransactionListItem {
  id: string;
  type: TxType;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  date: string | number | Date;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  tags: string | null;
  categoryId: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  createdAt: string | number | Date;
}

export interface TransactionDTO {
  id: string;
  userId: string;
  categoryId: string;
  type: TxType;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  date: string | number | Date;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  tags: string | null;
  receiptUrl: string | null;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
}

export interface BudgetDTO {
  id: string;
  userId: string;
  categoryId: string | null;
  amount: number;
  period: "weekly" | "monthly" | "yearly";
  startDate: string | number | Date;
  endDate: string | number | Date | null;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
}

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
