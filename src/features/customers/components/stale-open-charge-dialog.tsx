'use client';

import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCents } from '@/lib/format';
import { toastError, toastSuccess } from '@/lib/toast';
import type { RealignCharge, StaleOpenChargeDTO } from '../ficha-types';

/**
 * "Trocou o plano — e a cobrança em aberto?"
 *
 * `Charge.principalCents` é congelado na emissão e nada o reescreve quando o
 * plano muda (CLAUDE.md §Dinheiro). Para reajuste isso é o certo; para troca
 * de plano era um buraco: a assinatura passava a R$ 35,00 e a cobrança seguia
 * cobrando R$ 90,00 na lista, no diálogo de pagamento e no WhatsApp — o valor
 * do corpo da mensagem é congelado na avaliação da régua.
 *
 * Por isso a pergunta, e não o efeito automático: só o operador sabe se o
 * preço novo vale desta cobrança ou só do próximo ciclo. Recusar é resposta
 * legítima, e o rótulo do botão diz isso.
 *
 * Recebe `realignCharge` por prop porque `features/customers` não importa de
 * `features/charges` — quem cruza as duas é `app/`
 * (`.claude/rules/01-arquitetura.md` §Matriz de import).
 */
export function StaleOpenChargeDialog({
  stale,
  customerId,
  realignCharge,
  onClose,
}: {
  stale: StaleOpenChargeDTO | null;
  customerId: string;
  realignCharge: RealignCharge;
  onClose: () => void;
}) {
  const router = useRouter();

  async function handleConfirm() {
    if (!stale) return;
    onClose();
    const result = await realignCharge(stale.chargeId, customerId);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cobrança atualizada com o valor do plano.');
    router.refresh();
  }

  return (
    <ConfirmDialog
      open={!!stale}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Atualizar a cobrança em aberto?"
      description={
        stale
          ? `A cobrança em aberto ainda é de ${formatCents(stale.fromCents)}, do plano anterior. Atualizar passa ela para ${formatCents(stale.toCents)} — é esse valor que aparece em Cobranças, no registro de pagamento e na mensagem do WhatsApp. Deixe como está se o preço novo vale só do próximo ciclo.`
          : ''
      }
      confirmLabel="Atualizar cobrança"
      cancelLabel="Deixar como está"
      onConfirm={handleConfirm}
    />
  );
}
