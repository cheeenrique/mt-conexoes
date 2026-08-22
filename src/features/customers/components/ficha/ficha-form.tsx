'use client';

import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DrawerBody, DrawerFooter } from '@/components/ui/drawer';
import { customerFichaSchema } from '../../ficha-schema';
import type { CustomerFichaFormInput, CustomerFichaFormValues } from '../../ficha-schema';
import type { FichaPlanOption, FindCustomerByPhone, SaveCustomerFicha, SaveCustomerIds, SaveCustomerOk } from '../../ficha-types';
import { FichaFormAccess } from './ficha-form-access';
import { FichaFormCustomer } from './ficha-form-customer';
import { FichaFormSubscription } from './ficha-form-subscription';

/**
 * Modo edição/criação da ficha (handoff `telas/04-ficha-cliente.md`): os três
 * cartões, o rodapé "Salvar alterações" + "Cancelar", e a faixa vermelha no
 * topo **com os campos preservados** quando o servidor recusa.
 *
 * O mesmo formulário serve para criar: a diferença é só o que chega em
 * `defaultValues` e em `ids`. É isso que faz a conversão de lead abrir "o
 * drawer de novo cliente já preenchido" do handoff 08, sem uma segunda tela.
 */
export function FichaForm({
  defaultValues,
  plans,
  suppliers,
  ids,
  save,
  onSaved,
  onCancel,
  submitLabel,
  banner,
  hideSubscription,
  checkPhone,
}: {
  defaultValues: CustomerFichaFormInput;
  plans: FichaPlanOption[];
  suppliers: { id: string; name: string }[];
  ids: SaveCustomerIds;
  save: SaveCustomerFicha;
  onSaved: (result: SaveCustomerOk) => void;
  onCancel: () => void;
  submitLabel: string;
  banner?: ReactNode;
  /** Cliente que já existe só é vinculado — não ganha assinatura nova. */
  hideSubscription?: boolean;
  /** "Essa pessoa já está na base?" — avisa antes de submeter, não depois do erro. */
  checkPhone?: FindCustomerByPhone;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFichaFormInput, unknown, CustomerFichaFormValues>({
    resolver: zodResolver(customerFichaSchema),
    defaultValues,
  });

  async function onSubmit(values: CustomerFichaFormValues) {
    const result = await save(values, ids);
    if ('error' in result) {
      // Nada de `reset()`: o handoff pede a faixa vermelha "com os campos
      // preservados". Perder o que foi digitado é o pior desfecho possível.
      setFailure(result.error.message);
      return;
    }
    setFailure(null);
    onSaved(result);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
      <DrawerBody>
        {failure && <Alert tone="danger">{failure}</Alert>}
        {banner}
        <FichaFormCustomer
          register={register}
          control={control}
          errors={errors}
          checkPhone={checkPhone}
          ownCustomerId={ids.customerId}
        />
        {!hideSubscription && (
          <>
            <FichaFormSubscription
              register={register}
              control={control}
              errors={errors}
              setValue={setValue}
              plans={plans}
              suppliers={suppliers}
              priceCents={watch('priceCents')}
              costCents={watch('costCents')}
            />
            <FichaFormAccess register={register} errors={errors} />
          </>
        )}
      </DrawerBody>
      <DrawerFooter>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          {isSubmitting ? 'Salvando…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
      </DrawerFooter>
    </form>
  );
}
