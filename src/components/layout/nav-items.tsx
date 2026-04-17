import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  Target,
  CreditCard,
  Send,
  Tags,
  Settings,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/remittances", label: "Remittances", icon: Send },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
