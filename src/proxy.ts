import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  // Behind a reverse proxy (NPM), the direct request URL is http://
  // but the real client connection is HTTPS. Check X-Forwarded-Proto
  // to determine the correct cookie name (__Secure- prefix for HTTPS).
  const isSecure = request.headers.get("x-forwarded-proto") === "https";

  const token = await getToken({
    req: request,
    secret,
    secureCookie: isSecure,
  });

  // Token must have a valid sub (user ID) - an empty/invalidated token
  // (e.g. after DB wipe with stale cookie) should not count as authenticated
  const isAuthenticated = token && token.sub;

  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register");

  // Redirect authenticated users away from auth pages
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/library", request.url));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isAuthPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/library/:path*",
    "/upload/:path*",
    "/reader/:path*",
    "/profile/:path*",
    "/shelves/:path*",
    "/admin/:path*",
    "/book/:path*",
    "/user/:path*",
    "/topics/:path*",
    "/activity/:path*",
    "/discover/:path*",
    "/stats/:path*",
    "/login",
    "/register",
  ],
};
