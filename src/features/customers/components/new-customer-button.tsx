'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader } from '@/components/ui/drawer';
import { toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { EMPTY_CUSTOMER_FICHA_FORM } from '../ficha-schema';
import { FichaForm } from './ficha/ficha-form';
import type { FichaPlanOption, FindCustomerByPhone, SaveCustomerFicha } from '../ficha-types';

/**
 * "Novo cliente" (handoff 04: o mesmo drawer que vê e edita também cria — a
 * diferença é só `defaultValues` vazio e `ids` nulos). Um único gatilho para
 * as duas telas que hoje o mostram: o cabeçalho de Clientes e o estado vazio
 * da tabela.
 */
export function NewCustomerButton({
  plans,
  suppliers,
  saveFicha,
  checkPhone,
}: {
  plans: FichaPlanOption[];
  suppliers: { id: string; name: string }[];
  saveFicha: SaveCustomerFicha;
  checkPhone?: FindCustomerByPhone;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Novo cliente
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent size="lg" aria-label="Novo cliente">
          <DrawerHeader title="Novo cliente" />
          <FichaForm
            defaultValues={EMPTY_CUSTOMER_FICHA_FORM}
            plans={plans}
            suppliers={suppliers}
            ids={{ customerId: null, subscriptionId: null }}
            save={saveFicha}
            checkPhone={checkPhone}
            submitLabel="Cadastrar cliente"
            onCancel={() => setOpen(false)}
            onSaved={() => {
              toastSuccess(messages.customers.created);
              setOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>
    </>
  );
}
