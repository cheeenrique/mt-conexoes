'use client';

import { useState, type FormEvent } from 'react';
import { Check, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCents } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { ImportCustomersResult, ImportSummaryDTO } from '../import/types';

type ImportCustomers = (formData: FormData) => Promise<ImportCustomersResult>;

/**
 * Importação da planilha de clientes (Etapa 1c) pela tela — a ação chega por
 * prop porque a Server Action mora em `app/`, a única camada que pode cruzar
 * `customers` e `subscriptions` (mesma razão de `saveFicha` em
 * `NewCustomerButton`).
 */
export function ImportCustomersDialog({
  suppliers,
  importCustomers,
}: {
  suppliers: { id: string; name: string }[];
  importCustomers: ImportCustomers;
}) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummaryDTO | null>(null);

  /**
   * Único caminho de fechamento. O `onOpenChange` do diálogo só dispara pelo
   * Esc, pelo clique no fundo e pelo X — os botões "Cancelar" e "Fechar"
   * chamavam `setOpen(false)` direto e pulavam a limpeza, então reabrir trazia
   * de volta o resultado da importação anterior. Quem fecha por qualquer via
   * passa por aqui.
   */
  function closeDialog() {
    setOpen(false);
    setSupplierId('');
    setFile(null);
    setSummary(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !supplierId) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.set('supplierId', supplierId);
    formData.set('file', file);
    const result = await importCustomers(formData);
    setSubmitting(false);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setSummary(result.summary);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload aria-hidden="true" />
        Importar planilha
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else closeDialog();
        }}
      >
        <DialogContent className="w-[480px] bg-surface">
          <DialogHeader>
            <DialogTitle>Importar planilha de clientes</DialogTitle>
            {!summary && (
              <p className="text-sm text-foreground-muted">
                Um arquivo por fornecedor (.xlsx ou .xlsm). Linha sem telefone é aceita; o que for recusado aparece
                listado ao final, com o motivo.
              </p>
            )}
          </DialogHeader>

          {summary ? (
            <ImportSummaryView summary={summary} onClose={closeDialog} />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                    onValueChange={setSupplierId}
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
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="flex h-11 w-full items-center rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground file:mr-3 file:rounded-badge file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-foreground"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || !file || !supplierId}>
                  {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                  {submitting ? 'Importando...' : 'Importar'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportSummaryView({ summary, onClose }: { summary: ImportSummaryDTO; onClose: () => void }) {
  const phoneWarnings = summary.imported.filter((row) => row.hasPhoneWarning);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Linhas" value={summary.totalRows} />
        <SummaryStat label="Importadas" value={summary.imported.length} />
        <SummaryStat label="Já existiam" value={summary.skipped.length} />
        <SummaryStat label="Recusadas" value={summary.rejected.length} />
      </div>
      <p className="text-sm text-foreground-muted">Soma importada: {formatCents(summary.importedTotalCents)}</p>

      {phoneWarnings.length > 0 && (
        <div>
          <p className="text-sm font-medium text-foreground">Importadas com ressalva de telefone</p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-sm text-foreground-muted">
            {phoneWarnings.map((row) => (
              <li key={row.identifier}>{row.identifier}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.rejected.length > 0 && (
        <div>
          <p className="text-sm font-medium text-danger">Recusadas</p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-sm text-foreground-muted">
            {summary.rejected.map((row, index) => (
              <li key={`${row.identifier}-${index}`}>
                {row.identifier}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button type="button" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface-elevated px-3 py-2">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
