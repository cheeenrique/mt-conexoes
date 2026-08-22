'use client';

import { useRef, useState } from 'react';
import { Pause, Pencil, Play, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/lib/toast';
import { renameDunningRuleAction, setDunningRuleStatusAction } from '../actions';
import { RuleStatusBadge } from './rule-status-badge';
import { SetDefaultRuleDialog } from './set-default-rule-dialog';

export function RuleHeader({
  rule,
  currentDefaultName,
  evaluableSubscriptions,
}: {
  rule: { id: string; name: string; status: string; isDefault: boolean; activeStepCount: number };
  currentDefaultName: string | null;
  evaluableSubscriptions: number;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [confirmDefault, setConfirmDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  // Campo não controlado: o valor do servidor nunca entra em `useState`, então
  // não nasce desatualizado quando a régua é renomeada em outra aba. O `key`
  // no chamador remonta o campo ao trocar de régua.
  async function commitName() {
    const name = nameRef.current?.value.trim() ?? '';
    if (!name || name === rule.name) {
      if (nameRef.current) nameRef.current.value = rule.name;
      return;
    }
    const result = await renameDunningRuleAction(rule.id, { name });
    if ('error' in result) {
      if (nameRef.current) nameRef.current.value = rule.name;
      toastError(result.error);
      return;
    }
    toastSuccess('Nome da régua atualizado.');
  }

  async function changeStatus(status: 'PAUSED' | 'ACTIVE', successMessage: string) {
    setBusy(true);
    const result = await setDunningRuleStatusAction(rule.id, { status });
    setBusy(false);
    if ('error' in result) toastError(result.error);
    else toastSuccess(successMessage);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface p-4">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            ref={nameRef}
            defaultValue={rule.name}
            aria-label="Nome da régua"
            maxLength={60}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape' && nameRef.current) nameRef.current.value = rule.name;
            }}
            className="w-full min-w-[26ch] max-w-[32ch] flex-[1_1_auto] border-0 border-b border-dashed border-border bg-transparent py-0.5 text-lg font-extrabold tracking-[-.01em] text-foreground"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar nome da régua"
            title="Editar nome da régua"
            onClick={() => nameRef.current?.focus()}
          >
            <Pencil />
          </Button>
          <RuleStatusBadge status={rule.status} />
        </div>
        {/* Sem "última passada às 07:00 · N mensagens": `DunningRule` não guarda
            `lastRunAt`/`lastRunCount`, e inventar o dado na apresentação seria
            pior que não mostrá-lo. A linha diz o que dá para afirmar. */}
        <span className="text-[13px] text-foreground-muted">
          <span className="font-mono tabular-mono">{rule.activeStepCount}</span>{' '}
          {rule.activeStepCount === 1 ? 'passo ativo' : 'passos ativos'} ·{' '}
          {rule.isDefault ? 'é a régua que roda hoje' : 'não é a régua padrão, não roda'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!rule.isDefault && (
          <Button variant="outline" onClick={() => setConfirmDefault(true)} disabled={busy}>
            <Star /> Tornar padrão
          </Button>
        )}
        {rule.status === 'ACTIVE' && (
          <Button variant="outline" onClick={() => changeStatus('PAUSED', 'Régua pausada.')} disabled={busy}>
            <Pause /> Pausar régua
          </Button>
        )}
        {rule.status === 'PAUSED' && (
          <Button onClick={() => changeStatus('ACTIVE', 'Régua retomada.')} disabled={busy}>
            <Play /> Retomar régua
          </Button>
        )}
      </div>

      <SetDefaultRuleDialog
        open={confirmDefault}
        onOpenChange={setConfirmDefault}
        rule={rule}
        currentDefaultName={currentDefaultName}
        evaluableSubscriptions={evaluableSubscriptions}
      />
    </div>
  );
}
