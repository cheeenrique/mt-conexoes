import { db } from '@/lib/db';
import { DomainError, UnknownTemplateVariableError } from '@/lib/errors';
import { assertKnownVariables, extractTemplateVariables, renderTemplate, type TemplateContext } from '@/core/dunning-template';
import { isWithinLocalHourRange, localDateOnly } from '@/core/dates';
import { CHANNEL_PROVIDERS, resolveAdapter } from './channels/registry';
import { getSettings } from '@/lib/settings';

export class NoDefaultChannelError extends DomainError {
  constructor(cause?: unknown) {
    super('Configure um canal padrão em Canais antes de enviar.', 'NO_DEFAULT_CHANNEL', { cause });
  }
}

export class OutsideQuietHoursError extends DomainError {
  constructor(cause?: unknown) {
    super('Fora do horário permitido. Tente novamente dentro da janela configurada.', 'OUTSIDE_QUIET_HOURS', { cause });
  }
}

export class ChannelDoesNotSupportFreeTextError extends DomainError {
  constructor(cause?: unknown) {
    super(
      'O canal padrão não envia texto livre. Configure um canal com suporte a envio manual (Evolution).',
      'CHANNEL_NO_FREE_TEXT',
      { cause },
    );
  }
}

export class ChargeVariablesNotAllowedInManualSendError extends DomainError {
  constructor(variables: string[], cause?: unknown) {
    super(`Envio manual não tem cobrança associada — remova: ${variables.join(', ')}`, 'CHARGE_VARIABLES_NOT_ALLOWED', { cause });
  }
}

/**
 * `sendManualBatch` só valida e enfileira — nunca chama o provider. O envio manual
 * assistido é o caminho de maior volume por clique (confirmação por digitação só
 * existe acima de 100 destinatários, ver `send-message-dialog.tsx`) e roda dentro de
 * uma Server Action, sem os ~15 min de folga do cron. Um lote grande no ritmo do canal
 * mais lento (Evolution, 20/min ⇒ ~3s por mensagem) estouraria o timeout da Action bem
 * antes de terminar, e rajada sequencial sem ritmo é a assinatura que heurística
 * antispam do WhatsApp procura — banimento de número não tem recuperação.
 *
 * Quem chama o provider de verdade, no ritmo de `sendDelayMs` e respeitando quiet
 * hours (T6), opt-out (T5) e canal fora do ar, é `dispatchPendingMessages`
 * (`messages-dispatch`) — o mesmo motor que já serve a régua. `Message.kind` distingue
 * a origem (`MANUAL` aqui, `DUNNING` na régua); o despacho em si não olha para `kind`.
 */
export interface ManualQueueSummary {
  queued: number;
  skippedOptedOut: number;
  skippedNoPhone: number;
}

export async function sendManualBatch(input: { customerIds: string[]; body: string; now: Date }): Promise<ManualQueueSummary> {
  try {
    assertKnownVariables(input.body);
  } catch (err) {
    throw new UnknownTemplateVariableError(err instanceof Error ? err.message : 'Variável de template desconhecida.', err);
  }

  const chargeVariables = extractTemplateVariables(input.body).filter((v) => v.startsWith('cobranca.'));
  if (chargeVariables.length > 0) {
    throw new ChargeVariablesNotAllowedInManualSendError([...new Set(chargeVariables)]);
  }

  const channelRow = await db.channelConfig.findFirst({
    where: { isDefault: true, isActive: true, provider: { in: CHANNEL_PROVIDERS } },
  });
  if (!channelRow) throw new NoDefaultChannelError();

  const adapter = resolveAdapter(channelRow.provider);
  if (!adapter.capabilities.supportsFreeText) throw new ChannelDoesNotSupportFreeTextError();

  const settings = await getSettings();
  if (!isWithinLocalHourRange(input.now, settings.quietHourStart, settings.quietHourEnd, settings.timezone)) {
    throw new OutsideQuietHoursError();
  }

  const uniqueIds = [...new Set(input.customerIds)];
  const customers = await db.customer.findMany({ where: { id: { in: uniqueIds } } });

  const skippedOptedOut = customers.filter((c) => c.optedOut).length;
  const skippedNoPhone = customers.filter((c) => !c.optedOut && !c.phone).length;
  const eligible = customers.filter((c) => !c.optedOut && c.phone);

  const scheduledDate = localDateOnly(input.now, settings.timezone);

  // channelId fica em aberto de propósito — quem resolve o canal (e pode ter mudado
  // entre o clique e o despacho) é dispatchPendingMessages, mesmo padrão de
  // features/dunning/evaluate.ts ao persistir uma Message PENDING.
  const rows = eligible.map((customer) => {
    const context: TemplateContext = {
      'cliente.primeiro_nome': customer.name.split(' ')[0],
      'cliente.nome': customer.name,
      'cobranca.valor': '',
      'cobranca.vencimento': '',
      'cobranca.dias_atraso': '',
      'pix.chave': settings.pixKey ?? '',
      'negocio.nome': settings.businessName,
    };
    return {
      customerId: customer.id,
      kind: 'MANUAL' as const,
      status: 'PENDING' as const,
      toPhone: customer.phone as string,
      body: renderTemplate(input.body, context),
      scheduledFor: input.now,
      scheduledDate,
    };
  });

  if (rows.length > 0) {
    await db.message.createMany({ data: rows });
  }

  return { queued: rows.length, skippedOptedOut, skippedNoPhone };
}
