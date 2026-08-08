'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SendMessageDialog } from './send-message-dialog';

export function SendMessageButton({ recipients }: { recipients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  if (recipients.length === 0) return null;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Enviar mensagem ({recipients.length})
      </Button>
      <SendMessageDialog open={open} onOpenChange={setOpen} recipients={recipients} />
    </>
  );
}
