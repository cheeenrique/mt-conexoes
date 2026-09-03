'use client';

import { useForm } from 'react-hook-form';
import { Loader2, RefreshCw } from 'lucide-react';
import type { ChannelProvider } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { messages } from '@/lib/messages';
import { toastError } from '@/lib/toast';
import { changeChannelNumberAction } from '../actions';
import { changeChannelNumberSchema } from '../schema';
import type { ChannelCredentialField } from '../channels/types';
import type { PairingChallengeDTO } from '../pairing.service';
import { ChannelFieldList } from './channel-field-list';

/**
 * Um campo só: endereço e chave já estão salvos e não voltam pra tela (`CLAUDE.md`
 * §Segurança) — pedir de novo só pra trocar de chip seria travar o operador leigo num
 * formulário técnico que ele nunca preencheu sozinho da primeira vez. `field` vem do
 * próprio descritor (mesmo label/placeholder/ajuda do pareamento inicial), não duplicado
 * aqui à mão.
 */
export function ChannelChangeNumberDialog({
  open,
  onOpenChange,
  provider,
  field,
  onChallenge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ChannelProvider;
  field: ChannelCredentialField;
  onChallenge: (challenge: PairingChallengeDTO) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({ defaultValues: { [field.name]: '' } });

  async function onSubmit(values: Record<string, string>) {
    const parsed = changeChannelNumberSchema.safeParse({ provider, ...values });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[issue.path.length - 1];
        if (typeof key === 'string' && key in values) setError(key, { message: issue.message });
      }
      toastError({ code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput });
      return;
    }

    const result = await changeChannelNumberAction(parsed.data);
    if ('error' in result) return toastError(result.error);
    reset();
    onOpenChange(false);
    onChallenge(result);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar número</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-foreground-muted">
          Endereço e chave continuam os mesmos — só o número muda. A sessão atual é
          desconectada e um código novo aparece na hora.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <ChannelFieldList fields={[field]} idPrefix={`${provider}-change-number`} register={register} errors={errors} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
              {isSubmitting ? 'Trocando...' : 'Gerar novo código'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
