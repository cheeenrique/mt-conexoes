'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import type { ChannelCredentialField } from '../channels/types';

/**
 * Os campos de um caminho de conexão, do jeito que o descritor declarou: placeholder com
 * formato real de exemplo e uma linha dizendo onde achar o valor.
 *
 * ⚠️ Nasce vazio, sempre. Credencial de canal não volta do servidor, nem mascarada —
 * reconfigurar é digitar de novo.
 */
export function ChannelFieldList({
  fields,
  idPrefix,
  register,
  errors,
}: {
  fields: ChannelCredentialField[];
  idPrefix: string;
  register: UseFormRegister<Record<string, string>>;
  errors: FieldErrors<Record<string, string>>;
}) {
  return (
    <>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.name}`;
        const Field = field.secret ? PasswordInput : Input;
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id}>{field.label}</Label>
            <Field
              id={id}
              // O navegador oferece a senha salva do painel dentro do campo de credencial do
              // canal — visto acontecendo: o e-mail do login entrou em "Endereço da instância".
              // Credencial de canal não é credencial de login e não deve ser lembrada.
              autoComplete={field.secret ? 'new-password' : 'off'}
              placeholder={field.placeholder}
              className={field.mono ? 'font-mono tabular-nums' : undefined}
              aria-invalid={!!errors[field.name]}
              aria-describedby={`${id}-help`}
              {...register(field.name)}
            />
            <p id={`${id}-help`} className="text-[11px] text-foreground-muted">
              {field.help}
            </p>
            {errors[field.name] && <p className="text-[13px] text-danger">{errors[field.name]?.message}</p>}
          </div>
        );
      })}
    </>
  );
}
