'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2, Plus } from 'lucide-react';
import type { z } from 'zod';
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from '@/components/ui/drawer';
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

const EMPTY_VALUES: FormInput = { name: '', phone: '', interestPlan: '', source: 'Indicação', note: '' };

/**
 * Formulário isolado num componente à parte para poder remontar por `key`
 * (ver `NewLeadButton` abaixo): o conteúdo da gaveta continua montado durante
 * a animação de fechamento, então sem essa troca de instância a segunda
 * abertura reusaria o `useForm` da primeira e devolveria o rascunho que o
 * operador acabou de descartar — mesma causa do bug corrigido no diálogo de
 * pagamento (103e83d) e na gaveta de passo da régua (`StepAxis`).
 */
function NewLeadForm({ onSaved }: { onSaved: () => void }) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(manualLeadSchema),
    defaultValues: EMPTY_VALUES,
  });

  async function onSubmit(values: FormOutput) {
    const result = await createLeadAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess('Lead registrado.');
    reset();
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DrawerBody>
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
          <Input
            id="new-lead-interest"
            placeholder="Mensal, Trimestral…"
            {...register('interestPlan')}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-lead-source">Origem</Label>
          <Input id="new-lead-source" aria-invalid={!!errors.source} {...register('source')} className="h-11" />
          {errors.source && <p className="text-sm text-danger">{errors.source.message}</p>}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          {isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </DrawerFooter>
    </form>
  );
}

/** Lead que não veio do formulário: indicação, ligação, grupo de WhatsApp. */
export function NewLeadButton() {
  const [open, setOpen] = useState(false);
  // Conta as aberturas para virar a `key` de `NewLeadForm` — sem ela, abrir,
  // digitar, fechar sem salvar e reabrir devolveria o texto digitado.
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <Button
        onClick={() => {
          setOpenCount((count) => count + 1);
          setOpen(true);
        }}
      >
        <Plus aria-hidden="true" />
        Novo lead
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent size="lg" aria-label="Novo lead">
          <DrawerHeader
            title="Novo lead"
            subtitle="Telefone repetido não é bloqueado — a mesma pessoa pode aparecer duas vezes."
          />
          <NewLeadForm key={openCount} onSaved={() => setOpen(false)} />
        </DrawerContent>
      </Drawer>
    </>
  );
}
