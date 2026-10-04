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
    sessionVersion?: number;
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
        token.sv = user.sessionVersion ?? 0;
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
      // The "already signed in → skip /login" redirect lives in the (auth)
      // layout, not here: middleware can't see the DB, so it would treat a
      // revoked session as signed in while the protected layout (which does
      // check) sends it back to /login — an infinite redirect loop.
      return true;
    },
  },
} satisfies NextAuthConfig;
