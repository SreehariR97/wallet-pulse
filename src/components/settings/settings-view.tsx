"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Loader2, Download, Upload, Moon, Sun, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ImportDialog } from "./import-dialog";
import { CURRENCIES } from "@/lib/utils";

interface Profile {
  id: string;
  name: string;
  email: string;
  currency: string;
  monthlyBudget: number | null;
}

export function SettingsView({ initial }: { initial: Profile }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = React.useState(false);
  React.useEffect(() => setThemeReady(true), []);

  const [name, setName] = React.useState(initial.name);
  const [email, setEmail] = React.useState(initial.email);
  const [currency, setCurrency] = React.useState(initial.currency);
  const [monthlyBudget, setMonthlyBudget] = React.useState<string>(initial.monthlyBudget != null ? String(initial.monthlyBudget) : "");
  const [savingProfile, setSavingProfile] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [savingPassword, setSavingPassword] = React.useState(false);

  const [importOpen, setImportOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    const res = await fetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        currency,
        monthlyBudget: monthlyBudget ? Number(monthlyBudget) : null,
      }),
    });
    setSavingProfile(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to update profile");
    }
    toast.success("Profile updated. Sign in again to see currency change everywhere.");
    router.refresh();
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    const res = await fetch("/api/user/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPassword(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to change password");
    }
    toast.success("Password changed");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function deleteAccount() {
    const res = await fetch("/api/user/profile", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete account");
      return;
    }
    toast.success("Account deleted");
    await signOut({ callbackUrl: "/" });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account, preferences, and data" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px] font-[540] tracking-[-0.015em]">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
              </div>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.code} · {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Monthly budget (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="99999999999.99"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    placeholder="e.g. 3000"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[17px] font-[540] tracking-[-0.015em]">Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Current password</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>New password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={savingPassword || !currentPassword || !newPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[17px] font-[540] tracking-[-0.015em]">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>Theme</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={themeReady && theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="h-auto flex-col gap-1.5 py-4"
              >
                <Sun className="h-5 w-5" />
                Light
              </Button>
              <Button
                type="button"
                variant={themeReady && theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="h-auto flex-col gap-1.5 py-4"
              >
                <Moon className="h-5 w-5" />
                Dark
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[17px] font-[540] tracking-[-0.015em]">Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[13px] font-[460] leading-[1.5] text-muted-foreground">Export your data anytime or import transactions from a CSV file.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => (window.location.href = "/api/export?format=csv")}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button variant="outline" onClick={() => (window.location.href = "/api/export?format=json")}>
                <Download className="h-4 w-4" /> Export JSON
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import from CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/40 bg-destructive/[0.04]">
        <CardHeader>
          <CardTitle className="text-[17px] font-[540] tracking-[-0.015em] text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <div className="font-[540] tracking-[-0.005em]">Delete account</div>
              <p className="mt-0.5 text-[13px] font-[460] leading-[1.5] text-muted-foreground">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account?"
        description="All your transactions, categories, budgets, and profile will be permanently deleted. There is no recovery."
        confirmLabel="Permanently delete"
        destructive
        onConfirm={deleteAccount}
      />
    </div>
  );
}
