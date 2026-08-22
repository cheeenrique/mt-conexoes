'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Loader2, QrCode } from 'lucide-react';
import type { ChannelProvider } from '@prisma/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toastError } from '@/lib/toast';
import { refreshChannelPairingAction } from '../actions';
import type { PairingChallengeDTO } from '../pairing.service';

/**
 * O QR do WhatsApp expira em menos de um minuto, então a mesma chamada que pergunta
 * "já conectou?" também traz um QR novo. 45s é a folga que o painel concorrente usa.
 */
const POLL_INTERVAL_MS = 45_000;

/**
 * Enquanto não há QR na tela, a Evolution ainda está montando o dele (medido: alguns
 * segundos depois de criar a instância). Esperar 45s para mostrar o primeiro código seria
 * deixar o operador olhando para um quadrado vazio.
 */
const WARMUP_INTERVAL_MS = 5_000;

/**
 * ⚠️ O desafio vive só aqui: chega por prop, fica em estado enquanto o diálogo está aberto e
 * some ao fechar. Não é gravado no banco nem em log — mesma disciplina da revelação da senha
 * do assinante.
 */
export function ChannelPairingDialog({
  provider,
  channelLabel,
  challenge,
  onOpenChange,
}: {
  provider: ChannelProvider;
  channelLabel: string;
  challenge: PairingChallengeDTO;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(challenge);
  const connected = current.state === 'CONNECTED';

  useEffect(() => {
    if (connected) {
      router.refresh();
      return;
    }
    const timer = setInterval(async () => {
      const result = await refreshChannelPairingAction(provider);
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      setCurrent(result);
    }, current.qrBase64 ? POLL_INTERVAL_MS : WARMUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, current.qrBase64, provider, router]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{connected ? `${channelLabel} conectado` : `Conectar ${channelLabel}`}</DialogTitle>
        </DialogHeader>

        {connected ? (
          <Alert tone="success" icon={CircleCheck}>
            <p className="text-[13px]">
              Aparelho pareado. O número remetente aparece na lista assim que o WhatsApp informa qual é.
            </p>
          </Alert>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {current.qrBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URI efêmero, não é asset
              <img
                src={current.qrBase64}
                alt="QR Code para parear o WhatsApp"
                className="size-64 rounded-sm bg-white p-2"
              />
            ) : (
              <div className="flex size-64 items-center justify-center rounded-sm border border-border text-foreground-muted">
                <QrCode aria-hidden="true" />
              </div>
            )}

            <p className="text-center text-[13px] text-foreground-muted">
              No celular: WhatsApp › Aparelhos conectados › Conectar aparelho.
            </p>

            {current.pairingCode && (
              <div className="w-full rounded-sm border border-border bg-surface-elevated p-3 text-center">
                <p className="text-[11px] text-foreground-muted">Sem a câmera à mão? Use este código:</p>
                <p className="mt-1 font-mono text-lg font-bold tracking-[.2em] tabular-nums text-foreground">
                  {current.pairingCode}
                </p>
                <p className="mt-1 text-[11px] text-foreground-muted">
                  Em Conectar aparelho › Conectar com número de telefone.
                </p>
              </div>
            )}

            <p className="flex items-center gap-2 text-[11px] text-foreground-muted">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {current.qrBase64
                ? 'Aguardando a leitura. O código é renovado sozinho a cada 45 segundos.'
                : 'Preparando o código no seu servidor. Isso leva alguns segundos.'}
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant={connected ? 'default' : 'secondary'} onClick={() => onOpenChange(false)}>
            {connected ? 'Concluir' : 'Fechar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
