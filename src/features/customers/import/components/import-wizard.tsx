'use client';

import { useState } from 'react';
import { toastError } from '@/lib/toast';
import type { ImportCustomersResult, ImportPlanDTO, ImportSummaryDTO, PreviewCustomersImportResult } from '../types';
import { ChooseImportStep } from './choose-import-step';
import { PreviewImportStep } from './preview-import-step';
import { ImportResultStep } from './import-result-step';

type PreviewImport = (formData: FormData) => Promise<PreviewCustomersImportResult>;
type ConfirmImport = (formData: FormData) => Promise<ImportCustomersResult>;

type Step =
  | { name: 'choose' }
  | { name: 'preview'; fileName: string; plan: ImportPlanDTO }
  | { name: 'result'; summary: ImportSummaryDTO };

function buildFormData(supplierId: string, file: File): FormData {
  const formData = new FormData();
  formData.set('supplierId', supplierId);
  formData.set('file', file);
  return formData;
}

/**
 * Orquestra as duas etapas. O arquivo fica só no navegador (`useState`) e é
 * reenviado na confirmação — a prévia não guarda nada no servidor (design da
 * Etapa 2, §Fluxo). "Voltar" preserva fornecedor e arquivo escolhidos.
 */
export function ImportWizard({
  suppliers,
  timezone,
  previewImport,
  confirmImport,
}: {
  suppliers: { id: string; name: string }[];
  timezone: string;
  previewImport: PreviewImport;
  confirmImport: ConfirmImport;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>({ name: 'choose' });
  const [submitting, setSubmitting] = useState(false);

  async function handlePreview() {
    if (!file || !supplierId) return;
    setSubmitting(true);
    const result = await previewImport(buildFormData(supplierId, file));
    setSubmitting(false);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setStep({ name: 'preview', fileName: result.fileName, plan: result.plan });
  }

  async function handleConfirm() {
    if (!file || !supplierId) return;
    setSubmitting(true);
    const result = await confirmImport(buildFormData(supplierId, file));
    setSubmitting(false);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setStep({ name: 'result', summary: result.summary });
  }

  function handleRestart() {
    setSupplierId('');
    setFile(null);
    setStep({ name: 'choose' });
  }

  if (step.name === 'preview') {
    return (
      <PreviewImportStep
        fileName={step.fileName}
        plan={step.plan}
        timezone={timezone}
        submitting={submitting}
        onBack={() => setStep({ name: 'choose' })}
        onConfirm={handleConfirm}
      />
    );
  }

  if (step.name === 'result') {
    return <ImportResultStep summary={step.summary} onRestart={handleRestart} />;
  }

  return (
    <ChooseImportStep
      suppliers={suppliers}
      supplierId={supplierId}
      file={file}
      submitting={submitting}
      onSupplierChange={setSupplierId}
      onFileChange={setFile}
      onSubmit={handlePreview}
    />
  );
}
