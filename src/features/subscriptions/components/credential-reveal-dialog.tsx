'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { revealCredentialAction } from '../actions';
import { toastError } from '@/lib/toast';

const AUTO_CLOSE_MS = 30_000;

export function CredentialRevealDialog({ subscriptionId }: { subscriptionId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue(null);
      setCopied(false);
      return;
    }
    const timer = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  async function handleReveal() {
    const result = await revealCredentialAction(subscriptionId);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setValue(result.value);
    setOpen(true);
  }

  async function handleCopy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      <Dialog open={open} onOpenChange={setOpen}>
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
