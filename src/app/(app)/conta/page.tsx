// KeyRound fora da lista fechada do handoff (README §Ícones): a tela não tem
// item de menu para copiar (é a conta do operador, só troca de senha) e
// nenhum ícone da lista representa isso sem colidir com `users` (Clientes)
// ou `settings` (Ajustes). Mesmo precedente de `RefreshCw` nos error.tsx.
import { KeyRound } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { ChangePasswordForm } from '@/features/auth/components/change-password-form';

/**
 * A conta também abre em gaveta pela barra lateral (`AccountDrawer`). Esta rota
 * continua existindo porque é o link direto — e porque a gaveta some se o
 * JavaScript falhar, enquanto a rota não.
 */
export default function ContaPage() {
  return (
    <AppShell title="Conta" icon={<KeyRound size={22} />}>
      <ChangePasswordForm />
    </AppShell>
  );
}
