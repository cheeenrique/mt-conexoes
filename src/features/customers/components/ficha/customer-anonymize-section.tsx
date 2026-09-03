'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import type { AnonymizeCustomer } from '../../ficha-types';

/**
 * Seção destrutiva no fim da ficha (handoff — design em
 * `docs/superpowers/specs/2026-08-25-anonimizacao-lgpd-design.md`). Confirmação
 * por digitação do **nome**, não "Tem certeza?": o diálogo já nomeia o que é
 * destruído (nome, telefone, e-mail, senha de acesso) e o que fica
 * (cobrança, pagamento — o relatório do mês não muda).
 *
 * Já anonimizado: sem botão nenhum, só o fato registrado — a ficha virou
 * leitura no resto da tela (nome/telefone/e-mail já vieram nulos do servidor).
 */
export function CustomerAnonymizeSection({
  customerId,
  customerName,
  anonymized,
  onAnonymize,
}: {
  customerId: string;
  customerName: string;
  anonymized: boolean;
  onAnonymize?: AnonymizeCustomer;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (anonymized) {
    return (
      <Alert tone="neutral" icon={ShieldOff}>
        Cliente anonimizado a pedido do titular (LGPD). Nome, telefone, e-mail e credencial de
        acesso foram apagados — cobrança e pagamento continuam intactos no relatório.
      </Alert>
    );
  }

  if (!onAnonymize) return null;

  async function handleConfirm() {
    if (!onAnonymize) return;
    setBusy(true);
    const result = await onAnonymize(customerId);
    setBusy(false);
    setConfirmOpen(false);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cliente anonimizado.');
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-danger/40 bg-danger/[.04] p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.08em] text-danger">Zona de risco</p>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground-muted">
          Direito de eliminação (LGPD): apaga nome, telefone, e-mail, observações e a credencial
          de acesso do assinante. Cobrança e pagamento continuam na base — o relatório do mês não
          muda. Irreversível. Exige o cliente sem assinatura ativa nem cobrança em aberto.
        </p>
      </div>
      <div>
        <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={busy}>
          <Trash2 aria-hidden="true" />
          Excluir cliente
        </Button>
      </div>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Anonimizar "${customerName}"?`}
        description={`Digite o nome exatamente como aparece na ficha — "${customerName}" — para confirmar. Nome, telefone, e-mail, observações e credencial de acesso somem para sempre; cobrança e pagamento ficam.`}
        expectedValue={customerName}
        confirmLabel="Anonimizar"
        onConfirm={handleConfirm}
      />
    </section>
  );
}
