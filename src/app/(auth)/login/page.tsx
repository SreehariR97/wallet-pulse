import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-[28px] font-[540] leading-[1.1] tracking-[-0.022em]">Welcome back</CardTitle>
        <CardDescription className="font-[460]">Sign in to your WalletPulse account</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
        <p className="mt-6 text-center text-sm font-[460] text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-[540] text-link underline underline-offset-4 hover:opacity-80">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
