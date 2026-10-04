import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { reconciledConflicts } from "@/lib/reconcile-lock";
import { formatCivilDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, params.id), eq(transactions.userId, session.user.id)))
    .limit(1);
  if (!row) notFound();
  const locked = (await reconciledConflicts(session.user.id, [row])).map((s) =>
    s.replace(/\d{4}-\d{2}-\d{2}/g, (d) => formatCivilDate(d, "MMM d, yyyy")),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit transaction" description="Update this transaction's details" />
      {locked.length > 0 && (
        <p className="-mt-3 mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-[13px] leading-[1.45] text-muted-foreground">
          <span className="font-[600] text-foreground">Reconciled:</span> this is part of {locked.join(" and ")}.
          You can fix the description, category, notes or tags freely; changing the amount, date or account will ask
          you to confirm.
        </p>
      )}
      <Card>
        <CardContent className="pt-6">
          <TransactionForm
            mode="edit"
            transactionId={row.id}
            currency={session.user.currency ?? "USD"}
            showSaveAndAddAnother={false}
            initial={{
              type: row.type,
              amount: String(row.amount),
              categoryId: row.categoryId,
              description: row.description,
              notes: row.notes ?? "",
              date: row.date,
              paymentMethod: row.paymentMethod,
              creditCardId: row.creditCardId ?? "",
              accountId: row.accountId ?? "",
              transferAccountId: row.transferAccountId ?? "",
              isRecurring: row.isRecurring,
              recurringFrequency: row.recurringFrequency ?? "",
              tags: row.tags ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
