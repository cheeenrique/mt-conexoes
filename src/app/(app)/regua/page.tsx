import { AppShell } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { getDefaultRuleWithSteps, listRecentChargesForPreview, listReviewPreview } from '@/features/dunning/queries';
import { getSettings } from '@/features/settings/queries';
import { StepList } from '@/features/dunning/components/step-list';
import { ReviewPreview } from '@/features/dunning/components/review-preview';
import { DUNNING_STATUS_LABELS } from '@/lib/labels';

export default async function DunningRulePage() {
  const [rule, charges, settings, preview] = await Promise.all([
    getDefaultRuleWithSteps(),
    listRecentChargesForPreview(),
    getSettings(),
    listReviewPreview(),
  ]);

  return (
    <AppShell title="Régua de cobrança">
      <div className="mb-4 flex items-center gap-2">
        <p className="text-sm text-foreground-muted">{rule.name}</p>
        <StatusBadge tone={rule.status === 'ACTIVE' ? 'success' : 'warning'}>
          {DUNNING_STATUS_LABELS[rule.status] ?? rule.status}
        </StatusBadge>
      </div>
      {rule.status === 'REVIEW' && <ReviewPreview preview={preview} />}
      <StepList
        ruleId={rule.id}
        steps={rule.steps}
        charges={charges}
        settings={{ timezone: settings.timezone, pixKey: settings.pixKey, businessName: settings.businessName }}
      />
    </AppShell>
  );
}
