"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recharts is the heaviest client dependency. Every chart here renders
 * only after its data arrives from the API, so server-rendering it buys
 * nothing — load it on demand instead of in each page's first-load JS.
 * Import chart *types* from the chart modules directly; they're erased.
 */
const loading = () => <Skeleton className="h-64 w-full" />;

export const TrendChart = dynamic(() => import("./trend-chart").then((m) => m.TrendChart), { ssr: false, loading });
export const CategoryDonut = dynamic(() => import("./category-donut").then((m) => m.CategoryDonut), {
  ssr: false,
  loading,
});
export const CategoryBar = dynamic(() => import("./category-bar").then((m) => m.CategoryBar), { ssr: false, loading });
export const IncomeExpenseBars = dynamic(() => import("./income-expense-bars").then((m) => m.IncomeExpenseBars), {
  ssr: false,
  loading,
});
export const PaymentDonut = dynamic(() => import("./payment-donut").then((m) => m.PaymentDonut), {
  ssr: false,
  loading,
});
