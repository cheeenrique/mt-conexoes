'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SupplierDrawer } from './supplier-drawer';

export function NewSupplierButton({ marginAlertPercent }: { marginAlertPercent: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Novo fornecedor
      </Button>
      <SupplierDrawer open={open} onOpenChange={setOpen} supplier={null} marginAlertPercent={marginAlertPercent} />
    </>
  );
}
