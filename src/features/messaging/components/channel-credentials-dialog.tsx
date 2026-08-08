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
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { accessToken: '', phoneNumberId: '', wabaId: '', baseUrl: '', apiKey: '', instanceName: '' },
  });

  const FIELD_NAMES: (keyof FormValues)[] = ['accessToken', 'phoneNumberId', 'wabaId', 'baseUrl', 'apiKey', 'instanceName'];

  async function onSubmit(values: FormValues) {
    const payload =
      provider === 'META_CLOUD'
        ? { provider, credentials: { accessToken: values.accessToken, phoneNumberId: values.phoneNumberId, wabaId: values.wabaId } }
        : provider === 'EVOLUTION'
          ? { provider, credentials: { baseUrl: values.baseUrl, apiKey: values.apiKey, instanceName: values.instanceName }, riskAccepted }
          : { provider, credentials: { apiKey: values.apiKey } };

    const parsed = saveChannelCredentialsSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[issue.path.length - 1];
        if (typeof field === 'string' && FIELD_NAMES.includes(field as keyof FormValues)) {
          setError(field as keyof FormValues, { message: issue.message });
        }
      }
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
                <Input id="accessToken" type="password" aria-invalid={!!errors.accessToken} {...register('accessToken')} />
                {errors.accessToken && <p className="mt-1 text-sm text-danger">{errors.accessToken.message}</p>}
              </div>
              <div>
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input id="phoneNumberId" aria-invalid={!!errors.phoneNumberId} {...register('phoneNumberId')} />
                {errors.phoneNumberId && <p className="mt-1 text-sm text-danger">{errors.phoneNumberId.message}</p>}
              </div>
              <div>
                <Label htmlFor="wabaId">WABA ID</Label>
                <Input id="wabaId" aria-invalid={!!errors.wabaId} {...register('wabaId')} />
                {errors.wabaId && <p className="mt-1 text-sm text-danger">{errors.wabaId.message}</p>}
              </div>
            </>
          )}

          {provider === 'EVOLUTION' && (
            <>
              <div>
                <Label htmlFor="baseUrl">URL do servidor</Label>
                <Input id="baseUrl" aria-invalid={!!errors.baseUrl} {...register('baseUrl')} />
                {errors.baseUrl && <p className="mt-1 text-sm text-danger">{errors.baseUrl.message}</p>}
              </div>
              <div>
                <Label htmlFor="apiKey">API key</Label>
                <Input id="apiKey" type="password" aria-invalid={!!errors.apiKey} {...register('apiKey')} />
                {errors.apiKey && <p className="mt-1 text-sm text-danger">{errors.apiKey.message}</p>}
              </div>
              <div>
                <Label htmlFor="instanceName">Nome da instância</Label>
                <Input id="instanceName" aria-invalid={!!errors.instanceName} {...register('instanceName')} />
                {errors.instanceName && <p className="mt-1 text-sm text-danger">{errors.instanceName.message}</p>}
              </div>
            </>
          )}

          {provider === 'SALVY' && (
            <div>
              <Label htmlFor="apiKey">API key</Label>
              <Input id="apiKey" type="password" aria-invalid={!!errors.apiKey} {...register('apiKey')} />
              {errors.apiKey && <p className="mt-1 text-sm text-danger">{errors.apiKey.message}</p>}
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
