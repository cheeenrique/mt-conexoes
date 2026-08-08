'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { customerSchema } from '../schema';
import { createCustomerAction, updateCustomerAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { CustomerDTO } from '../queries';

type FormValues = z.infer<typeof customerSchema>;

export function CustomerDrawer({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDTO | null;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(customerSchema),
    values: customer
      ? { name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', document: customer.document ?? '', notes: customer.notes ?? '' }
      : { name: '', phone: '', email: '', document: '', notes: '' },
  });

  async function onSubmit(values: FormValues) {
    const result = customer
      ? await updateCustomerAction(customer.id, values)
      : await createCustomerAction(values);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(customer ? messages.customers.updated : messages.customers.created);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] bg-surface">
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput id="phone" value={field.value ?? ''} onValueChange={field.onChange} />
              )}
            />
            {errors.phone && <p className="mt-1 text-sm text-danger">{errors.phone.message}</p>}
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} className="h-11" />
            {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="document">Documento (CPF/CNPJ)</Label>
            <Input id="document" {...register('document')} className="h-11" />
          </div>
          <div>
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              {...register('notes')}
              className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
            />
          </div>
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
