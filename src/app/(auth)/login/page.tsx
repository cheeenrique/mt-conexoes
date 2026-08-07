import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-[380px] rounded-[10px] border border-border bg-card p-6">
        <h1 className="mb-6 text-xl font-extrabold text-foreground">Entrar no painel</h1>
        <LoginForm />
      </div>
    </div>
  );
}
