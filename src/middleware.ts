import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/health'];
const PUBLIC_PREFIXES = ['/api/cron'];

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => matchesPath(pathname, p))) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => matchesPath(pathname, p))) return NextResponse.next();

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
