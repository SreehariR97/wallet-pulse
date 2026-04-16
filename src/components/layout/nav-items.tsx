import { LayoutDashboard, Receipt, BarChart3, Target, Tags, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
