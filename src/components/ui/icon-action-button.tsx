"use client"

import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const CLASS_NAME =
  'flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted transition-colors hover:text-foreground md:size-8';

const DISABLED_CLASS_NAME =
  'flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted opacity-40 cursor-not-allowed md:size-8';

type IconActionButtonBaseProps = {
  icon: LucideIcon;
  /** Vira `aria-label` e texto do tooltip — todo botão-ícone precisa dos dois. */
  label: string;
};

type IconActionButtonActiveProps = IconActionButtonBaseProps & {
  disabled?: false;
} & (
    | { onClick: () => void; href?: never }
    | { href: string; onClick?: never }
  );

type IconActionButtonDisabledProps = IconActionButtonBaseProps & {
  disabled: true;
  /** Por que a ação não está disponível agora — ex.: "Cobrança já paga". Sem
   *  isso, o tooltip repete `label`, o que é pouco útil num botão que não clica. */
  disabledReason?: string;
  onClick?: never;
  href?: never;
};

type IconActionButtonProps = IconActionButtonActiveProps | IconActionButtonDisabledProps;

/**
 * Ação de linha do padrão de tabela (README §Padrão de tabela): botão-ícone
 * 32×32 no desktop, 44×44 abaixo de 900px, com tooltip com seta. Agrupe mais
 * de um com `<div className="flex items-center justify-end gap-1.5">`.
 *
 * Três variantes: `onClick` para ação no próprio painel (abrir drawer,
 * registrar pagamento), `href` para link externo (ex.: WhatsApp em nova
 * aba), `disabled` quando a ação não está disponível. O caso `disabled` usa
 * `aria-disabled`, nunca o atributo `disabled` nativo — um elemento
 * desabilitado de verdade não dispara hover/focus em vários navegadores, e
 * o tooltip nunca apareceria justamente onde ele mais importa.
 */
export function IconActionButton(props: IconActionButtonProps) {
  const { icon: Icon, label } = props;
  const tooltipText = props.disabled ? (props.disabledReason ?? label) : label;

  let trigger: ReactElement;
  if (props.disabled) {
    trigger = (
      <button type="button" aria-disabled="true" aria-label={tooltipText} className={DISABLED_CLASS_NAME} />
    );
  } else if (props.href) {
    trigger = <a href={props.href} target="_blank" rel="noreferrer" aria-label={label} className={CLASS_NAME} />;
  } else {
    trigger = <button type="button" onClick={props.onClick} aria-label={label} className={CLASS_NAME} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>
        <Icon size={15} />
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
