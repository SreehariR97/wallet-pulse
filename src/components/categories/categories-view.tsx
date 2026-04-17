"use client";
import * as React from "react";
import { Plus, Pencil, Trash2, Tags, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategories } from "@/stores/categories";
import type { CategoryDTO, CategoryType } from "@/types";

const COMMON_ICONS = ["📦", "🛒", "🏠", "🍽️", "🚗", "⚡", "🎬", "🏥", "🛍️", "📚", "📱", "✈️", "💇", "🎁", "🛡️", "💰", "💻", "📈", "🎓", "🐾", "☕", "🎵", "🤝", "🏦"];
const SWATCHES = ["#6366F1", "#22C55E", "#EF4444", "#F97316", "#EC4899", "#EAB308", "#14B8A6", "#06B6D4", "#D946EF", "#0EA5E9", "#F43F5E", "#10B981", "#A855F7", "#FB923C"];

export function CategoriesView() {
  const { items, loading, loaded, fetch: fetchCategories, upsert, remove } = useCategories();
  const [tab, setTab] = React.useState<CategoryType>("expense");
  const [editing, setEditing] = React.useState<CategoryDTO | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<CategoryDTO | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);

  React.useEffect(() => {
    if (!loaded) fetchCategories();
  }, [loaded, fetchCategories]);

  const expenseCount = items.filter((c) => c.type === "expense").length;
  const incomeCount = items.filter((c) => c.type === "income").length;
  const loanCount = items.filter((c) => c.type === "loan").length;

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: CategoryDTO) {
    setEditing(c);
    setDialogOpen(true);
  }

  async function deleteCategory(c: CategoryDTO) {
    setDeletePending(true);
    const res = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
    setDeletePending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to delete category");
    }
    remove(c.id);
    toast.success("Category deleted");
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organize your spending and income into categories"
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryType)}>
        <TabsList>
          <TabsTrigger value="expense">Expense ({expenseCount})</TabsTrigger>
          <TabsTrigger value="income">Income ({incomeCount})</TabsTrigger>
          <TabsTrigger value="loan">Loans ({loanCount})</TabsTrigger>
        </TabsList>

        {(["expense", "income", "loan"] as const).map((type) => (
          <TabsContent key={type} value={type} className="mt-4">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : items.filter((c) => c.type === type).length === 0 ? (
              <EmptyState
                icon={<Tags className="h-7 w-7" />}
                title="No categories"
                description="Create a category to start organizing transactions."
                action={
                  <Button onClick={openNew}>
                    <Plus className="h-4 w-4" /> New category
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <Card key={c.id} className="group transition-colors hover:border-foreground/30">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-lg"
                          style={{ backgroundColor: c.color + "22", color: c.color }}
                        >
                          {c.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-[540] tracking-[-0.01em]">{c.name}</span>
                            {c.isDefault && (
                              <span className="text-[10px] font-[500] uppercase tracking-[0.08em] text-muted-foreground">
                                default
                              </span>
                            )}
                          </div>
                          {c.budgetLimit != null && (
                            <div className="mt-0.5 text-[12px] font-[460] text-muted-foreground">Budget: {Number(c.budgetLimit).toFixed(2)}</div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="opacity-60 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(c)}>
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={(c) => {
          upsert(c);
          setDialogOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="This will permanently remove this category. If it has transactions, deletion will be blocked."
        confirmLabel={deletePending ? "Deleting…" : "Delete"}
        destructive
        onConfirm={async () => {
          if (confirmDelete) await deleteCategory(confirmDelete);
        }}
      />
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: CategoryDTO | null;
  onSaved: (c: CategoryDTO) => void;
}) {
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("📦");
  const [color, setColor] = React.useState("#6366F1");
  const [type, setType] = React.useState<CategoryType>("expense");
  const [budgetLimit, setBudgetLimit] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setIcon(initial?.icon ?? "📦");
      setColor(initial?.color ?? "#6366F1");
      setType(initial?.type ?? "expense");
      setBudgetLimit(initial?.budgetLimit != null ? String(initial.budgetLimit) : "");
    }
  }, [open, initial]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload = {
      name: name.trim(),
      icon,
      color,
      type,
      budgetLimit: budgetLimit ? Number(budgetLimit) : null,
    };
    const res = await fetch(initial ? `/api/categories/${initial.id}` : "/api/categories", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to save category");
    }
    const { data } = await res.json();
    toast.success(initial ? "Category updated" : "Category created");
    onSaved(data as CategoryDTO);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} placeholder="Groceries" />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CategoryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <div className="grid max-h-32 grid-cols-11 gap-1 overflow-y-auto rounded-lg border border-input bg-muted p-2">
              {COMMON_ICONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors ${icon === e ? "bg-accent ring-1 ring-foreground/30" : "hover:bg-secondary"}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="w-20" />
          </div>
          <div className="grid gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110" : ""}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-28 font-mono text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label>Monthly budget (optional)</Label>
            <Input type="number" step="0.01" min="0" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} placeholder="e.g. 500" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
