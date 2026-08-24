'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerSection, DrawerFooter } from '@/components/ui/drawer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { supplierSchema } from '../schema';
import { createSupplierAction, updateSupplierAction, getBulkAdjustPreviewAction } from '../actions';
import { BulkAdjustDialog } from './bulk-adjust-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SupplierDTO, BulkAdjustPreviewRow } from '../queries';

type FormValues = z.input<typeof supplierSchema>;

export function SupplierDrawer({
  open,
  onOpenChange,
  supplier,
  marginAlertPercent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDTO | null;
  marginAlertPercent: string;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    values: supplier
      ? { name: supplier.name, unitCostCents: supplier.unitCostCents, notes: supplier.notes ?? '', isActive: supplier.isActive }
      : { name: '', unitCostCents: '0', notes: '', isActive: true },
  });

  const [bulkRows, setBulkRows] = useState<BulkAdjustPreviewRow[] | null>(null);
  const [bulkCost, setBulkCost] = useState<{ oldUnitCostCents: string; newUnitCostCents: string } | null>(null);

  async function onSubmit(values: FormValues) {
    const result = supplier
      ? await updateSupplierAction(supplier.id, values)
      : await createSupplierAction(values);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(supplier ? messages.suppliers.updated : messages.suppliers.created);
    reset();
    onOpenChange(false);

    if (supplier && BigInt(values.unitCostCents) > BigInt(supplier.unitCostCents)) {
      const preview = await getBulkAdjustPreviewAction(supplier.id, marginAlertPercent);
      if ('ok' in preview && preview.rows.length > 0) {
        setBulkRows(preview.rows);
        setBulkCost({ oldUnitCostCents: supplier.unitCostCents, newUnitCostCents: values.unitCostCents });
      } else if ('error' in preview) {
        toastError(preview.error);
      }
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent size="default" aria-label={supplier ? 'Editar fornecedor' : 'Novo fornecedor'}>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
            <DrawerHeader
              title={supplier ? 'Editar fornecedor' : 'Novo fornecedor'}
              subtitle={
                supplier
                  ? `${supplier.activeSubscriptionsCount} assinatura${supplier.activeSubscriptionsCount === 1 ? '' : 's'} ativa${supplier.activeSubscriptionsCount === 1 ? '' : 's'} com este fornecedor`
                  : 'O custo padrão só sugere valor na criação de uma assinatura.'
              }
            />
            <DrawerBody>
              <DrawerSection label="Dados do fornecedor">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
                  {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unitCostCents">Custo padrão por ciclo</Label>
                  <Controller
                    control={control}
                    name="unitCostCents"
                    render={({ field }) => (
                      <CurrencyInput id="unitCostCents" value={field.value} onValueChange={field.onChange} />
                    )}
                  />
                  {errors.unitCostCents && <p className="mt-1 text-sm text-danger">{errors.unitCostCents.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Observações</Label>
                  <textarea
                    id="notes"
                    {...register('notes')}
                    className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </DrawerSection>
              {supplier && (
                <DrawerSection label="Status">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isActive" {...register('isActive')} className="h-4 w-4" />
                    <Label htmlFor="isActive">Ativo</Label>
                  </div>
                  {supplier.activeSubscriptionsCount > 0 && (
                    <p className="text-xs text-foreground-muted">Desativar não cancela nenhuma assinatura ativa.</p>
                  )}
                  <Alert tone="warning" className="text-xs text-foreground-muted">
                    <p>
                      Mudar o custo padrão não altera nenhuma assinatura sozinho. Ao salvar, mostramos quantas caem
                      abaixo do limite de margem e você decide o reajuste em lote.
                    </p>
                    <p className="mt-1.5">
                      O reajuste vale da próxima cobrança em diante. Cobranças já emitidas não mudam.
                    </p>
                  </Alert>
                </DrawerSection>
              )}
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
      {bulkRows && bulkCost && supplier && (
        <BulkAdjustDialog
          open={true}
          onOpenChange={(open) => !open && setBulkRows(null)}
          supplierId={supplier.id}
          oldUnitCostCents={bulkCost.oldUnitCostCents}
          newUnitCostCents={bulkCost.newUnitCostCents}
          rows={bulkRows}
        />
      )}
    </>
  );
}
