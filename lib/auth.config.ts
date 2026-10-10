import type { NextAuthConfig } from "next-auth";

/**
 * Database-free Auth.js config shared by proxy.ts (route protection) and lib/auth.ts.
 * Sessions are JWTs, so checking a session never needs the database.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
