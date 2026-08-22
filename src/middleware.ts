import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/auth';

// `/api/leads` é a captação do site público: outro domínio, outra conta de
// hospedagem, nenhuma sessão. Sem a exceção aqui o formulário recebe 307 para
// /login e o lead nunca chega. O handler valida tamanho de corpo, Zod estrito,
// rate limit por IP e Turnstile antes de qualquer escrita.
const PUBLIC_PATHS = ['/login', '/api/health', '/api/leads'];
// Webhooks inbound (meta-cloud, evolution) precisam ficar públicos — o
// provider chama sem cookie de sessão. Cada handler valida a assinatura da
// requisição antes de qualquer efeito (ver features/messaging/channels/*),
// então liberar aqui não abre a porta pra escrita não autenticada.
const PUBLIC_PREFIXES = ['/api/cron', '/api/webhooks'];

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => matchesPath(pathname, p))) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => matchesPath(pathname, p))) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifySession(token) : null;

  if (!payload) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Ícones e `brand/` ficam de fora porque a tela de login é pública e pede esses
// arquivos — sem a exceção, o visitante deslogado recebe 307 para /login no
// lugar da imagem e a marca não aparece justamente onde ela é obrigatória.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/).*)'],
};
