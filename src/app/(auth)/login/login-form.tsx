'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, LogIn, Mail } from 'lucide-react';
import type { z } from 'zod';
import { loginSchema } from '@/features/auth/schema';
import { loginAction } from '@/features/auth/actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';

type FormValues = z.infer<typeof loginSchema>;
type ActionError = { code: string; message: string };

// O servidor devolve mensagem por código de domínio, mas a tela de login nunca
// pode dizer qual dos dois campos falhou (enumeração de usuário). Os dois casos
// sensíveis viram a cópia genérica do handoff; o resto (ex.: limite de
// tentativas) usa a mensagem do próprio servidor, que já não revela nada.
function toInlineErrorMessage(error: ActionError): string {
  if (error.code === 'VALIDATION') return 'Preencha e-mail e senha para entrar.';
  if (error.code === 'INVALID_CREDENTIALS') return 'E-mail ou senha incorretos.';
  return error.message;
}

export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(loginSchema) });
  const [serverError, setServerError] = useState<string | null>(null);

  // Erro de servidor limpa ao digitar de novo em qualquer campo (handoff).
  // Vai no próprio onChange do register, não em useEffect: reagir a uma
  // interação do usuário é evento, não estado derivado.
  const clearServerError = () => setServerError(null);
  const clientErrorVisible = !serverError && (!!errors.email || !!errors.password);
  const inlineError = serverError ?? (clientErrorVisible ? 'Preencha e-mail e senha para entrar.' : null);

  async function onSubmit(values: FormValues) {
    const result = await loginAction(values);
    if ('error' in result) {
      setServerError(toInlineErrorMessage(result.error));
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3.5">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="E-mail"
          startIcon={<Mail />}
          aria-invalid={!!errors.email}
          aria-describedby={inlineError ? 'login-error' : undefined}
          {...register('email', { onChange: clearServerError })}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Senha"
          startIcon={<Lock />}
          aria-invalid={!!errors.password}
          aria-describedby={inlineError ? 'login-error' : undefined}
          {...register('password', { onChange: clearServerError })}
          className="h-11"
        />
      </div>
      {inlineError && (
        <Alert tone="danger" id="login-error">
          {inlineError}
        </Alert>
      )}
      <Button type="submit" disabled={isSubmitting} className="h-11">
        {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
        {isSubmitting ? 'Acessando...' : 'Acessar'}
      </Button>
    </form>
  );
}
