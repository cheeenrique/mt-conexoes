'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { sendManualMessagesAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';

const BATCH_CONFIRM_THRESHOLD = 100;

export function SendMessageDialog({
  open,
  onOpenChange,
  recipients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: { id: string; name: string }[];
}) {
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  async function send() {
    setIsSending(true);
    const result = await sendManualMessagesAction({ customerIds: recipients.map((r) => r.id), body });
    setIsSending(false);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(`Enviado: ${result.summary.sent} · Falhou: ${result.summary.failed} · Opt-out: ${result.summary.skippedOptedOut} · Sem telefone: ${result.summary.skippedNoPhone}`);
    setBody('');
    setConfirmOpen(false);
    onOpenChange(false);
  }

  function handleConfirmClick() {
    if (recipients.length > BATCH_CONFIRM_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    send();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem — {recipients.length} destinatário(s)</DialogTitle>
          </DialogHeader>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Olá {{cliente.primeiro_nome}}!"
            className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-sm"
          />
          <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-foreground-muted">
            {recipients.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
          <Button disabled={isSending || !body.trim()} onClick={handleConfirmClick}>
            {recipients.length > BATCH_CONFIRM_THRESHOLD ? 'Continuar' : 'Enviar'}
          </Button>
        </DialogContent>
      </Dialog>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar envio em lote"
        description={`Você está prestes a enviar ${recipients.length} mensagens. Digite o número pra confirmar.`}
        expectedValue={recipients.length}
        confirmLabel="Enviar"
        onConfirm={send}
      />
    </>
  );
}
