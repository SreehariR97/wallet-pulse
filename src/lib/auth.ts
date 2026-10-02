import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { authorizeCredentials, revalidateSessionToken } from "@/lib/auth/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Node-only extension of the edge-safe jwt callback: every server-side
    // auth() call re-checks the users row (one primary-key lookup), so
    // deleted users and revoked sessions stop working immediately.
    // Middleware keeps the DB-free callback from auth.config.ts.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user) return token;
      return revalidateSessionToken(token);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (raw, request) => authorizeCredentials(raw, request.headers),
    }),
  ],
});
