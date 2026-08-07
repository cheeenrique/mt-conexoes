'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@/features/auth/schema';
import { changePasswordAction } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';

type FormValues = { currentPassword: string; newPassword: string };

export function ChangePasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(values: FormValues) {
    const result = await changePasswordAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.auth.passwordChanged);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4 rounded border border-border bg-surface p-5">
      <div>
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input id="currentPassword" type="password" {...register('currentPassword')} className="h-11" />
        {errors.currentPassword && <p className="mt-1 text-sm text-danger">{errors.currentPassword.message}</p>}
      </div>
      <div>
        <Label htmlFor="newPassword">Nova senha</Label>
        <Input id="newPassword" type="password" {...register('newPassword')} className="h-11" />
        {errors.newPassword && <p className="mt-1 text-sm text-danger">{errors.newPassword.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting} className="h-11 bg-brand text-background">
        {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </form>
  );
}
