import { daysFromDue, type ConsolidatedMessage, type PendingStep } from '@/core/dunning-rules';
import { localDateOnly } from '@/core/dates';
import { formatCents } from '@/lib/format';
import type { SettingsDTO } from '@/lib/settings';
import { resolveTemplateParams, type TemplateContext, type TemplateVariable } from '@/core/dunning-template';

/**
 * Como uma mensagem de cobrança é montada: o contexto de template de um par
 * (cobrança, passo) e o texto final da mensagem consolidada.
 *
 * Módulo próprio, e não dentro de `evaluate.ts`, porque a prévia de revisão
 * (`queries.ts`) precisa exatamente das mesmas funções que o motor: se a tela
 * montasse o texto por conta própria, o operador aprovaria uma coisa e o
 * cliente receberia outra. Deixá-las em `evaluate.ts` criava um ciclo de import
 * `queries ↔ evaluate` que só não quebrava por sorte do hoisting.
 */
export type ChargeForStep = {
  id: string;
  customerId: string;
  dueAt: Date;
  principalCents: bigint;
  discountCents: bigint;
  payments: { amountCents: bigint }[];
  customer: {
    name: string;
    phone: string | null;
    optedOut: boolean;
    anonymizedAt: Date | null;
    deletedAt: Date | null;
  };
};

export type StepForEvaluation = {
  id: string;
  offsetDays: number;
  templateBody: string | null;
  /** `null` até o operador modelar o template Meta pra este passo. */
  metaTemplateName: string | null;
  /** Ordem posicional das variáveis (ver `orderedTemplateParamKeys`) — `null`/`[]` sem template. */
  metaTemplateParams: TemplateVariable[] | null;
};

/**
 * Monta o passo pendente que vai para `consolidate`. Exportado porque a
 * pré-visualização de revisão (`queries.ts`) precisa do **mesmo** contexto de
 * template: se a tela montasse o contexto por conta própria, o operador
 * aprovaria um texto e o cliente receberia outro.
 */
export function buildPendingStep(charge: ChargeForStep, step: StepForEvaluation, settings: SettingsDTO, now: Date): PendingStep {
  const netCents = charge.principalCents - charge.discountCents;
  const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
  const remainingCents = netCents - paidCents;

  const context: TemplateContext = {
    'cliente.primeiro_nome': charge.customer.name.split(' ')[0],
    'cliente.nome': charge.customer.name,
    'cobranca.valor': formatCents(remainingCents),
    'cobranca.vencimento': localDateOnly(charge.dueAt, settings.timezone).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
    'cobranca.dias_atraso': String(Math.max(0, daysFromDue(charge.dueAt, now, settings.timezone))),
    'pix.chave': settings.pixKey ?? '',
    'negocio.nome': settings.businessName,
  };

  return {
    customerId: charge.customerId,
    toPhone: charge.customer.phone as string, // já validado não-nulo antes de chamar
    chargeId: charge.id,
    stepId: step.id,
    offsetDays: step.offsetDays,
    templateBody: step.templateBody ?? '',
    netCents: remainingCents.toString(),
    context,
    metaTemplateName: step.metaTemplateName,
    // Resolvido com o mesmo `context` que renderiza o corpo — congelado aqui,
    // na avaliação, igual `netCents`. Nunca recalculado no despacho.
    metaTemplateParams: step.metaTemplateName ? resolveTemplateParams(step.metaTemplateParams ?? [], context) : null,
  };
}

/**
 * Texto final da mensagem consolidada, com o sufixo das cobranças extras.
 * É o que o cliente lê no WhatsApp — e, por isso, exatamente o que a lista de
 * revisão precisa mostrar antes de o operador ativar a régua.
 */
export function buildConsolidatedBody(msg: ConsolidatedMessage): string {
  return msg.extraCount > 0
    ? `${msg.body}\n\n+ mais ${msg.extraCount} cobrança(s), totalizando ${formatCents(msg.extraCents)}`
    : msg.body;
}

