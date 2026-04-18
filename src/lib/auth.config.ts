import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      currency: string;
    } & import("next-auth").DefaultSession["user"];
  }
  interface User {
    id?: string;
    currency?: string;
  }
}

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? "";
        token.currency = user.currency ?? "USD";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "");
        session.user.currency = String(token.currency ?? "USD");
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;

      // Deny-list approach: every path requires auth unless explicitly listed here.
      // Add new public (unauthenticated) pages to this array; everything else is
      // protected automatically — no need to update an allow-list when adding routes.
      const PUBLIC_PATHS = ["/", "/login", "/register"];
      const isPublic = PUBLIC_PATHS.includes(path);

      if (!isPublic && !isLoggedIn) return false;
      if (isLoggedIn && (path === "/login" || path === "/register")) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
