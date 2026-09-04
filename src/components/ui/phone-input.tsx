'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { IMaskInput } from 'react-imask';

function toE164(digits: string): string {
  return digits ? `+55${digits}` : '';
}

function fromE164(e164: string): string {
  return e164.replace(/^\+55/, '');
}

/**
 * Mesma checagem de `core/phone.nationalDigitsBR`, duplicada aqui de
 * propósito: `components/ui/` não importa `core/` (`.claude/rules/01-arquitetura.md`
 * §Matriz de import — "components/ui não conhece o domínio"). Só decide se o
 * valor já guardado é um WhatsApp brasileiro, pra abrir o campo no modo certo.
 */
function looksBrazilian(e164: string): boolean {
  if (!e164) return true; // campo vazio começa no modo padrão (Brasil)
  const digits = e164.replace(/\D/g, '');
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
}

const FIELD_CLASS =
  'h-11 w-full rounded-sm border border-border bg-surface-elevated py-2 pl-3 pr-10 font-mono tabular-mono text-foreground disabled:cursor-not-allowed disabled:opacity-50';

/**
 * WhatsApp do cliente, em E.164. Padrão é o Brasil, com máscara de DDD —
 * cobre a imensa maioria dos cadastros. O globo (mesmo padrão do "mostrar
 * senha" de `PasswordInput`: botão dentro da borda do campo) troca pra um
 * campo livre, sem máscara — o operador digita o número completo com o
 * código do país, porque uma máscara única não serve pra tamanho/formato que
 * varia por país.
 */
export function PhoneInput({
  value,
  onValueChange,
  onBlur,
  id,
  disabled,
}: {
  value: string; // E.164, ex.: +5511999998888
  onValueChange: (e164: string) => void;
  /** Repassado ao `<input>` interno — usado para checar duplicidade ao sair do campo. */
  onBlur?: () => void;
  id?: string;
  disabled?: boolean;
}) {
  const [international, setInternational] = useState(() => !looksBrazilian(value));

  return (
    <div className="relative w-full">
      {international ? (
        <input
          id={id}
          type="tel"
          inputMode="tel"
          placeholder="+1 305 555 1234"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            // Mantém só dígitos e reconstitui o "+" na frente — sem máscara
            // de formato porque o tamanho varia por país.
            const digits = event.target.value.replace(/[^\d]/g, '');
            onValueChange(digits ? `+${digits}` : '');
          }}
          onBlur={onBlur}
          className={FIELD_CLASS}
        />
      ) : (
        <IMaskInput
          id={id}
          mask="(00) 00000-0000"
          value={fromE164(value)}
          unmask={true}
          disabled={disabled}
          onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
            onValueChange(toE164(instance.unmaskedValue));
          }}
          onBlur={onBlur}
          className={FIELD_CLASS}
        />
      )}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={international}
        aria-label={international ? 'Usar formato brasileiro' : 'Cliente de outro país'}
        title={international ? 'Usar formato brasileiro' : 'Cliente de outro país'}
        onClick={() => {
          onValueChange('');
          setInternational((current) => !current);
        }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-sm text-foreground-muted transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-brand/10 aria-pressed:text-brand-light"
      >
        <Globe size={16} aria-hidden />
      </button>
    </div>
  );
}
