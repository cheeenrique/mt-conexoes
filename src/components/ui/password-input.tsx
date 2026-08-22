'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from './input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'endSlot'>;

/**
 * Campo de senha com alternância de visibilidade. Mono por padrão: no estado
 * mascarado é o que deixa visível quantos caracteres foram digitados.
 *
 * A alternância vale só para o que o operador está digitando agora. Revelar
 * segredo já armazenado é outra operação — auditada em `credential_reveals`.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      className={cn('font-mono', className)}
      endSlot={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}
