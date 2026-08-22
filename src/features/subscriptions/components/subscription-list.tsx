'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { CYCLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { SubscriptionDrawer } from './subscription-drawer';
import type { SubscriptionDTO } from '../queries';

function statusTone(status: SubscriptionDTO['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'warning';
  return 'neutral';
}

export function SubscriptionList({
  customerId,
  subscriptions,
  plans,
  suppliers,
  timezone,
}: {
  customerId: string;
  subscriptions: SubscriptionDTO[];
  plans: { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null }[];
  suppliers: { id: string; name: string }[];
  timezone: string;
}) {
  const [editing, setEditing] = useState<SubscriptionDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
          <Plus aria-hidden="true" />
          Nova assinatura
        </Button>
      </div>
      {subscriptions.length === 0 && (
        <p className="text-sm text-foreground-muted">Nenhuma assinatura cadastrada.</p>
      )}
      {subscriptions.map((sub) => (
        <div key={sub.id} className="rounded-sm border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold text-foreground">{sub.planName ?? 'Sem plano'}</p>
            <StatusBadge tone={statusTone(sub.status)}>{SUBSCRIPTION_STATUS_LABELS[sub.status] ?? sub.status}</StatusBadge>
          </div>
          <p className="font-mono text-sm tabular-mono text-foreground-muted">
            {formatCents(sub.priceCents)} · {CYCLE_LABELS[sub.cycle] ?? sub.cycle} · {sub.supplierName ?? 'sem fornecedor'}
          </p>
          {/* ⚠️ Usuário e senha de acesso não aparecem aqui. Eles moram no bloco
              "Acesso do assinante" da ficha (handoff 04 §4), onde os dois ficam
              mascarados e são revelados juntos por uma revelação auditada. Ter
              o usuário em texto claro nesta lista era a segunda cópia — e a
              cópia insegura — da mesma interface. */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label="Editar assinatura"
              title="Editar assinatura"
              onClick={() => { setEditing(sub); setDrawerOpen(true); }}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
      ))}
      <SubscriptionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        customerId={customerId}
        subscription={editing}
        plans={plans}
        suppliers={suppliers}
        timezone={timezone}
      />
    </div>
  );
}
