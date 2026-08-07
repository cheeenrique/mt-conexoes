'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomerDrawer } from './customer-drawer';

export function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo cliente</Button>
      <CustomerDrawer open={open} onOpenChange={setOpen} customer={null} />
    </>
  );
}
