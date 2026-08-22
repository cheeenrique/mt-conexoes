'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { changePasswordSchema } from '@/features/auth/schema';
import { changePasswordAction } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';

type FormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(values: FormValues) {
    const result = await changePasswordAction(values);
    if ('error' in result) {
      if (result.error.code === 'CURRENT_PASSWORD_INVALID') {
        setError('currentPassword', { message: result.error.message });
        return;
      }
      if (result.error.code === 'UNAUTHORIZED') {
        toastError(result.error);
        router.push('/login');
        return;
      }
      toastError(result.error);
      return;
    }
    toastSuccess(messages.auth.passwordChanged);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4 rounded border border-border bg-surface p-5">
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Senha atual</Label>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          {...register('currentPassword')}
          className="h-11"
        />
        {errors.currentPassword && <p className="mt-1 text-sm text-danger">{errors.currentPassword.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">Nova senha</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          {...register('newPassword')}
          className="h-11"
        />
        {errors.newPassword && <p className="mt-1 text-sm text-danger">{errors.newPassword.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting} className="h-11">
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
        {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </form>
  );
}
