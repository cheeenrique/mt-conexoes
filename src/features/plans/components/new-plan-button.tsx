'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanDrawer } from './plan-drawer';

export function NewPlanButton({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Novo plano
      </Button>
      <PlanDrawer open={open} onOpenChange={setOpen} plan={null} suppliers={suppliers} />
    </>
  );
}
