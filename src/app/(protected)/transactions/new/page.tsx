import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionForm } from "@/components/transactions/transaction-form";

export default async function NewTransactionPage() {
  const session = await auth();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New transaction" description="Log an expense, income, or transfer" />
      <Card>
        <CardContent className="pt-6">
          <TransactionForm mode="create" currency={session?.user?.currency ?? "USD"} />
        </CardContent>
      </Card>
    </div>
  );
}
