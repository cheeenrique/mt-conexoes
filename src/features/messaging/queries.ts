import { db } from '@/lib/db';
import type { ChannelProvider, MessageKind } from '@prisma/client';
import { isPostponed, stepLabel, stepLabels, type LogOutcome, type MessageLogEntryDTO } from './message-log-format';
import { CHANNEL_PROVIDERS, resolveDescriptor } from './channels/registry';
import type { ChannelDescriptor } from './channels/types';

export type { MessageLogEntryDTO } from './message-log-format';

export type ChannelConfigDTO = {
  provider: ChannelProvider;
  configured: boolean;
  /**
   * A forma da tela deste canal: passos, campos, aviso e rótulo de tipo. Vem do
   * adapter, nunca de um `if (provider === ...)` no componente.
   *
   * ⚠️ Descreve os campos; não carrega valor. Credencial de canal não volta para
   * o front, nem mascarada — por isso não existe `credentials` neste DTO.
   */
  descriptor: ChannelDescriptor;
  isActive: boolean;
  isDefault: boolean;
  phoneNumber: string | null;
  riskAcceptedAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastError: string | null;
};

export interface MessageDTO {
  id: string;
  kind: string;
  status: string;
  body: string;
  sentAt: string | null;
  failReason: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export async function listMessagesForCustomer(customerId: string): Promise<MessageDTO[]> {
  const rows = await db.message.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    body: row.body,
    sentAt: row.sentAt?.toISOString() ?? null,
    failReason: row.failReason,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listChannelConfigs(): Promise<ChannelConfigDTO[]> {
  const rows = await db.channelConfig.findMany({
    where: { provider: { in: CHANNEL_PROVIDERS } },
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return CHANNEL_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (!row) {
      return {
        provider,
        configured: false,
        descriptor: resolveDescriptor(provider),
        isActive: false,
        isDefault: false,
        phoneNumber: null,
        riskAcceptedAt: null,
        lastCheckAt: null,
        lastCheckOk: null,
        lastError: null,
      };
    }
    return {
      provider,
      configured: true,
      descriptor: resolveDescriptor(provider),
      isActive: row.isActive,
      isDefault: row.isDefault,
      phoneNumber: row.phoneNumber,
      riskAcceptedAt: row.riskAcceptedAt?.toISOString() ?? null,
      lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk,
      lastError: row.lastError,
    };
  });
}

export type ChannelDownAlertDTO = {
  label: string;
  /** Desde quando o `connection.update` reportou `state: 'close'` — `null` quando a
   *  queda foi detectada só pelo healthCheck periódico (VPS inteira fora do ar, sem
   *  emitir webhook nenhum). */
  disconnectedAt: string | null;
};

/**
 * Canal padrão que a régua usaria para enviar agora, mas está marcado como fora do ar
 * (`lastCheckOk === false`) — o mesmo campo que `scheduled-dispatch.ts` confere antes de
 * cada envio. `null` quando não há motivo pra alarme.
 */
export async function getChannelDownAlert(): Promise<ChannelDownAlertDTO | null> {
  const row = await db.channelConfig.findFirst({
    // `provider: { in: ... }` porque o enum do Postgres ainda carrega `SALVY`, sem adapter:
    // linha antiga marcada como padrão não pode derrubar o alerta em `resolveDescriptor`.
    where: { isDefault: true, isActive: true, provider: { in: CHANNEL_PROVIDERS } },
  });
  if (!row || row.lastCheckOk !== false) return null;

  return {
    label: resolveDescriptor(row.provider).label,
    disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
  };
}

/**
 * Registro do que a régua fez. Duas origens de dado, unidas porque metade do valor da
 * tela está no que **não** foi enviado — e essa metade não mora em `messages`:
 *
 * 1. `messages` — tudo que chegou a virar mensagem: enviada, na fila, adiada (T6),
 *    falhada, ou cancelada no despacho (`stale`, `opted_out`, `charge_closed`, `daily_dedupe`).
 * 2. `dunning_executions` sem `messageId`, com `outcome` SKIPPED/PENDING_REVIEW — a régua
 *    parou antes de montar a mensagem (`opted_out`, `no_phone`, `daily_dedupe`, `review`).
 *    Não existe, e nunca vai existir, linha em `messages` para esses casos.
 *
 * Mensagens recebidas (`INBOUND`/`RECEIVED`) ficam de fora: a tela prova envio, não conversa.
 */
export interface MessageLogFilters {
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface MessageLogResult {
  entries: MessageLogEntryDTO[];
  /** Bateu no teto de linhas: a tela avisa em vez de mentir que acabou. */
  truncated: boolean;
}

/** A tela não pagina de propósito (agrupa por dia). O teto existe pra "Tudo" não virar dump. */
const MESSAGE_LOG_LIMIT = 500;

const OUTBOUND_KINDS: MessageKind[] = ['DUNNING', 'MANUAL', 'TEST'];

const OUTCOME_BY_MESSAGE_STATUS: Record<string, LogOutcome> = {
  SENT: 'SENT',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
  CANCELLED: 'SKIPPED',
  SKIPPED: 'SKIPPED',
};

export async function listMessages(filters: MessageLogFilters = {}): Promise<MessageLogResult> {
  const limit = filters.limit ?? MESSAGE_LOG_LIMIT;
  const range = filters.from && filters.to ? { gte: filters.from, lte: filters.to } : undefined;

  const [messages, executions] = await Promise.all([
    db.message.findMany({
      where: {
        kind: { in: OUTBOUND_KINDS },
        status: { not: 'RECEIVED' },
        // `occurredAt` é o envio quando houve envio: uma mensagem criada 23h50 e despachada
        // 08h10 do dia seguinte pertence ao dia em que efetivamente saiu.
        ...(range ? { OR: [{ sentAt: range }, { sentAt: null, createdAt: range }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        status: true,
        body: true,
        sentAt: true,
        createdAt: true,
        scheduledFor: true,
        failReason: true,
        cancelReason: true,
        customerId: true,
        customer: { select: { name: true } },
        executions: { select: { step: { select: { offsetDays: true } } } },
      },
    }),
    db.dunningExecution.findMany({
      where: {
        messageId: null,
        outcome: { in: ['SKIPPED', 'PENDING_REVIEW'] },
        ...(range ? { createdAt: range } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        reason: true,
        createdAt: true,
        step: { select: { offsetDays: true } },
        charge: { select: { customerId: true, customer: { select: { name: true } } } },
      },
    }),
  ]);

  const fromMessages: MessageLogEntryDTO[] = messages.map((row) => {
    const postponed = row.status === 'PENDING' && isPostponed(row.scheduledFor, row.createdAt);
    return {
      id: row.id,
      source: 'MESSAGE',
      occurredAt: (row.sentAt ?? row.createdAt).toISOString(),
      customerId: row.customerId,
      customerName: row.customer.name,
      origin: row.kind === 'DUNNING' ? 'RULE' : 'MANUAL',
      stepLabel: stepLabels(row.executions.map((e) => e.step.offsetDays)),
      outcome: OUTCOME_BY_MESSAGE_STATUS[row.status] ?? 'SKIPPED',
      postponed,
      postponedToAt: postponed ? row.scheduledFor.toISOString() : null,
      reasonCode: row.cancelReason,
      failReason: row.failReason,
      body: row.body,
    };
  });

  const fromExecutions: MessageLogEntryDTO[] = executions.map((row) => ({
    id: row.id,
    source: 'EXECUTION',
    occurredAt: row.createdAt.toISOString(),
    customerId: row.charge.customerId,
    customerName: row.charge.customer.name,
    origin: 'RULE',
    stepLabel: stepLabel(row.step.offsetDays),
    outcome: 'SKIPPED',
    postponed: false,
    postponedToAt: null,
    reasonCode: row.reason,
    failReason: null,
    // Nenhum texto foi montado: a régua parou antes disso.
    body: null,
  }));

  const merged = [...fromMessages, ...fromExecutions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return {
    entries: merged.slice(0, limit),
    truncated: merged.length > limit || messages.length === limit || executions.length === limit,
  };
}
