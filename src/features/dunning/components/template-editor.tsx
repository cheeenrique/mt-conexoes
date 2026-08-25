'use client';

import { useRef } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { TEMPLATE_VARIABLES, TEMPLATE_VARIABLE_EXAMPLES } from '@/core/dunning-template';

/**
 * Editor do texto do passo: `textarea` de 9 linhas e os chips de variável.
 *
 * O chip insere **na posição do cursor**, não no fim: quem escreve o texto
 * monta a frase e coloca a variável no meio dela. Inserir no fim obrigaria a
 * recortar e colar a cada variável.
 *
 * ⚠️ A senha de acesso do assinante não está em `TEMPLATE_VARIABLES` e não pode
 * entrar — ver CLAUDE.md §Segurança.
 */
export function TemplateEditor({
  value,
  registration,
  onValueChange,
  error,
}: {
  value: string;
  registration: UseFormRegisterReturn;
  onValueChange: (next: string) => void;
  error?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { ref: registerRef, ...field } = registration;

  function insert(variable: string) {
    const element = textareaRef.current;
    const token = `{{${variable}}}`;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;

    onValueChange(`${value.slice(0, start)}${token}${value.slice(end)}`);

    // O valor só chega ao DOM depois do render do React; o caret precisa ser
    // reposicionado quando ele já estiver lá.
    requestAnimationFrame(() => {
      const caret = start + token.length;
      element?.focus();
      element?.setSelectionRange(caret, caret);
    });
  }

  return (
    <>
      <textarea
        id="templateBody"
        // O rótulo "Texto da mensagem" é o cabeçalho da DrawerSection, um span
        // sem `htmlFor` — quem usa leitor de tela chegava neste campo sem nome.
        aria-label="Texto da mensagem"
        rows={9}
        {...field}
        ref={(element) => {
          registerRef(element);
          textareaRef.current = element;
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'templateBody-error' : undefined}
        className="resize-y rounded-badge border border-border bg-surface-elevated p-3 text-sm leading-relaxed text-foreground"
      />
      {error && (
        <p id="templateBody-error" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-foreground-muted">Variáveis disponíveis. Clique para inserir no texto:</span>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => insert(variable)}
              title={`Vira ${TEMPLATE_VARIABLE_EXAMPLES[variable]}`}
              className="inline-flex min-h-8 items-center gap-2 rounded-badge border border-border bg-surface-elevated px-2.5 text-xs text-foreground"
            >
              <span className="font-mono">{`{{${variable}}}`}</span>
              <span className="text-foreground-muted">{TEMPLATE_VARIABLE_EXAMPLES[variable]}</span>
            </button>
          ))}
        </div>
        <span className="text-xs leading-snug text-foreground-muted">
          Variável desconhecida impede salvar: nunca sai vazia no envio. A senha de acesso do assinante não existe
          como variável e não pode entrar em template.
        </span>
      </div>
    </>
  );
}
