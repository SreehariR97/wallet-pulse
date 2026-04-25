"use client";
import * as React from "react";
import { Plus, Pencil, Trash2, Target, Loader2, MoreHorizontal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/charts/chart-container";
import { useCategories } from "@/stores/categories";
import { cn, formatCurrency, formatCurrencyAuto } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface BudgetRow {
  id: string;
  amount: number;
  spent: number;
  period: "weekly" | "monthly" | "yearly";
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  periodFrom: string;
  periodTo: string;
}

const OVERALL_VALUE = "__overall__";

function barColor(pct: number) {
  if (pct >= 100) return "bg-destructive";
  if (pct >= 80) return "bg-warning";
  if (pct >= 50) return "bg-accent";
  return "bg-success";
}

function colorHex(pct: number) {
  if (pct >= 100) return "hsl(0 55% 55%)";
  if (pct >= 80) return "hsl(35 65% 52%)";
  if (pct >= 50) return "hsl(258 80% 72%)";
  return "hsl(150 35% 48%)";
}

export function BudgetsView({ currency }: { currency: string }) {
  const { items: categories, fetch: fetchCats, loaded } = useCategories();
  const [rows, setRows] = React.useState<BudgetRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<BudgetRow | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<BudgetRow | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/budgets");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
    if (!loaded) fetchCats();
  }, [load, loaded, fetchCats]);

  async function onDelete(b: BudgetRow) {
    const res = await fetch(`/api/budgets/${b.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed to delete budget");
    toast.success("Budget deleted");
    load();
  }

  const overBudget = rows.filter((r) => r.amount > 0 && r.spent > r.amount);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Set limits, track progress, build discipline"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New budget
          </Button>
        }
      />

      {overBudget.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div className="flex-1 text-[13px] font-[460] leading-[1.45]">
            <span className="font-[600] text-destructive">Over budget</span> —{" "}
            {overBudget.length === 1
              ? `"${overBudget[0].categoryName ?? "Overall"}" exceeded its limit`
              : `${overBudget.length} budgets have been exceeded this period`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Target className="h-7 w-7" />}
          title="No budgets yet"
          description="Create your first budget to start tracking spending limits."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New budget
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((b) => {
              const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
              const clamped = Math.min(100, pct);
              const remaining = Math.max(0, b.amount - b.spent);
              const color = barColor(pct);
              return (
                <Card key={b.id} className={cn("relative overflow-hidden", pct >= 100 && "border-destructive/50")}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-xl"
                          style={{
                            backgroundColor: (b.categoryColor ?? "#6366F1") + "22",
                            color: b.categoryColor ?? "#6366F1",
                          }}
                        >
                          {b.categoryIcon ?? "🎯"}
                        </div>
                        <div>
                          <div className="font-[540] tracking-[-0.01em]">{b.categoryName ?? "Overall"}</div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {b.period}
                            </Badge>
                            {pct >= 100 && (
                              <Badge className="bg-destructive/15 text-destructive text-[10px]">over</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(b);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(b)}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="min-w-0 truncate font-heading text-[26px] font-[540] leading-[1] tracking-[-0.02em] tabular-nums"
                          title={formatCurrency(b.spent, currency)}
                        >
                          {formatCurrencyAuto(b.spent, currency)}
                        </span>
                        <span
                          className="shrink-0 whitespace-nowrap text-[13px] font-[460] text-muted-foreground"
                          title={formatCurrency(b.amount, currency)}
                        >
                          of {formatCurrencyAuto(b.amount, currency)}
                        </span>
                      </div>
                      <Progress value={clamped} className="mt-3" indicatorClassName={cn(color, pct >= 100 && "animate-pulse")} />
                      <div className="mt-2 flex justify-between gap-2 text-[11px] font-[500] text-muted-foreground">
                        <span className="tabular-nums">{pct.toFixed(0)}% used</span>
                        <span
                          className="truncate tabular-nums"
                          title={
                            pct >= 100
                              ? `${formatCurrency(b.spent - b.amount, currency)} over`
                              : `${formatCurrency(remaining, currency)} left`
                          }
                        >
                          {pct >= 100
                            ? `${formatCurrencyAuto(b.spent - b.amount, currency)} over`
                            : `${formatCurrencyAuto(remaining, currency)} left`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 text-[11px] font-[460] text-muted-foreground">
                      {format(parseISO(b.periodFrom), "MMM d")} – {format(parseISO(b.periodTo), "MMM d")}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <ChartCard title="Budget vs actual" description="Where you stand this period">
            <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 44)}>
              <BarChart
                data={rows.map((r) => ({
                  name: r.categoryName ?? "Overall",
                  budget: r.amount,
                  spent: r.spent,
                  pct: r.amount > 0 ? (r.spent / r.amount) * 100 : 0,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(v, currency)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
                  width={120}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.75rem",
                    fontSize: 12,
                  }}
                  formatter={(v: number, n: string) => [formatCurrency(v, currency), n === "budget" ? "Budget" : "Spent"]}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="budget" fill="hsl(27 11% 78%)" radius={[0, 6, 6, 0]} />
                <Bar dataKey="spent" fill="hsl(258 80% 72%)" radius={[0, 6, 6, 0]}>
                  {rows.map((r, i) => {
                    const pct = r.amount > 0 ? (r.spent / r.amount) * 100 : 0;
                    return <Cell key={i} fill={colorHex(pct)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}

      <BudgetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        categories={categories}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete budget?"
        description="This will remove the budget. Your transactions are unaffected."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await onDelete(confirmDelete);
        }}
      />
    </div>
  );
}

function BudgetDialog({
  open,
  onOpenChange,
  initial,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: BudgetRow | null;
  categories: Array<{ id: string; name: string; icon: string; type: "expense" | "income" | "loan" | "transfer" }>;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = React.useState<string>(OVERALL_VALUE);
  const [amount, setAmount] = React.useState<string>("");
  const [period, setPeriod] = React.useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCategoryId(initial?.categoryId ?? OVERALL_VALUE);
      setAmount(initial ? String(initial.amount) : "");
      setPeriod(initial?.period ?? "monthly");
      setStartDate(initial ? format(parseISO(initial.periodFrom), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, initial]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload = {
      categoryId: categoryId === OVERALL_VALUE ? null : categoryId,
      amount: Number(amount),
      period,
      startDate,
    };
    const res = await fetch(initial ? `/api/budgets/${initial.id}` : "/api/budgets", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to save budget");
    }
    toast.success(initial ? "Budget updated" : "Budget created");
    onOpenChange(false);
    onSaved();
  }

  const expenseCategories = categories.filter((c) => c.type === "expense");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit budget" : "New budget"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Scope</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERALL_VALUE}>🎯 Overall (all expenses)</SelectItem>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500"
                  className="pl-7"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Start date</Label>
            <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !amount}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save" : "Create budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
