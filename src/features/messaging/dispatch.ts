import { db } from '@/lib/db';
import { DomainError, UnknownTemplateVariableError } from '@/lib/errors';
import { assertKnownVariables, extractTemplateVariables, renderTemplate, type TemplateContext } from '@/core/dunning-template';
import { isWithinLocalHourRange, localDateOnly } from '@/core/dates';
import { decrypt } from '@/lib/crypto';
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

export interface DispatchSummary {
  sent: number;
  failed: number;
  skippedOptedOut: number;
  skippedNoPhone: number;
}

export async function sendManualBatch(input: { customerIds: string[]; body: string; now: Date }): Promise<DispatchSummary> {
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

  const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));
  const scheduledDate = localDateOnly(input.now, settings.timezone);

  let sent = 0;
  let failed = 0;

  for (const customer of eligible) {
    const context: TemplateContext = {
      'cliente.primeiro_nome': customer.name.split(' ')[0],
      'cliente.nome': customer.name,
      'cobranca.valor': '',
      'cobranca.vencimento': '',
      'cobranca.dias_atraso': '',
      'pix.chave': settings.pixKey ?? '',
      'negocio.nome': settings.businessName,
    };
    const rendered = renderTemplate(input.body, context);
    const result = await adapter.send({ toPhone: customer.phone as string, body: rendered }, credentials);

    await db.message.create({
      data: {
        customerId: customer.id,
        channelId: channelRow.id,
        kind: 'MANUAL',
        status: result.ok ? 'SENT' : 'FAILED',
        toPhone: customer.phone as string,
        body: rendered,
        scheduledFor: input.now,
        scheduledDate,
        sentAt: result.ok ? input.now : null,
        externalId: result.ok ? result.externalId : null,
        failReason: result.ok ? null : result.reason,
        attempts: 1,
      },
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed, skippedOptedOut, skippedNoPhone };
}
