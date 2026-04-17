import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-[28px] font-[540] leading-[1.1] tracking-[-0.022em]">Get started</CardTitle>
        <CardDescription className="font-[460]">Create your WalletPulse account in seconds</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="mt-6 text-center text-sm font-[460] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-[540] text-link underline underline-offset-4 hover:opacity-80">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
