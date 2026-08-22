import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { SendingPausedProvider } from '@/features/settings/components/sending-paused-provider';
import { UnauthorizedError } from '@/lib/errors';

// O middleware (edge, sem acesso a banco) só confere assinatura e expiração
// do JWT — não dá pra checar `sessionVersion` lá porque isso exige ler o
// User no Postgres. Esta camada, com acesso a banco, é quem fecha o buraco:
// token assinado e não expirado, mas emitido antes de uma troca de senha,
// não pode continuar renderizando `(app)/**`.
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/login');
    throw err;
  }

  // Kill switch (T8): valor real do banco, buscado uma vez por navegação
  // aqui — a sidebar e a faixa de pausa vivem dentro de `<AppShell>`, que
  // cada `page.tsx` renderiza por conta própria, sem passar essa prop.
  const settings = await getSettings();

  return <SendingPausedProvider initialPaused={settings.sendingPaused}>{children}</SendingPausedProvider>;
}
