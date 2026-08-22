'use client';

import { Check, Copy } from 'lucide-react';

const MASK = '••••••••';

export type CredentialField = 'username' | 'password';

/** Caixa de 44px com o valor mascarado, do handoff 04 §Acesso do assinante. */
export function CredentialBox({
  label,
  value,
  revealed,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null;
  revealed: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const shown = revealed && value !== null;
  return (
    <div className="flex h-11 items-center gap-2 rounded-badge border border-border bg-surface-elevated px-3">
      <span className="w-16 shrink-0 text-xs text-foreground-muted">{label}</span>
      <span
        className={`flex-1 truncate font-mono text-sm tabular-mono text-foreground ${shown ? '' : 'tracking-[.2em]'}`}
      >
        {shown ? value : MASK}
      </span>
      <button
        type="button"
        onClick={onCopy}
        disabled={!shown}
        aria-label={`Copiar ${label.toLowerCase()}`}
        title={`Copiar ${label.toLowerCase()}`}
        className="text-foreground-muted disabled:text-foreground-disabled"
      >
        {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
      </button>
    </div>
  );
}
