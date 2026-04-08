import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // API route to switch locale
  if (pathname === '/api/set-locale') {
    const locale = request.nextUrl.searchParams.get('locale') || 'es';
    const referer = request.headers.get('referer') || '/';
    const response = NextResponse.redirect(new URL(referer, request.url));
    response.cookies.set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};