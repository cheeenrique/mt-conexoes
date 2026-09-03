"use client"

import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Tom que reforça o significado da ação — nunca é o único sinal (o ícone e o
 * tooltip já identificam a ação; ver handoff §"Nada depende só de cor").
 * `success` = mesmo verde do badge "Paga" (dinheiro entrando). `brand` =
 * mesmo laranja do badge "Novo" (ação primária de conversão). `danger` =
 * mesmo vermelho do `Alert` tom `danger` e do `Button` `variant="destructive"`
 * — ação de linha que remove ou apaga. `neutral` é o padrão: ação frequente ou
 * sem carga semântica própria (editar, WhatsApp).
 */
export type IconActionTone = 'neutral' | 'success' | 'brand' | 'danger';

const BASE_CLASS_NAME =
  'flex size-11 items-center justify-center rounded-badge border border-border transition-colors md:size-8';

const TONE_CLASS_NAMES: Record<IconActionTone, string> = {
  neutral: 'text-foreground-muted hover:text-foreground',
  // Hover mantém a cor (nunca vira `text-foreground`, que apagaria o tom) e
  // ganha um fundo levemente tingido como affordance — mesmo recurso do
  // botão destrutivo em `button.tsx` (`bg-destructive/10` → `/20` no hover).
  success: 'text-success hover:bg-success/10',
  brand: 'text-brand-light hover:bg-brand/10',
  danger: 'text-danger hover:bg-danger/10',
};

const DISABLED_CLASS_NAME =
  'flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted opacity-40 cursor-not-allowed md:size-8';

type IconActionButtonBaseProps = {
  icon: LucideIcon;
  /** Vira `aria-label` e texto do tooltip — todo botão-ícone precisa dos dois. */
  label: string;
};

type IconActionButtonActiveProps = IconActionButtonBaseProps & {
  disabled?: false;
  /** Reforço de cor da ação. Omitido = `neutral`. */
  tone?: IconActionTone;
} & (
    | { onClick: () => void; href?: never }
    | { href: string; onClick?: never }
  );

type IconActionButtonDisabledProps = IconActionButtonBaseProps & {
  disabled: true;
  /** Por que a ação não está disponível agora — ex.: "Cobrança já paga". Sem
   *  isso, o tooltip repete `label`, o que é pouco útil num botão que não clica. */
  disabledReason?: string;
  // Sem `tone`: desabilitado sempre sai no cinza neutro do estado disabled,
  // de propósito — um ícone colorido (ex.: verde de "pode") contradiria o
  // estado desabilitado (ex.: "não pode"). Omitir a prop do tipo em vez de
  // ignorá-la em runtime torna o conflito um erro de compilação, não uma
  // decisão de estilo escondida no componente.
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
  } else {
    const className = `${BASE_CLASS_NAME} ${TONE_CLASS_NAMES[props.tone ?? 'neutral']}`;
    trigger = props.href ? (
      <a href={props.href} target="_blank" rel="noreferrer" aria-label={label} className={className} />
    ) : (
      <button type="button" onClick={props.onClick} aria-label={label} className={className} />
    );
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
