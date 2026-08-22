import { Logo } from '@/components/ui/logo';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-5">
        <Logo variant="stack" />
        <h1 className="text-center text-xl font-extrabold tracking-tight text-foreground">Entrar no painel</h1>
        <div className="w-full rounded-lg border border-border bg-surface p-5">
          <LoginForm />
        </div>
        <p className="text-center text-sm text-foreground-muted">
          Esqueceu a senha? Redefinição é feita no servidor, com o dono do sistema.
        </p>
      </div>
    </div>
  );
}
