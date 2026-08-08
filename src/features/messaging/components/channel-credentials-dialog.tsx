'use client';

import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveChannelCredentialsSchema } from '../schema';
import { saveChannelCredentialsAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { CHANNEL_PROVIDER_LABELS } from '@/lib/labels';
import { ChannelRiskBanner } from './channel-risk-banner';
import type { ChannelProvider } from '@prisma/client';

type FormValues = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  baseUrl: string;
  apiKey: string;
  instanceName: string;
};

export function ChannelCredentialsDialog({
  open,
  onOpenChange,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ChannelProvider;
}) {
  const [riskAccepted, setRiskAccepted] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { accessToken: '', phoneNumberId: '', wabaId: '', baseUrl: '', apiKey: '', instanceName: '' },
  });

  async function onSubmit(values: FormValues) {
    const payload =
      provider === 'META_CLOUD'
        ? { provider, credentials: { accessToken: values.accessToken, phoneNumberId: values.phoneNumberId, wabaId: values.wabaId } }
        : provider === 'EVOLUTION'
          ? { provider, credentials: { baseUrl: values.baseUrl, apiKey: values.apiKey, instanceName: values.instanceName }, riskAccepted: true as const }
          : { provider, credentials: { apiKey: values.apiKey } };

    const parsed = saveChannelCredentialsSchema.safeParse(payload);
    if (!parsed.success) {
      toastError({ code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput });
      return;
    }

    const result = await saveChannelCredentialsAction(parsed.data);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.messaging.credentialsSaved);
    reset();
    setRiskAccepted(false);
    onOpenChange(false);
  }

  const canSubmit = provider !== 'EVOLUTION' || riskAccepted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar {CHANNEL_PROVIDER_LABELS[provider]}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {provider === 'EVOLUTION' && <ChannelRiskBanner accepted={riskAccepted} onAcceptedChange={setRiskAccepted} />}

          {provider === 'META_CLOUD' && (
            <>
              <div>
                <Label htmlFor="accessToken">Token de acesso</Label>
                <Input id="accessToken" type="password" {...register('accessToken')} />
              </div>
              <div>
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input id="phoneNumberId" {...register('phoneNumberId')} />
              </div>
              <div>
                <Label htmlFor="wabaId">WABA ID</Label>
                <Input id="wabaId" {...register('wabaId')} />
              </div>
            </>
          )}

          {provider === 'EVOLUTION' && (
            <>
              <div>
                <Label htmlFor="baseUrl">URL do servidor</Label>
                <Input id="baseUrl" {...register('baseUrl')} />
              </div>
              <div>
                <Label htmlFor="apiKey">API key</Label>
                <Input id="apiKey" type="password" {...register('apiKey')} />
              </div>
              <div>
                <Label htmlFor="instanceName">Nome da instância</Label>
                <Input id="instanceName" {...register('instanceName')} />
              </div>
            </>
          )}

          {provider === 'SALVY' && (
            <div>
              <Label htmlFor="apiKey">API key</Label>
              <Input id="apiKey" type="password" {...register('apiKey')} />
            </div>
          )}

          <Button type="submit" disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
