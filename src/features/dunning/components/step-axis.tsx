'use client';

import { useState } from 'react';
import { Bell, Mail, Pause, Plus } from 'lucide-react';
import { stepLabel } from '../step-offset';
import { StepDrawer } from './step-drawer';
import type { DunningStepDTO, PreviewChargeDTO } from '../queries';

const ACTION_ICON = { SEND_MESSAGE: Mail, SUSPEND: Pause, NOTIFY_OWNER: Bell } as const;

function describe(step: DunningStepDTO): string {
  if (step.action === 'SUSPEND') return 'Suspende a assinatura e avisa você';
  if (step.action === 'NOTIFY_OWNER') return 'Alerta interno, sem mensagem ao cliente';
  return step.templateBody?.split('\n')[0] ?? 'Mensagem ainda sem texto';
}

/**
 * Os passos no eixo do vencimento, da esquerda para a direita. Deslocamento
 * negativo é antes do vencimento — o eixo é a única leitura em que "cinco dias
 * antes" e "cinco dias depois" não podem ser confundidos.
 */
export function StepAxis({
  ruleId,
  steps,
  charges,
  settings,
}: {
  ruleId: string;
  steps: DunningStepDTO[];
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const [editing, setEditing] = useState<DunningStepDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Conta as aberturas para compor a `key` da gaveta. Sem isto, duas aberturas
  // seguidas de "Novo passo" têm a mesma chave (`'new'`), o React reusa a
  // instância e o react-hook-form devolve o formulário do passo anterior —
  // inclusive o rascunho que o operador acabou de descartar com Esc. Mesma
  // correção do diálogo de pagamento (103e83d): o conteúdo continua montado
  // durante a animação de fechamento, então trocar de chave é o que reinicia.
  const [openCount, setOpenCount] = useState(0);

  function open(step: DunningStepDTO | null) {
    setEditing(step);
    setOpenCount((count) => count + 1);
    setDrawerOpen(true);
  }

  return (
    <section className="overflow-hidden rounded border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">
        Passos, no eixo do vencimento
      </h2>

      <div className="overflow-x-auto px-4 py-5">
        <div className="flex min-w-[520px] items-start">
          {steps.map((step) => {
            const Icon = ACTION_ICON[step.action as keyof typeof ACTION_ICON] ?? Mail;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => open(step)}
                // Passo inativo perde opacidade em vez de ganhar um badge
                // "Inativo": o eixo já é denso e o badge competiria com o rótulo.
                className={`flex min-w-[110px] flex-1 flex-col items-center gap-2.5 rounded px-1 py-2 text-center ${
                  step.isActive ? '' : 'opacity-45'
                }`}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full border border-border bg-surface-elevated ${
                    step.action === 'SUSPEND' ? 'text-brand-light' : 'text-foreground'
                  }`}
                >
                  <Icon size={16} />
                </span>
                <span className="font-mono text-[13px] font-semibold tabular-mono text-foreground">
                  {stepLabel(step.offsetDays)}
                </span>
                <span className="line-clamp-3 text-xs leading-snug text-foreground-muted">{describe(step)}</span>
                <span className="text-[11px] font-bold text-brand-light">Editar passo</span>
                {!step.isActive && <span className="sr-only">Passo inativo</span>}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => open(null)}
            className="flex w-[110px] flex-none flex-col items-center gap-2.5 px-1 py-2 text-foreground-muted"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-border-strong text-foreground">
              <Plus size={16} />
            </span>
            <span className="text-xs font-semibold">Adicionar passo</span>
          </button>
        </div>
      </div>

      <p className="border-t border-border px-4 py-3 text-[13px] leading-relaxed text-foreground-muted">
        Deslocamento negativo é antes do vencimento. O passo de suspender muda a situação da assinatura e avisa você;
        o corte no fornecedor continua manual.
      </p>

      <StepDrawer
        key={`${editing?.id ?? 'new'}-${openCount}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ruleId={ruleId}
        step={editing}
        charges={charges}
        settings={settings}
      />
    </section>
  );
}
