import { notFound } from "next/navigation";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionForm } from "@/components/transactions/transaction-form";

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, params.id), eq(transactions.userId, session.user.id)))
    .limit(1);
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit transaction" description="Update this transaction's details" />
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
              date: format(row.date, "yyyy-MM-dd"),
              paymentMethod: row.paymentMethod,
              creditCardId: row.creditCardId ?? "",
              isRecurring: row.isRecurring,
              recurringFrequency: (row.recurringFrequency ?? "") as any,
              tags: row.tags ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
