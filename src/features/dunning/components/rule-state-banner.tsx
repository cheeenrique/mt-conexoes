'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/lib/toast';
import { setDunningRuleStatusAction } from '../actions';
import { ReviewDialog } from './review-dialog';
import type { ReviewMessageDTO } from '../queries';

/**
 * Faixa de estado, logo abaixo do cabeçalho. Uma variante por estado — `ACTIVE`
 * não tem faixa, porque uma régua rodando normalmente não precisa de aviso.
 *
 * ⚠️ "Pausar régua" e "pausar envios" são coisas diferentes e a microcópia da
 * faixa de pausada existe para separar as duas. O kill switch da barra lateral
 * para **todo** envio, de qualquer origem; pausar a régua só desliga os passos
 * dela. Confundir as duas faz o operador achar que parou tudo quando parou uma
 * coisa só.
 */
export function RuleStateBanner({
  rule,
  reviewMessages,
}: {
  rule: { id: string; status: string };
  reviewMessages: ReviewMessageDTO[];
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendToReview() {
    setBusy(true);
    const result = await setDunningRuleStatusAction(rule.id, { status: 'REVIEW' });
    setBusy(false);
    if ('error' in result) toastError(result.error);
    else toastSuccess('Régua enviada para revisão.');
  }

  if (rule.status === 'DRAFT') {
    return (
      <Alert tone="neutral">
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold text-foreground">Rascunho: o motor nem avalia esta régua.</span>
          <p className="max-w-[70ch] leading-relaxed text-foreground-muted">
            Ajuste os passos e mande para revisão. Ela só fica ativa depois de você ver a lista real de quem
            receberia.
          </p>
          <Button size="lg" className="self-start" onClick={sendToReview} disabled={busy}>
            Enviar para revisão
          </Button>
        </div>
      </Alert>
    );
  }

  if (rule.status === 'REVIEW') {
    return (
      <>
        <Alert tone="warning">
          <div className="flex flex-col gap-2.5">
            <span className="font-semibold text-foreground">
              {reviewMessages.length} mensagem(ns) sairia(m) hoje se esta régua fosse ativada agora.
            </span>
            <p className="max-w-[70ch] leading-relaxed text-foreground-muted">
              Em revisão, a régua calcula tudo e não cria mensagem nenhuma. Ativar sem ver a lista real é o erro mais
              caro do sistema.
            </p>
            <Button size="lg" className="self-start" onClick={() => setReviewOpen(true)}>
              Ver lista e ativar
            </Button>
          </div>
        </Alert>
        <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} ruleId={rule.id} messages={reviewMessages} />
      </>
    );
  }

  if (rule.status === 'PAUSED') {
    return (
      <Alert tone="info">
        <div className="flex flex-col gap-2.5">
          <span className="font-semibold text-foreground">Pausada: nada sai por esta régua.</span>
          <p className="max-w-[70ch] leading-relaxed text-foreground-muted">
            Pausar a régua é diferente de pausar os envios do sistema: o botão da barra lateral para tudo, de
            qualquer origem. Este aqui só afeta os passos desta régua.
          </p>
        </div>
      </Alert>
    );
  }

  return null;
}
