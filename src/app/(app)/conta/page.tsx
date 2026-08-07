import { AppShell } from '@/components/layout/app-shell';
import { ChangePasswordForm } from './change-password-form';

export default function ContaPage() {
  return (
    <AppShell title="Conta">
      <ChangePasswordForm />
    </AppShell>
  );
}
