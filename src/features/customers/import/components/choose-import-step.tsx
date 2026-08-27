'use client';

import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SpreadsheetDropzone } from './spreadsheet-dropzone';

/**
 * Etapa 1: fornecedor + arquivo.
 *
 * O campo de arquivo era um `<input type="file">` nu, com o botão cinza do
 * navegador: não dava para arrastar, não confirmava o que tinha sido escolhido
 * e destoava do resto do painel. Virou `SpreadsheetDropzone`, que aceita
 * arrastar ou clicar e mostra nome e tamanho depois da escolha.
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
        Linha sem telefone é aceita. Nada é gravado nesta etapa — a próxima tela mostra o que entraria antes de
        confirmar.
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
        <SpreadsheetDropzone id="import-file" file={file} onFileChange={onFileChange} disabled={submitting} />
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
