'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDTO | null;
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
      const preview = await getBulkAdjustPreviewAction(supplier.id);
      if ('ok' in preview && preview.rows.length > 0) {
        setBulkRows(preview.rows);
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[520px] bg-surface">
          <DialogHeader>
            <DialogTitle>{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
              {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
            </div>
            <div>
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
            <div>
              <Label htmlFor="notes">Observações</Label>
              <textarea
                id="notes"
                {...register('notes')}
                className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
              />
            </div>
            {supplier && (
              <>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isActive" {...register('isActive')} className="h-4 w-4" />
                  <Label htmlFor="isActive">Ativo</Label>
                </div>
                <p className="text-xs text-foreground-muted">
                  Mudar o custo não reajusta assinatura existente sozinho.
                </p>
              </>
            )}
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {bulkRows && supplier && (
        <BulkAdjustDialog
          open={bulkRows.length > 0}
          onOpenChange={(open) => !open && setBulkRows(null)}
          supplierId={supplier.id}
          rows={bulkRows}
        />
      )}
    </>
  );
}
