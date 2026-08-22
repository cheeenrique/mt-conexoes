'use client';

import type { UseFormRegisterReturn } from 'react-hook-form';
import { DrawerSection } from '@/components/ui/drawer';
import { TemplateEditor } from './template-editor';
import { TemplatePreview } from './template-preview';
import type { PreviewChargeDTO } from '../queries';

/** Texto do passo + prévia com dados reais. Só existe quando a ação é Mensagem. */
export function StepMessageFields({
  templateBody,
  registration,
  onValueChange,
  error,
  charges,
  settings,
}: {
  templateBody: string;
  registration: UseFormRegisterReturn;
  onValueChange: (next: string) => void;
  error?: string;
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  return (
    <>
      <DrawerSection label="Texto da mensagem">
        <TemplateEditor
          value={templateBody}
          registration={registration}
          onValueChange={onValueChange}
          error={error}
        />
      </DrawerSection>
      <DrawerSection label="Prévia com dados reais">
        <TemplatePreview templateBody={templateBody} charges={charges} settings={settings} />
      </DrawerSection>
    </>
  );
}
