import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic dashboard guard (Next.js 16 Proxy). Without the API's `dgc_session` cookie a visitor
 * is sent to the login page with `?from=` so they return after signing in. The cookie's presence
 * proves nothing: every request is still authorized by the API, and `RequireAuth` handles expired
 * sessions client-side. The cookie is only visible here when the frontend and API share a cookie
 * host (`COOKIE_DOMAIN` on the API, or `localhost` in development). Deployments where it isn't can
 * set `AUTH_PROXY_GUARD=off` and rely on the client guard alone.
 */
export function proxy(req: NextRequest) {
  if (process.env.AUTH_PROXY_GUARD === 'off' || req.cookies.has('dgc_session')) return NextResponse.next();
  const login = new URL('/login', req.url);
  login.searchParams.set('from', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/dashboard/:path*', '/services/:path*', '/deployments/:path*', '/servers/:path*', '/billing/:path*', '/support/:path*', '/settings/:path*', '/admin/:path*'],
};
