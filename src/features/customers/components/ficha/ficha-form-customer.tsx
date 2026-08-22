'use client';

import { useState } from 'react';
import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { DrawerSection } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select } from '@/components/ui/select';
import { FichaField } from './ficha-field';
import type { CustomerFichaFormInput } from '../../ficha-schema';
import type { FindCustomerByPhone } from '../../ficha-types';

/**
 * Cartão "Cliente" do modo edição (handoff 04): Nome, WhatsApp (mono),
 * Situação. E-mail, documento e observações continuam aqui porque já eram
 * editáveis antes desta gaveta — tirá-los da tela seria perder o único lugar
 * onde se corrige um deles.
 */
export function FichaFormCustomer({
  register,
  control,
  errors,
  disabled,
  checkPhone,
  ownCustomerId,
}: {
  register: UseFormRegister<CustomerFichaFormInput>;
  control: Control<CustomerFichaFormInput>;
  errors: FieldErrors<CustomerFichaFormInput>;
  disabled?: boolean;
  /** "Essa pessoa já está na base?" — avisa antes de submeter, não depois do erro. */
  checkPhone?: FindCustomerByPhone;
  /** Telefone da própria pessoa não conta como duplicidade na edição. */
  ownCustomerId?: string | null;
}) {
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  async function handlePhoneBlur(phone: string) {
    setDuplicate(null);
    if (!checkPhone || !phone) return;
    const found = await checkPhone(phone);
    if (found && found.id !== ownCustomerId) setDuplicate(found);
  }

  return (
    <DrawerSection label="Cliente">
      <FichaField id="ficha-name" label="Nome" error={errors.name?.message}>
        <Input id="ficha-name" className="h-11" aria-invalid={!!errors.name} disabled={disabled} {...register('name')} />
      </FichaField>

      <FichaField id="ficha-phone" label="WhatsApp" error={errors.phone?.message}>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput
              id="ficha-phone"
              value={field.value ?? ''}
              onValueChange={field.onChange}
              onBlur={() => handlePhoneBlur(field.value ?? '')}
              disabled={disabled}
            />
          )}
        />
        {duplicate && (
          <Alert tone="warning" className="mt-2">
            Já existe um cliente com esse WhatsApp: {duplicate.name}.
          </Alert>
        )}
      </FichaField>

      <FichaField
        id="ficha-status"
        label="Situação"
        error={errors.status?.message}
        hint="Suspender muda a situação e avisa o operador; não corta o acesso no fornecedor."
      >
        <Select id="ficha-status" disabled={disabled} {...register('status')}>
          <option value="ACTIVE">Ativa</option>
          <option value="SUSPENDED">Suspensa</option>
        </Select>
      </FichaField>

      <FichaField id="ficha-email" label="E-mail" error={errors.email?.message}>
        <Input id="ficha-email" type="email" className="h-11" aria-invalid={!!errors.email} disabled={disabled} {...register('email')} />
      </FichaField>

      <FichaField id="ficha-document" label="Documento (CPF/CNPJ)">
        <Input id="ficha-document" className="h-11" disabled={disabled} {...register('document')} />
      </FichaField>

      <FichaField id="ficha-notes" label="Observações" error={errors.notes?.message}>
        <textarea
          id="ficha-notes"
          disabled={disabled}
          {...register('notes')}
          className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:opacity-60"
        />
      </FichaField>
    </DrawerSection>
  );
}
