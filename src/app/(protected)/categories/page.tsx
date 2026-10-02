import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CategoriesView } from "@/components/categories/categories-view";

export const metadata: Metadata = { title: "Categories" };

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const session = await auth();
  return <CategoriesView currency={session?.user?.currency ?? "USD"} />;
}
