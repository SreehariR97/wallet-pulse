import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-2xl">Get started</CardTitle>
        <CardDescription>Create your WalletPulse account in seconds</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
