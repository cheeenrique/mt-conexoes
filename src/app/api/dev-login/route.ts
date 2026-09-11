import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signSession, setSessionCookie } from '@/lib/auth';
import { isDevAutoLoginEnabled } from '@/lib/dev-login';

/**
 * Emite uma sessão real para o usuário mais antigo do painel (há um só). Ver
 * `lib/dev-login.ts` para as travas — sem elas, 404.
 */
export async function GET() {
  if (!isDevAutoLoginEnabled()) return new NextResponse(null, { status: 404 });

  const user = await db.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, sessionVersion: true } });
  if (!user) return NextResponse.json({ error: 'Nenhum usuário no banco — rode pnpm db:seed.' }, { status: 409 });

  await setSessionCookie(await signSession({ userId: user.id, sessionVersion: user.sessionVersion }));
  return NextResponse.redirect(new URL('/', process.env.APP_URL ?? 'http://localhost:3000'));
}
