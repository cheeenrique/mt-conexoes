import { CYCLE_LABELS } from '@/lib/labels';

/**
 * Plano pré-selecionado na conversão do lead, handoff `telas/08-leads.md`
 * §"Converter em cliente": *"Plano: o interesse do lead; se for 'Ainda não
 * sei', cai em Mensal."*
 *
 * O interesse é texto livre vindo do formulário do site (`interestPlan`), não
 * um id — o site não conhece a tabela `plans`. Casa por nome do plano e, na
 * falta, pelo rótulo do ciclo ("Trimestral" → um plano `QUARTERLY`), que é o
 * vocabulário que o formulário usa.
 *
 * Função pura e testada de propósito: errar o plano aqui não dá erro nenhum,
 * dá uma assinatura com o preço do plano errado e uma cobrança emitida com o
 * valor errado no mesmo commit.
 */

export interface InterestPlanOption {
  id: string;
  name: string;
  cycle: string;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveInterestPlanId(
  plans: InterestPlanOption[],
  interestPlan: string | null | undefined,
): string {
  const wanted = normalize(interestPlan);

  if (wanted) {
    const byName = plans.find((plan) => normalize(plan.name) === wanted);
    if (byName) return byName.id;

    const byCycle = plans.find((plan) => normalize(CYCLE_LABELS[plan.cycle]) === wanted);
    if (byCycle) return byCycle.id;
  }

  // "Ainda não sei", interesse que não bate com nada, ou nenhum interesse.
  return plans.find((plan) => plan.cycle === 'MONTHLY')?.id ?? plans[0]?.id ?? '';
}
