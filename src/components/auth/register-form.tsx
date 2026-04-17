"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.details) setErrors(json.details);
      else toast.error(json.error ?? "Registration failed");
      setPending(false);
      return;
    }
    const signInRes = await signIn("credentials", { email: body.email, password: body.password, redirect: false });
    setPending(false);
    if (signInRes?.error) {
      toast.error("Account created, but sign-in failed. Try logging in.");
      router.push("/login");
      return;
    }
    toast.success("Account created! Setting up your dashboard…");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Alex Doe" />
        {errors.name && <p className="text-xs font-[500] text-destructive">{errors.name[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        {errors.email && <p className="text-xs font-[500] text-destructive">{errors.email[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required placeholder="At least 6 characters" />
        {errors.password && <p className="text-xs font-[500] text-destructive">{errors.password[0]}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
