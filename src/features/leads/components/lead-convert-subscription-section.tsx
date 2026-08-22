'use client';

import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { DrawerSection } from '@/components/ui/drawer';
import type { ConvertLeadFormInput } from '../schema';
import type { ConvertPlanOption, ConvertSupplierOption } from './convert-options';
import { LeadConvertFields } from './lead-convert-fields';

/**
 * Cartão "Assinatura" ou o aviso que o substitui, quando o WhatsApp do lead já
 * é de um cliente: converter só vincula o lead (handoff 08 §"Converter em
 * cliente" regra 2), então mostrar os campos de assinatura enganaria o
 * operador sobre o que vai acontecer.
 */
export function LeadConvertSubscriptionSection({
  register,
  control,
  errors,
  setValue,
  plans,
  suppliers,
  existingByPhone,
}: {
  register: UseFormRegister<ConvertLeadFormInput>;
  control: Control<ConvertLeadFormInput>;
  errors: FieldErrors<ConvertLeadFormInput>;
  setValue: UseFormSetValue<ConvertLeadFormInput>;
  plans: ConvertPlanOption[];
  suppliers: ConvertSupplierOption[];
  existingByPhone: { id: string; name: string } | null;
}) {
  if (existingByPhone) {
    return (
      <Alert tone="warning">
        Esse WhatsApp já é de {existingByPhone.name}. Ao converter, o lead só será vinculado a esse cadastro —
        nenhuma assinatura nova é criada aqui.
      </Alert>
    );
  }

  return (
    <>
      <DrawerSection label="Assinatura">
        <LeadConvertFields
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          plans={plans}
          suppliers={suppliers}
        />
      </DrawerSection>
      <Alert tone="info">
        Se já existir cliente com este WhatsApp, o lead é vinculado ao cadastro dele e nenhuma assinatura nova é
        criada.
      </Alert>
    </>
  );
}
