import { GitCommitHorizontal, Route } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import {
  countEvaluableSubscriptions,
  getRuleWithSteps,
  listDunningRules,
  listRecentChargesForPreview,
  listReviewMessages,
} from '@/features/dunning/queries';
import { NewRuleButton } from '@/features/dunning/components/new-rule-button';
import { RuleList } from '@/features/dunning/components/rule-list';
import { RuleDetail } from '@/features/dunning/components/rule-detail';
import { getSettings } from '@/lib/settings';
import { getDefaultChannelSummary } from '@/features/messaging/queries';

export default async function DunningRulePage({
  searchParams,
}: {
  searchParams: Promise<{ regua?: string }>;
}) {
  const [{ regua }, rules, settings, defaultChannel, evaluableSubscriptions] = await Promise.all([
    searchParams,
    listDunningRules(),
    getSettings(),
    getDefaultChannelSummary(),
    countEvaluableSubscriptions(),
  ]);

  const newRuleButton = <NewRuleButton rules={rules} />;

  if (rules.length === 0) {
    return (
      <AppShell title="Réguas" icon={<GitCommitHorizontal size={22} />} primaryAction={newRuleButton}>
        <EmptyState
          icon={Route}
          title="Nenhuma régua de cobrança ainda"
          description="A régua é o que cobra sozinho no WhatsApp. Crie a primeira — ela nasce em rascunho e não envia nada até você revisar."
          action={newRuleButton}
        />
      </AppShell>
    );
  }

  // Seleção em `searchParams`, não em estado: o operador manda o link da régua
  // que está olhando e volta pelo histórico. Link com id morto cai na padrão.
  const selectedId = rules.find((rule) => rule.id === regua)?.id ?? rules[0].id;
  const [rule, charges, reviewMessages] = await Promise.all([
    getRuleWithSteps(selectedId),
    listRecentChargesForPreview(),
    listReviewMessages(selectedId),
  ]);

  return (
    <AppShell title="Réguas" icon={<GitCommitHorizontal size={22} />} primaryAction={newRuleButton}>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(220px,280px)_1fr]">
        <RuleList rules={rules} selectedId={selectedId} />
        {rule && (
          <RuleDetail
            rule={rule}
            reviewMessages={reviewMessages}
            charges={charges}
            settings={{ timezone: settings.timezone, pixKey: settings.pixKey, businessName: settings.businessName }}
            channel={defaultChannel}
            currentDefaultName={rules.find((item) => item.isDefault)?.name ?? null}
            evaluableSubscriptions={evaluableSubscriptions}
          />
        )}
      </div>
    </AppShell>
  );
}
