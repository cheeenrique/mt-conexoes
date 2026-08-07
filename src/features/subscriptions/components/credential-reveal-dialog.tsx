'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { revealCredentialAction } from '../actions';
import { toastError } from '@/lib/toast';

const AUTO_CLOSE_MS = 30_000;
const COPIED_RESET_MS = 2_000;

export function CredentialRevealDialog({ subscriptionId }: { subscriptionId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const autoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpa a credencial de forma síncrona no próprio handler de mudança, não
  // num useEffect: o base-ui mantém o popup montado durante a animação de
  // saída, então limpar em efeito ([open]) deixaria um frame commitado com
  // open=false e a senha decriptada ainda presente no DOM.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setValue(null);
      setCopied(false);
      if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    }
    setOpen(next);
  }

  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  async function handleReveal() {
    const result = await revealCredentialAction(subscriptionId);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setValue(result.value);
    setOpen(true);
    autoCloseTimeoutRef.current = setTimeout(() => handleOpenChange(false), AUTO_CLOSE_MS);
  }

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toastError({ code: 'CLIPBOARD_ERROR', message: 'Não foi possível copiar. Copie manualmente.' });
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Revelar senha"
        title="Revelar senha"
        onClick={handleReveal}
        className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
      >
        <Eye size={15} />
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[420px] bg-surface">
          <DialogHeader>
            <DialogTitle>Senha de acesso</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3 py-2">
            <span className="flex-1 font-mono text-sm tabular-mono text-foreground">{value}</span>
            <button type="button" aria-label="Copiar" title="Copiar" onClick={handleCopy}>
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-xs text-foreground-muted">Este acesso foi registrado.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
