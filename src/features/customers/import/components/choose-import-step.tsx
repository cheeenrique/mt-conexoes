'use client';

import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * Etapa 1: fornecedor + arquivo. Mostra o nome do arquivo assim que escolhido
 * — hoje o `<input type="file">` nu não dava essa confirmação, e o operador
 * não tinha como saber se tinha pego o arquivo certo antes de enviar.
 */
export function ChooseImportStep({
  suppliers,
  supplierId,
  file,
  submitting,
  onSupplierChange,
  onFileChange,
  onSubmit,
}: {
  suppliers: { id: string; name: string }[];
  supplierId: string;
  file: File | null;
  submitting: boolean;
  onSupplierChange: (supplierId: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex max-w-lg flex-col gap-4"
    >
      <p className="text-sm text-foreground-muted">
        Um arquivo por fornecedor (.xlsx ou .xlsm). Linha sem telefone é aceita; nada é gravado nesta etapa — a
        próxima tela mostra o que entraria antes de confirmar.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="import-supplier">Fornecedor</Label>
        {suppliers.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Nenhum fornecedor cadastrado ainda. Cadastre um em Fornecedores antes de importar.
          </p>
        ) : (
          <Select
            id="import-supplier"
            value={supplierId}
            onValueChange={onSupplierChange}
            options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            placeholder="Selecionar fornecedor"
          />
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="import-file">Arquivo</Label>
        <input
          id="import-file"
          type="file"
          accept=".xlsx,.xlsm"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className="flex h-11 w-full items-center rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground file:mr-3 file:rounded-badge file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-foreground"
        />
        {file && <p className="text-sm text-foreground-muted">Arquivo selecionado: {file.name}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" nativeButton={false} render={<Link href="/customers" />}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || !file || !supplierId}>
          {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ArrowRight aria-hidden="true" />}
          {submitting ? 'Lendo planilha...' : 'Conferir'}
        </Button>
      </div>
    </form>
  );
}
