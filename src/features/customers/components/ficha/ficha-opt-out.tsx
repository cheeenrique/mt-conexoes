'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatLocalDate } from '@/lib/format';
import { toastError, toastSuccess } from '@/lib/toast';
import type { ResumeMessaging } from '../../ficha-types';

/**
 * O opt-out (T5) é global por cliente e o webhook o liga sozinho na
 * palavra-chave — inclusive quando o cliente escreve "PARE de cobrar, já
 * paguei". Até aqui isso não aparecia em lugar nenhum da tela: o cliente saía
 * da régua em silêncio e o operador só descobria pelo cliente reclamando que
 * parou de receber.
 *
 * Some quando não há opt-out: aviso permanente de estado que não existe vira
 * ruído que o operador para de enxergar.
 */
export function FichaOptOut({
  customerId,
  optedOut,
  optedOutAt,
  optedOutReason,
  timezone,
  resumeMessaging,
}: {
  customerId: string;
  optedOut: boolean;
  optedOutAt: string | null;
  optedOutReason: string | null;
  timezone: string;
  /** Ausente = só o aviso, sem o botão (tela que não fiou a ação). */
  resumeMessaging?: ResumeMessaging;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  if (!optedOut) return null;

  async function handleResume() {
    setConfirming(false);
    if (!resumeMessaging) return;
    const result = await resumeMessaging(customerId);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cliente volta a receber cobrança.');
    router.refresh();
  }

  return (
    <section className="rounded border border-warning/40 bg-surface p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.08em] text-warning">
        <BellOff size={14} aria-hidden="true" />
        Não recebe cobrança
      </p>
      <p className="text-sm text-foreground">
        Este cliente pediu para sair{optedOutAt ? ` em ${formatLocalDate(optedOutAt, timezone)}` : ''}. A régua não manda
        mensagem para ele em canal nenhum, mas as cobranças continuam sendo geradas normalmente.
      </p>
      {optedOutReason && <p className="mt-1 text-sm text-foreground-muted">Motivo: {optedOutReason}</p>}
      {resumeMessaging && (
        <Button variant="outline" className="mt-3" onClick={() => setConfirming(true)}>
          Voltar a receber
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Voltar a mandar cobrança para este cliente?"
        description="Só faça isso se ele pediu para voltar. Reativar quem pediu para sair por conta própria é o caminho mais curto para o número do WhatsApp ser banido."
        confirmLabel="Voltar a receber"
        onConfirm={handleResume}
      />
    </section>
  );
}
