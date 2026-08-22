'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toastError } from '@/lib/toast';
import { CredentialBox, type CredentialField } from './credential-box';
import type { RevealAccessPassword } from '../../ficha-types';

const AUTO_HIDE_SECONDS = 30;
const COPIED_RESET_MS = 2_000;

/**
 * ⚠️ Usuário e senha ficam mascarados por padrão e são revelados juntos pelo
 * mesmo olho (handoff 04 §Acesso). A senha **não vem no payload da ficha**:
 * cada revelação chama a ação dedicada, que grava `CredentialReveal` antes de
 * devolver o valor. Passados 30 segundos o valor some do estado do cliente
 * sozinho, e a contagem fica visível para o operador não ser pego de surpresa.
 */
export function FichaAccess({
  subscriptionId,
  accessUsername,
  hasAccessPassword,
  revealPassword,
}: {
  subscriptionId: string;
  accessUsername: string | null;
  hasAccessPassword: boolean;
  revealPassword: RevealAccessPassword;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState<CredentialField | null>(null);
  const [revealing, setRevealing] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealed = password !== null;

  // Conta a partir de um prazo fixo, não somando ticks: aba em segundo plano
  // afina o `setInterval` e a senha ficaria visível mais que os 30 segundos.
  useEffect(() => {
    if (password === null) return;
    const deadline = Date.now() + AUTO_HIDE_SECONDS * 1_000;
    const interval = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1_000);
      if (left <= 0) {
        setPassword(null);
        setCopied(null);
        setSecondsLeft(0);
        return;
      }
      setSecondsLeft(left);
    }, 250);
    return () => clearInterval(interval);
  }, [password]);

  useEffect(() => () => { if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current); }, []);

  function hide() {
    setPassword(null);
    setSecondsLeft(0);
    setCopied(null);
  }

  async function reveal() {
    setRevealing(true);
    const result = await revealPassword(subscriptionId);
    setRevealing(false);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setPassword(result.value);
    setSecondsLeft(AUTO_HIDE_SECONDS);
  }

  async function copy(field: CredentialField, value: string | null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(null), COPIED_RESET_MS);
    } catch {
      toastError({ code: 'CLIPBOARD_ERROR', message: 'Não foi possível copiar. Copie manualmente.' });
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">
          Acesso do assinante
        </span>
        <button
          type="button"
          onClick={revealed ? hide : reveal}
          disabled={!hasAccessPassword || revealing}
          aria-label={revealed ? 'Esconder acesso' : 'Revelar acesso'}
          title={revealed ? 'Esconder acesso' : 'Revelar acesso'}
          className="flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted disabled:text-foreground-disabled md:size-8"
        >
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <CredentialBox
        label="Usuário"
        value={accessUsername}
        revealed={revealed}
        copied={copied === 'username'}
        onCopy={() => copy('username', accessUsername)}
      />
      <CredentialBox
        label="Senha"
        value={password}
        revealed={revealed}
        copied={copied === 'password'}
        onCopy={() => copy('password', password)}
      />

      {revealed ? (
        <p className="text-xs text-foreground-muted" aria-live="polite">
          Este acesso foi registrado. Esconde sozinho em{' '}
          <span className="font-mono tabular-mono">{secondsLeft}s</span>.
        </p>
      ) : (
        <p className="text-xs text-foreground-muted">
          {hasAccessPassword
            ? 'Revelar registra quem viu, quando e de qual cliente.'
            : 'Nenhuma senha guardada para esta assinatura.'}
        </p>
      )}
    </section>
  );
}
