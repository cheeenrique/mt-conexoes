import { RuleHeader } from './rule-header';
import { RuleStateBanner } from './rule-state-banner';
import { StepAxis } from './step-axis';
import { ChannelNote } from './channel-note';
import type { DunningRuleDTO, DunningStepDTO, PreviewChargeDTO, ReviewMessageDTO } from '../queries';

/**
 * Coluna de detalhe, na ordem do handoff: cabeçalho, faixa do estado, passos no
 * eixo do vencimento, canal padrão. A faixa fica logo abaixo do cabeçalho, não
 * no fim da página — é o aviso que decide se o operador pode ativar a régua.
 */
export function RuleDetail({
  rule,
  reviewMessages,
  charges,
  settings,
  channel,
  currentDefaultName,
  evaluableSubscriptions,
}: {
  rule: DunningRuleDTO & { steps: DunningStepDTO[] };
  reviewMessages: ReviewMessageDTO[];
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
  channel: { label: string; requiresApprovedTemplate: boolean } | null;
  currentDefaultName: string | null;
  evaluableSubscriptions: number;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <RuleHeader
        key={rule.id}
        rule={{
          id: rule.id,
          name: rule.name,
          status: rule.status,
          isDefault: rule.isDefault,
          activeStepCount: rule.steps.filter((step) => step.isActive).length,
        }}
        currentDefaultName={currentDefaultName}
        evaluableSubscriptions={evaluableSubscriptions}
      />
      <RuleStateBanner rule={{ id: rule.id, status: rule.status }} reviewMessages={reviewMessages} />
      <StepAxis ruleId={rule.id} steps={rule.steps} charges={charges} settings={settings} />
      <ChannelNote channel={channel} />
    </section>
  );
}
