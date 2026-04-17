export const DEFAULT_CATEGORIES: Array<{
  name: string;
  icon: string;
  color: string;
  type: "expense" | "income" | "loan" | "transfer";
}> = [
  { name: "Salary", icon: "💰", color: "#22C55E", type: "income" },
  { name: "Freelance", icon: "💻", color: "#3B82F6", type: "income" },
  { name: "Investments", icon: "📈", color: "#8B5CF6", type: "income" },
  { name: "Rent/Mortgage", icon: "🏠", color: "#EF4444", type: "expense" },
  { name: "Groceries", icon: "🛒", color: "#F97316", type: "expense" },
  { name: "Dining Out", icon: "🍽️", color: "#EC4899", type: "expense" },
  { name: "Transportation", icon: "🚗", color: "#6366F1", type: "expense" },
  { name: "Utilities", icon: "⚡", color: "#EAB308", type: "expense" },
  { name: "Entertainment", icon: "🎬", color: "#14B8A6", type: "expense" },
  { name: "Healthcare", icon: "🏥", color: "#06B6D4", type: "expense" },
  { name: "Shopping", icon: "🛍️", color: "#D946EF", type: "expense" },
  { name: "Education", icon: "📚", color: "#0EA5E9", type: "expense" },
  { name: "Subscriptions", icon: "📱", color: "#F43F5E", type: "expense" },
  { name: "Travel", icon: "✈️", color: "#10B981", type: "expense" },
  { name: "Personal Care", icon: "💇", color: "#A855F7", type: "expense" },
  { name: "Gifts & Donations", icon: "🎁", color: "#FB923C", type: "expense" },
  { name: "Insurance", icon: "🛡️", color: "#64748B", type: "expense" },
  { name: "Miscellaneous", icon: "📦", color: "#78716C", type: "expense" },
  // Loan-tracking defaults — used for loan_given, loan_taken, repayment_received, repayment_made
  { name: "Friends & Family", icon: "🤝", color: "#A855F7", type: "loan" },
  { name: "Personal Loan", icon: "🏦", color: "#6366F1", type: "loan" },
  // Transfer defaults — used by credit card repayments and international remittances.
  // Names are load-bearing: the backfill script + API helpers look these up by name.
  { name: "Credit Card Payment", icon: "💳", color: "#A78BFA", type: "transfer" },
  { name: "International Transfer", icon: "🌐", color: "#A78BFA", type: "transfer" },
];

export const TRANSFER_CATEGORY_NAMES = {
  creditCardPayment: "Credit Card Payment",
  internationalTransfer: "International Transfer",
} as const;
