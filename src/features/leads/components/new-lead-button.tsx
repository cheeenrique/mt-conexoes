'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2, Plus } from 'lucide-react';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { toastError, toastSuccess } from '@/lib/toast';
import { createLeadAction } from '../actions';
import { manualLeadSchema } from '../schema';

// `manualLeadSchema` transforma campo opcional vazio em `undefined`, então o
// que o formulário guarda (input) e o que a action recebe (output) são tipos
// diferentes. RHF precisa dos dois — com um só, o resolver não bate.
type FormInput = z.input<typeof manualLeadSchema>;
type FormOutput = z.output<typeof manualLeadSchema>;

/** Lead que não veio do formulário: indicação, ligação, grupo de WhatsApp. */
export function NewLeadButton() {
  const [open, setOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(manualLeadSchema),
    defaultValues: { name: '', phone: '', interestPlan: '', source: 'Indicação', note: '' },
  });

  async function onSubmit(values: FormOutput) {
    const result = await createLeadAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess('Lead registrado.');
    reset();
    setOpen(false);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Novo lead
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[560px] bg-surface">
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
            <DialogDescription>
              Telefone repetido não é bloqueado — a mesma pessoa pode aparecer duas vezes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-name">Nome</Label>
              <Input id="new-lead-name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
              {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-phone">WhatsApp</Label>
              <Controller
                control={control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput id="new-lead-phone" value={field.value} onValueChange={field.onChange} />
                )}
              />
              {errors.phone && <p className="text-sm text-danger">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-interest">Interesse</Label>
              <Input id="new-lead-interest" placeholder="Mensal, Trimestral…" {...register('interestPlan')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-source">Origem</Label>
              <Input id="new-lead-source" aria-invalid={!!errors.source} {...register('source')} className="h-11" />
              {errors.source && <p className="text-sm text-danger">{errors.source.message}</p>}
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
