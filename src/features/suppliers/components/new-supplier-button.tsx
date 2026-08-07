'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SupplierDrawer } from './supplier-drawer';

export function NewSupplierButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo fornecedor</Button>
      <SupplierDrawer open={open} onOpenChange={setOpen} supplier={null} />
    </>
  );
}
