import { NextResponse, NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/admin",
  "/battle",
  "/profile",
  "/settings",
  "/lobby",
  "/leaderboard",
  "/history",
  "/results",
  "/create",
];

const AUTH_PREFIXES = ["/login", "/register"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const hasAccessToken =
    req.cookies.has("codearena_access_token") ||
    req.cookies.has("refreshToken") ||
    req.cookies.has("codearena_session");
  const hasGuestToken = req.cookies.has("codearena_guest_token");
  const isAuthenticated = hasAccessToken || hasGuestToken;

  const isAuthRoute = AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.[\\w]+$|_next/image|_next/static|favicon.ico).*)",
  ],
};
