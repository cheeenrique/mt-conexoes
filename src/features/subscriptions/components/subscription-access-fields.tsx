import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { subscriptionSchema } from '../schema';
import type { z } from 'zod';

type FormValues = z.input<typeof subscriptionSchema>;

export function SubscriptionAccessFields({
  register,
  errors,
  hasAccessPassword,
}: {
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  hasAccessPassword: boolean;
}) {
  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground-muted">Acesso</p>
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="accessUsername">Usuário</Label>
          <Input id="accessUsername" aria-invalid={!!errors.accessUsername} {...register('accessUsername')} className="h-11" />
        </div>
        <div>
          <Label htmlFor="accessPassword">
            Senha {hasAccessPassword && '(deixe em branco para manter a atual)'}
          </Label>
          <Input id="accessPassword" type="password" aria-invalid={!!errors.accessPassword} {...register('accessPassword')} className="h-11" />
        </div>
        <div>
          <Label htmlFor="accessServer">Servidor</Label>
          <Input id="accessServer" aria-invalid={!!errors.accessServer} {...register('accessServer')} className="h-11" />
        </div>
        <div>
          <Label htmlFor="screens">Telas</Label>
          <Input id="screens" type="number" min={1} aria-invalid={!!errors.screens} {...register('screens', { valueAsNumber: true })} className="h-11" />
          {errors.screens && <p className="mt-1 text-sm text-danger">{errors.screens.message}</p>}
        </div>
        <div>
          <Label htmlFor="accessNotes">Observações de acesso</Label>
          <textarea id="accessNotes" {...register('accessNotes')} className="min-h-16 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground" />
        </div>
      </div>
    </div>
  );
}
