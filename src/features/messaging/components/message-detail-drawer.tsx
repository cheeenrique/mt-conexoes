'use client';

import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerSection } from '@/components/ui/drawer';
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
  if (!entry) return null;

  const badge = outcomeBadge(entry);
  const reason = reasonText(entry);

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent width={480} aria-label={entry.customerName}>
        <DrawerHeader
          title={entry.customerName}
          subtitle={
            <span className="font-mono tabular-mono text-xs text-foreground-muted">
              {formatLocalDayHeading(entry.occurredAt, timezone)} · {formatLocalTime(entry.occurredAt, timezone)} ·{' '}
              {ORIGIN_LABEL[entry.origin]}
            </span>
          }
        >
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </DrawerHeader>
        <DrawerBody>
          {entry.stepLabel && (
            <DrawerSection label="Passo">
              <p className="font-mono tabular-mono text-sm text-foreground">{entry.stepLabel}</p>
            </DrawerSection>
          )}

          <DrawerSection label={bodyLabel(entry)}>
            {entry.body ? (
              <p
                className={`rounded border border-border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                  entry.outcome === 'SENT' ? 'text-foreground' : 'text-foreground-muted'
                }`}
              >
                {entry.body}
              </p>
            ) : (
              <p className="rounded border border-border bg-background p-4 text-sm text-foreground-muted">
                Nenhum texto foi montado — a régua parou antes de gerar a mensagem.
              </p>
            )}
          </DrawerSection>

          <DrawerSection label={resultLabel(entry)}>
            <p className="text-sm text-foreground">
              {entry.outcome === 'SENT' ? 'Mensagem entregue ao canal.' : (reason ?? 'Sem motivo registrado.')}
            </p>
            {entry.postponedToAt && (
              <p className="mt-1 font-mono tabular-mono text-xs text-foreground-muted">
                Sai em {formatLocalDayHeading(entry.postponedToAt, timezone)} às{' '}
                {formatLocalTime(entry.postponedToAt, timezone)}
              </p>
            )}
          </DrawerSection>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
