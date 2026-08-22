import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { consolidate, type PendingStep } from '@/core/dunning-rules';
import { getSettings } from '@/lib/settings';
import { buildConsolidatedBody, buildPendingStep } from './message-build';

// Sem a régua padrão (isDefault=true), o cron e a tela /regua não têm o que
// avaliar/mostrar. O seed garante isso em dev, mas não é garantia em produção
// (linha apagada por engano, singleton nunca recriado etc.) — sem esta guarda,
// `findFirstOrThrow` do Prisma estoura direto e a tela fica em branco, sem
// error.tsx nenhum capturando.
export class NoDefaultDunningRuleError extends DomainError {
  constructor(cause?: unknown) {
    super(
      'Nenhuma régua de cobrança padrão configurada. Marque uma régua como padrão antes de continuar.',
      'NO_DEFAULT_DUNNING_RULE',
      { cause },
    );
  }
}

export interface DunningStepDTO {
  id: string;
  offsetDays: number;
  action: string;
  templateBody: string | null;
  isActive: boolean;
}

export interface DunningRuleDTO {
  id: string;
  name: string;
  status: string;
  isDefault: boolean;
}

export async function getDefaultRuleWithSteps(): Promise<DunningRuleDTO & { steps: DunningStepDTO[] }> {
  const rule = await db.dunningRule.findFirst({
    where: { isDefault: true },
    include: { steps: { orderBy: { offsetDays: 'asc' } } },
  });
  if (!rule) throw new NoDefaultDunningRuleError();
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status,
    isDefault: rule.isDefault,
    steps: rule.steps.map((s) => ({
      id: s.id,
      offsetDays: s.offsetDays,
      action: s.action,
      templateBody: s.templateBody,
      isActive: s.isActive,
    })),
  };
}

export interface PreviewChargeDTO {
  id: string;
  customerName: string;
  netCents: string;
  dueAt: string;
}

export async function listRecentChargesForPreview(limit = 10): Promise<PreviewChargeDTO[]> {
  const rows = await db.charge.findMany({
    take: limit,
    orderBy: { issuedAt: 'desc' },
    include: { customer: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer.name,
    netCents: (row.principalCents - row.discountCents).toString(),
    dueAt: row.dueAt.toISOString(),
  }));
}

export interface DunningRuleListItemDTO {
  id: string;
  name: string;
  status: string;
  isDefault: boolean;
  stepCount: number;
}

/** Lista da coluna mestre. Padrão primeiro — é a régua que realmente cobra. */
export async function listDunningRules(): Promise<DunningRuleListItemDTO[]> {
  const rows = await db.dunningRule.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, status: true, isDefault: true, _count: { select: { steps: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    isDefault: row.isDefault,
    stepCount: row._count.steps,
  }));
}

/** A régua selecionada na URL. `null` quando o id não existe mais (link velho). */
export async function getRuleWithSteps(
  ruleId: string,
): Promise<(DunningRuleDTO & { steps: DunningStepDTO[] }) | null> {
  const rule = await db.dunningRule.findUnique({
    where: { id: ruleId },
    include: { steps: { orderBy: { offsetDays: 'asc' } } },
  });
  if (!rule) return null;
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status,
    isDefault: rule.isDefault,
    steps: rule.steps.map((s) => ({
      id: s.id,
      offsetDays: s.offsetDays,
      action: s.action,
      templateBody: s.templateBody,
      isActive: s.isActive,
    })),
  };
}

export interface ReviewMessageDTO {
  customerId: string;
  customerName: string;
  offsetDays: number;
  body: string;
}

/**
 * O texto real de cada mensagem que sairia hoje se a régua fosse ativada agora
 * — a proteção mais importante da tela de réguas.
 *
 * ⚠️ Reusa `consolidate` de `core/` e `buildPendingStep`/`buildConsolidatedBody`
 * do motor, de propósito. Uma segunda consolidação escrita para a tela faria o
 * operador aprovar um texto e o cliente receber outro, e é o cliente com três
 * cobranças vencidas — o que apareceria três vezes — que dá o alarme falso mais
 * caro aqui.
 */
export async function listReviewMessages(ruleId: string, now = new Date()): Promise<ReviewMessageDTO[]> {
  const executions = await db.dunningExecution.findMany({
    where: { outcome: 'PENDING_REVIEW', step: { ruleId } },
    include: {
      step: { select: { id: true, offsetDays: true, templateBody: true, action: true } },
      charge: {
        include: {
          customer: { select: { id: true, name: true, phone: true, optedOut: true } },
          payments: { select: { amountCents: true } },
        },
      },
    },
  });

  const settings = await getSettings();
  const pending: PendingStep[] = [];
  const offsetByStepId = new Map<string, number>();
  const nameByCustomerId = new Map<string, string>();

  for (const execution of executions) {
    // SUSPEND e NOTIFY_OWNER não geram mensagem — a lista é o que chega no
    // WhatsApp, não o que o motor faz.
    if (execution.step.action !== 'SEND_MESSAGE') continue;
    if (!execution.charge.customer.phone || execution.charge.customer.optedOut) continue;

    offsetByStepId.set(execution.step.id, execution.step.offsetDays);
    nameByCustomerId.set(execution.charge.customerId, execution.charge.customer.name);
    pending.push(buildPendingStep(execution.charge, execution.step, settings, now));
  }

  return consolidate(pending).map((msg) => ({
    customerId: msg.customerId,
    customerName: nameByCustomerId.get(msg.customerId) ?? '',
    // `consolidate` escolhe como base o passo mais distante do vencimento;
    // o rótulo espelha essa escolha. Ver nota no relatório: `ConsolidatedMessage`
    // ainda não carrega o `baseStepId`, e carregar seria melhor que espelhar.
    offsetDays: Math.max(...msg.stepIds.map((stepId) => offsetByStepId.get(stepId) ?? 0)),
    body: buildConsolidatedBody(msg),
  }));
}

export interface OperatorAlertDTO {
  id: string;
  kind: 'suspended' | 'notify';
  customerName: string;
  at: string;
}

export async function listOperatorAlerts(sinceHours = 24): Promise<OperatorAlertDTO[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const suspended = await db.subscription.findMany({
    where: { status: 'SUSPENDED', updatedAt: { gte: since } },
    include: { customer: { select: { name: true } } },
  });
  const notifyExecutions = await db.dunningExecution.findMany({
    where: { createdAt: { gte: since }, step: { action: 'NOTIFY_OWNER' } },
    include: { charge: { include: { customer: { select: { name: true } } } } },
  });

  return [
    ...suspended.map((s) => ({ id: s.id, kind: 'suspended' as const, customerName: s.customer.name, at: s.updatedAt.toISOString() })),
    ...notifyExecutions.map((e) => ({ id: e.id, kind: 'notify' as const, customerName: e.charge.customer.name, at: e.createdAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Quantas assinaturas a régua padrão passa a avaliar — o número que a
 * confirmação de "trocar a régua padrão" precisa mostrar para a decisão não ser
 * às cegas. Mora aqui, e não em `features/subscriptions`, porque é a leitura
 * desta tela; uma feature não importa de outra.
 */
export async function countEvaluableSubscriptions(): Promise<number> {
  return db.subscription.count({ where: { status: 'ACTIVE' } });
}
