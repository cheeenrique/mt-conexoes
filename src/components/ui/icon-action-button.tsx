import type { LucideIcon } from 'lucide-react';

const CLASS_NAME =
  'flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted transition-colors hover:text-foreground md:size-8';

type IconActionButtonProps = {
  icon: LucideIcon;
  /** Vira `title` e `aria-label` — todo botão-ícone precisa dos dois. */
  label: string;
};

/**
 * Ação de linha do padrão de tabela (README §Padrão de tabela): botão-ícone
 * 32×32 no desktop, 44×44 abaixo de 900px. Agrupe mais de um com
 * `<div className="flex items-center justify-end gap-1.5">`.
 *
 * Duas variantes: `onClick` para ação no próprio painel (abrir drawer,
 * registrar pagamento), `href` para link externo (ex.: WhatsApp em nova aba).
 */
export function IconActionButton(
  props: IconActionButtonProps & (
    | { onClick: () => void; href?: never }
    | { href: string; onClick?: never }
  ),
) {
  const { icon: Icon, label } = props;

  if (props.href) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        title={label}
        className={CLASS_NAME}
      >
        <Icon size={15} />
      </a>
    );
  }

  return (
    <button type="button" onClick={props.onClick} aria-label={label} title={label} className={CLASS_NAME}>
      <Icon size={15} />
    </button>
  );
}
