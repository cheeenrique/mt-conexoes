'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, QrCode, RefreshCw, Unplug } from 'lucide-react';
import type { ChannelProvider } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { messages } from '@/lib/messages';
import { toastError, toastSuccess } from '@/lib/toast';
import { beginChannelPairingAction, unpairChannelAction } from '../actions';
import { beginChannelPairingSchema } from '../schema';
import type { ChannelConnectionMethod } from '../channels/types';
import type { PairingChallengeDTO } from '../pairing.service';
import { ChannelFieldList } from './channel-field-list';
import { ChannelPairingDialog } from './channel-pairing-dialog';
import { ChannelChangeNumberDialog } from './channel-change-number-dialog';

/**
 * Caminho `PAIRING`: o painel provisiona no servidor do operador e devolve o QR. Nome de
 * instância e token de webhook não aparecem aqui de propósito — são gerados pelo painel.
 */
export function ChannelPairingForm({
  provider,
  channelLabel,
  method,
  accepted,
  blocked,
  connected,
}: {
  provider: ChannelProvider;
  channelLabel: string;
  method: ChannelConnectionMethod;
  accepted: boolean;
  blocked: boolean;
  connected: boolean;
}) {
  const [challenge, setChallenge] = useState<PairingChallengeDTO | null>(null);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [changingNumber, setChangingNumber] = useState(false);
  // Mesmo campo do pareamento inicial (label, placeholder, ajuda) — a troca de número
  // não inventa um texto novo pro operador, é a mesma pergunta de novo.
  const pairingNumberField = method.credentialFields.find((field) => field.name === 'pairingNumber');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(method.credentialFields.map((field) => [field.name, ''])),
  });

  async function onSubmit(values: Record<string, string>) {
    const parsed = beginChannelPairingSchema.safeParse({
      provider,
      methodId: method.id,
      credentials: values,
      riskAccepted: accepted,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[issue.path.length - 1];
        if (typeof field === 'string' && field in values) setError(field, { message: issue.message });
      }
      toastError({ code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput });
      return;
    }

    const result = await beginChannelPairingAction(parsed.data);
    if ('error' in result) return toastError(result.error);
    setChallenge(result);
  }

  async function handleUnpair() {
    const result = await unpairChannelAction(provider);
    setConfirmUnpair(false);
    if ('error' in result) return toastError(result.error);
    toastSuccess(messages.messaging.unpaired);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <ChannelFieldList
        fields={method.credentialFields}
        idPrefix={`${provider}-${method.id}`}
        register={register}
        errors={errors}
      />
      <div className="mt-1 flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || blocked}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <QrCode aria-hidden="true" />}
          {isSubmitting ? 'Criando a instância...' : 'Gerar QR Code'}
        </Button>
        {connected && pairingNumberField && (
          <Button type="button" variant="secondary" onClick={() => setChangingNumber(true)}>
            <RefreshCw aria-hidden="true" />
            Trocar número
          </Button>
        )}
        {connected && (
          <Button type="button" variant="secondary" onClick={() => setConfirmUnpair(true)}>
            <Unplug aria-hidden="true" />
            Desconectar aparelho
          </Button>
        )}
      </div>
      <p className="text-[11px] text-foreground-muted">
        A chave de API fica criptografada no banco e nunca volta para esta tela. O QR aparece na hora e some ao
        fechar — não é guardado em lugar nenhum.
      </p>

      {challenge && (
        <ChannelPairingDialog
          provider={provider}
          channelLabel={channelLabel}
          challenge={challenge}
          onOpenChange={(open) => !open && setChallenge(null)}
        />
      )}
      <ConfirmDialog
        open={confirmUnpair}
        onOpenChange={setConfirmUnpair}
        title="Desconectar o aparelho?"
        description="O canal para de enviar até você ler o QR Code de novo. Nada do que já foi enviado é apagado."
        confirmLabel="Desconectar"
        onConfirm={handleUnpair}
      />
      {pairingNumberField && (
        <ChannelChangeNumberDialog
          open={changingNumber}
          onOpenChange={setChangingNumber}
          provider={provider}
          field={pairingNumberField}
          onChallenge={setChallenge}
        />
      )}
    </form>
  );
}
