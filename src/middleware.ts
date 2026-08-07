import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

const PUBLIC_PATHS = ['/login'];

export async function middleware(req: NextRequest) {
  if (PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/cron')) return NextResponse.next();

  const token = req.cookies.get('mtconexoes_session')?.value;
  const payload = token ? await verifySession(token) : null;

  if (!payload) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
