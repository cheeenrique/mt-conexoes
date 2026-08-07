'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { CYCLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { CredentialRevealDialog } from './credential-reveal-dialog';
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
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>Nova assinatura</Button>
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
          <div className="mt-3 flex items-center gap-2">
            {(sub.accessUsername || sub.hasAccessPassword) && (
              <span className="font-mono text-xs tabular-mono text-foreground-muted">
                {sub.accessUsername || 'sem usuário'} · {sub.hasAccessPassword ? '••••••••' : 'sem senha'}
              </span>
            )}
            {sub.hasAccessPassword && <CredentialRevealDialog subscriptionId={sub.id} />}
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
