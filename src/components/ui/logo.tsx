/**
 * Marca MT Conexões — coroa + monograma, conforme `LOGO.md` do handoff.
 *
 * O SVG é inline, não `<img>`, porque a assinatura e o T do monograma usam
 * `currentColor`: a cor sai do container e um só arquivo serve aos dois temas.
 * Como `<img>` o `currentColor` cairia para preto.
 *
 * A coroa e o M são sempre `#EA580C` — não acompanham o tema (LOGO.md, "Cor por
 * tema"). Não recolorir; para estado desabilitado, usar opacidade.
 */

// Alturas/larguras vêm do LOGO.md, seção "Onde entra no painel": 34px de altura
// na barra lateral, 200px de largura na tela de login.
const ROW_HEIGHT = 34;
const ROW_WIDTH = 146;
const STACK_WIDTH = 200;
const STACK_HEIGHT = 199;

/** Coroa, arco e M — laranja fixo. Compartilhado pelos dois lockups. */
function CrownAndM() {
  return (
    <>
      <path
        d="M120 176V66l72 64 76-104 76 104 72-64v110"
        stroke="#EA580C"
        strokeWidth="18"
        strokeLinejoin="miter"
      />
      <path d="M142 202c70-22 178-22 248 0" stroke="#EA580C" strokeWidth="11" strokeLinecap="round" />
      <path
        d="M96 420V256l92 100 92-100v164"
        stroke="#EA580C"
        strokeWidth="40"
        strokeLinejoin="miter"
      />
      <path d="M316 272h140M386 272v168" stroke="currentColor" strokeWidth="40" />
    </>
  );
}

function LogoRow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1120 260"
      width={ROW_WIDTH}
      height={ROW_HEIGHT}
      fill="none"
      role="img"
      aria-label="MT Conexões"
      className={className}
    >
      <g transform="translate(-30,-40) scale(0.62)">
        <CrownAndM />
      </g>
      <text
        x="330"
        y="156"
        fontSize="76"
        fontWeight="700"
        letterSpacing="11"
        fill="currentColor"
        className="font-sans"
      >
        MT CONEXÕES
      </text>
    </svg>
  );
}

function LogoStack({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 552 550"
      width={STACK_WIDTH}
      height={STACK_HEIGHT}
      fill="none"
      role="img"
      aria-label="MT Conexões"
      className={className}
    >
      <CrownAndM />
      <text
        x="276"
        y="534"
        textAnchor="middle"
        fontSize="54"
        fontWeight="700"
        letterSpacing="10"
        fill="currentColor"
        className="font-sans"
      >
        MT CONEXÕES
      </text>
    </svg>
  );
}

export function Logo({ variant, className }: { variant: 'row' | 'stack'; className?: string }) {
  return variant === 'row' ? <LogoRow className={className} /> : <LogoStack className={className} />;
}
