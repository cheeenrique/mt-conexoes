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
      <div className="rounded-sm border border-border bg-surface-elevated p-3 text-sm text-foreground-muted">
        Nenhuma cobrança cadastrada ainda pra pré-visualizar — o texto abaixo mostra as variáveis sem substituir.
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground">{templateBody}</pre>
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
    <div className="rounded-sm border border-border bg-surface-elevated p-3">
      <select
        aria-label="Cobrança pra prévia"
        value={chargeId}
        onChange={(e) => setChargeId(e.target.value)}
        className="mb-2 h-9 w-full rounded-sm border border-border bg-surface px-2 text-sm text-foreground"
      >
        {charges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.customerName} — {formatCents(c.netCents)}
          </option>
        ))}
      </select>
      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{renderTemplate(templateBody, context)}</pre>
    </div>
  );
}
