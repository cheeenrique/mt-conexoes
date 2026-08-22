'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { activateDunningRuleAction } from '../actions';
import { stepLabel } from '../step-offset';
import type { ReviewMessageDTO } from '../queries';

const BULK_TYPED_CONFIRM_THRESHOLD = 100;

/**
 * A proteção mais importante da tela: o texto **real** de cada mensagem que
 * sairia hoje, já com os dados do cliente, antes de a régua ser ativada.
 *
 * A lista vem consolidada por cliente pelo mesmo `consolidate` que o motor usa —
 * quem tem três cobranças vencidas aparece uma vez, exatamente como vai receber.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  ruleId,
  messages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  messages: ReviewMessageDTO[];
}) {
  const [busy, setBusy] = useState(false);
  const [confirmSendAll, setConfirmSendAll] = useState(false);
  const total = messages.length;

  async function activate(mode: 'send-all' | 'ignore-retroactive') {
    setBusy(true);
    const result = await activateDunningRuleAction(ruleId, mode);
    setBusy(false);
    setConfirmSendAll(false);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(
      mode === 'ignore-retroactive'
        ? 'Régua ativada. Os retroativos foram ignorados.'
        : 'Régua ativada. As execuções em revisão continuam registradas.',
    );
    onOpenChange(false);
  }

  // ⚠️ O handoff chama esta saída de "Enviar todas". O motor não tem esse
  // comportamento: `activateDunningRule('send-all')` só ativa a régua e mantém
  // as execuções `PENDING_REVIEW` gravadas — e, como `UNIQUE(chargeId, stepId)`
  // impede reprocessar o mesmo par, nenhuma dessas mensagens sai. Rotular o
  // botão de "enviar" faria o operador confiar num disparo que não acontece.
  // Ver relatório: o disparo retroativo de verdade ainda não existe.
  const keepReviewDescription = `A régua fica ativa e as ${total} execução(ões) já calculadas continuam registradas para auditoria. Elas não são reenviadas: cada par cobrança/passo executa uma vez só.`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[88vh] w-[760px] max-w-[calc(100%-2rem)] flex-col gap-0 bg-background p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-lg font-extrabold">
            {total} mensagem(ns) sairia(m) hoje se a régua fosse ativada agora
          </DialogTitle>
          <DialogDescription>
            Texto real de cada uma, já com os dados do cliente. Cliente com mais de uma cobrança vencida aparece uma
            vez só.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {total === 0 ? (
            <p className="px-5 py-6 text-sm text-foreground-muted">
              Nenhuma mensagem sairia hoje. A régua pode ser ativada sem disparo retroativo.
            </p>
          ) : (
            messages.map((message) => (
              <div key={message.customerId} className="flex gap-3 border-b border-border px-5 py-3">
                <span className="w-[140px] shrink-0 truncate text-sm font-semibold text-foreground">
                  {message.customerName}
                </span>
                <span className="w-12 shrink-0 font-mono text-[13px] tabular-mono text-foreground-muted">
                  {stepLabel(message.offsetDays)}
                </span>
                <span className="flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground-muted">
                  {message.body}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Da saída mais conservadora para a mais destrutiva. "Ignorar
            retroativos" é o primário porque ativar e disparar cobrança para quem
            já pagou queima o número no primeiro dia. */}
        <div className="flex flex-wrap justify-end gap-2.5 border-t border-border px-5 py-4">
          <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
            Manter em revisão
          </Button>
          <Button variant="outline" size="lg" onClick={() => setConfirmSendAll(true)} disabled={busy}>
            Ativar sem descartar a revisão
          </Button>
          <Button size="lg" onClick={() => activate('ignore-retroactive')} disabled={busy}>
            Ignorar retroativos e ativar
          </Button>
        </div>
        </DialogContent>
      </Dialog>

      {total > BULK_TYPED_CONFIRM_THRESHOLD ? (
        <TypeToConfirmDialog
          open={confirmSendAll}
          onOpenChange={setConfirmSendAll}
          title="Ativar sem descartar a revisão"
          description={`${keepReviewDescription} Digite ${total} para confirmar.`}
          expectedValue={total}
          confirmLabel="Ativar"
          onConfirm={() => activate('send-all')}
        />
      ) : (
        <ConfirmDialog
          open={confirmSendAll}
          onOpenChange={setConfirmSendAll}
          title="Ativar sem descartar a revisão"
          description={keepReviewDescription}
          confirmLabel="Ativar"
          onConfirm={() => activate('send-all')}
        />
      )}
    </>
  );
}
