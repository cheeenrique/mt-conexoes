import { Layers } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { listPlans } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { PlanTable } from '@/features/plans/components/plan-table';
import { NewPlanButton } from '@/features/plans/components/new-plan-button';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = (PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? Number(params.perPage)
    : 8) as 8 | 12 | 20;

  const [{ rows, total }, suppliers] = await Promise.all([
    listPlans({ page, perPage }),
    listActiveSuppliersForSelect(),
  ]);

  return (
    <AppShell title="Planos" icon={<Layers size={22} />} primaryAction={<NewPlanButton suppliers={suppliers} />}>
      <PlanTable rows={rows} total={total} page={page} perPage={perPage} suppliers={suppliers} />
    </AppShell>
  );
}
