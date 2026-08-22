'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewRuleDrawer } from './new-rule-drawer';
import type { DunningRuleListItemDTO } from '../queries';

export function NewRuleButton({ rules }: { rules: DunningRuleListItemDTO[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Nova régua
      </Button>
      <NewRuleDrawer open={open} onOpenChange={setOpen} rules={rules} />
    </>
  );
}
