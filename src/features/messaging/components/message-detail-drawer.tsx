'use client';

import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerSection } from '@/components/ui/drawer';
import { useStableWhileClosing } from '@/components/ui/use-stable-while-closing';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  bodyLabel,
  formatLocalDayHeading,
  formatLocalTime,
  outcomeBadge,
  reasonText,
  resultLabel,
  type MessageLogEntryDTO,
} from '../message-log-format';

const ORIGIN_LABEL = { RULE: 'Régua', MANUAL: 'Manual' } as const;

export function MessageDetailDrawer({
  entry,
  timezone,
  onClose,
}: {
  entry: MessageLogEntryDTO | null;
  timezone: string;
  onClose: () => void;
}) {
  // `entry` vira nulo assim que o fechamento começa; sem isto o `Drawer`
  // inteiro desmontaria com ele e a animação de saída nunca rodaria.
  const shownEntry = useStableWhileClosing(entry, (a, b) => a.id === b.id);
  const badge = shownEntry ? outcomeBadge(shownEntry) : null;
  const reason = shownEntry ? reasonText(shownEntry) : null;

  return (
    <Drawer open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent size="sm" aria-label={shownEntry?.customerName}>
        {shownEntry && badge && (
          <>
            <DrawerHeader
              title={shownEntry.customerName}
              subtitle={
                <span className="font-mono tabular-mono text-xs text-foreground-muted">
                  {formatLocalDayHeading(shownEntry.occurredAt, timezone)} ·{' '}
                  {formatLocalTime(shownEntry.occurredAt, timezone)} · {ORIGIN_LABEL[shownEntry.origin]}
                </span>
              }
            >
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </DrawerHeader>
            <DrawerBody>
              {shownEntry.stepLabel && (
                <DrawerSection label="Passo">
                  <p className="font-mono tabular-mono text-sm text-foreground">{shownEntry.stepLabel}</p>
                </DrawerSection>
              )}

              <DrawerSection label={bodyLabel(shownEntry)}>
                {shownEntry.body ? (
                  <p
                    className={`rounded border border-border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                      shownEntry.outcome === 'SENT' ? 'text-foreground' : 'text-foreground-muted'
                    }`}
                  >
                    {shownEntry.body}
                  </p>
                ) : (
                  <p className="rounded border border-border bg-background p-4 text-sm text-foreground-muted">
                    Nenhum texto foi montado — a régua parou antes de gerar a mensagem.
                  </p>
                )}
              </DrawerSection>

              <DrawerSection label={resultLabel(shownEntry)}>
                <p className="text-sm text-foreground">
                  {shownEntry.outcome === 'SENT' ? 'Mensagem entregue ao canal.' : (reason ?? 'Sem motivo registrado.')}
                </p>
                {shownEntry.postponedToAt && (
                  <p className="mt-1 font-mono tabular-mono text-xs text-foreground-muted">
                    Sai em {formatLocalDayHeading(shownEntry.postponedToAt, timezone)} às{' '}
                    {formatLocalTime(shownEntry.postponedToAt, timezone)}
                  </p>
                )}
              </DrawerSection>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
