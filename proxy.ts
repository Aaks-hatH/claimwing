import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Redirects signed-out visitors away from /app. API routes check the session
 * themselves (and return 401 JSON), so they are not matched here.
 */
export const proxy = auth((req) => {
  if (!req.auth?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*"],
};
