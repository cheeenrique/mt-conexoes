'use client';

import { useForm } from 'react-hook-form';
import { Check, Loader2 } from 'lucide-react';
import type { ChannelProvider } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { messages } from '@/lib/messages';
import { toastError, toastSuccess } from '@/lib/toast';
import { saveAndTestChannelAction } from '../actions';
import { saveChannelCredentialsSchema } from '../schema';
import type { ChannelConnectionMethod } from '../channels/types';
import { ChannelFieldList } from './channel-field-list';

/**
 * Caminho `CREDENTIALS`: o operador cola valores que já tem, o painel testa no provider e
 * só grava se a credencial responder.
 */
export function ChannelCredentialsForm({
  provider,
  method,
  accepted,
  blocked,
  onDone,
}: {
  provider: ChannelProvider;
  method: ChannelConnectionMethod;
  accepted: boolean;
  blocked: boolean;
  onDone: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(method.credentialFields.map((field) => [field.name, ''])),
  });

  async function onSubmit(values: Record<string, string>) {
    // Mesmo schema Zod da Server Action: validação duplicada à mão é divergência garantida.
    const parsed = saveChannelCredentialsSchema.safeParse({ provider, credentials: values, riskAccepted: accepted });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[issue.path.length - 1];
        if (typeof field === 'string' && field in values) setError(field, { message: issue.message });
      }
      toastError({ code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput });
      return;
    }

    const result = await saveAndTestChannelAction(parsed.data);
    if ('error' in result) return toastError(result.error);
    if (!result.ok) {
      return toastError({ code: 'CHANNEL_TEST_FAILED', message: result.reason || messages.messaging.testFailed });
    }
    toastSuccess(messages.messaging.credentialsSaved);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <ChannelFieldList
        fields={method.credentialFields}
        idPrefix={`${provider}-${method.id}`}
        register={register}
        errors={errors}
      />
      <div className="mt-1">
        <Button type="submit" disabled={isSubmitting || blocked}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          {isSubmitting ? 'Testando...' : 'Salvar e testar conexão'}
        </Button>
      </div>
      <p className="text-[11px] text-foreground-muted">
        O teste confere a credencial direto no provedor e só grava se ela responder. Nenhuma mensagem é enviada.
      </p>
    </form>
  );
}
