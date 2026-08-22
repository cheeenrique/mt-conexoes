'use client';

import { useState } from 'react';
import { daysBetweenLocalDates } from '@/core/dates';
import { renderTemplate, type TemplateContext } from '@/core/dunning-template';
import { formatCents, formatLocalDate } from '@/lib/format';
import type { PreviewChargeDTO } from '../queries';

export function TemplatePreview({
  templateBody,
  charges,
  settings,
}: {
  templateBody: string;
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const [chargeId, setChargeId] = useState(charges[0]?.id ?? '');
  const charge = charges.find((c) => c.id === chargeId);

  if (charges.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-sm text-foreground-muted">
        Nenhuma cobrança cadastrada ainda pra pré-visualizar — o texto abaixo mostra as variáveis sem substituir.
        <pre className="whitespace-pre-wrap rounded border border-border bg-background p-3.5 font-sans text-sm leading-relaxed text-foreground">
          {templateBody}
        </pre>
      </div>
    );
  }

  const firstName = charge?.customerName.split(' ')[0] ?? '';
  const context: TemplateContext = {
    'cliente.primeiro_nome': firstName,
    'cliente.nome': charge?.customerName ?? '',
    'cobranca.valor': charge ? formatCents(charge.netCents) : '',
    'cobranca.vencimento': charge ? formatLocalDate(charge.dueAt, settings.timezone) : '',
    'cobranca.dias_atraso': charge
      ? String(daysBetweenLocalDates(new Date(charge.dueAt), new Date(), settings.timezone))
      : '0',
    'pix.chave': settings.pixKey ?? '',
    'negocio.nome': settings.businessName,
  };

  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label="Cobrança pra prévia"
        value={chargeId}
        onChange={(e) => setChargeId(e.target.value)}
        className="h-9 w-full rounded-badge border border-border bg-surface-elevated px-2 text-sm text-foreground"
      >
        {charges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.customerName} — {formatCents(c.netCents)}
          </option>
        ))}
      </select>
      {/* Fundo `#0B0B0C` (bg-background), como no handoff: a prévia imita a
          bolha do WhatsApp e precisa se destacar do cartão da seção. */}
      <pre className="whitespace-pre-wrap rounded border border-border bg-background p-3.5 font-sans text-sm leading-relaxed text-foreground">
        {renderTemplate(templateBody, context)}
      </pre>
    </div>
  );
}
