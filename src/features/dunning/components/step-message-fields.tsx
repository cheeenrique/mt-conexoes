'use client';

import type { UseFormRegisterReturn } from 'react-hook-form';
import { DrawerSection } from '@/components/ui/drawer';
import { TemplateEditor } from './template-editor';
import { TemplatePreview } from './template-preview';
import type { PreviewChargeDTO } from '../queries';

const FIELD = 'h-11 rounded-badge border border-border bg-surface-elevated px-3 text-sm text-foreground';

/** Texto do passo + prévia com dados reais. Só existe quando a ação é Mensagem. */
export function StepMessageFields({
  templateBody,
  registration,
  onValueChange,
  error,
  metaTemplateNameRegistration,
  charges,
  settings,
}: {
  templateBody: string;
  registration: UseFormRegisterReturn;
  onValueChange: (next: string) => void;
  error?: string;
  metaTemplateNameRegistration: UseFormRegisterReturn;
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
      <DrawerSection label="Template aprovado na Meta (opcional)">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
          Nome do template
          <input
            id="metaTemplateName"
            type="text"
            placeholder="ex.: renovacao_hoje"
            {...metaTemplateNameRegistration}
            className={`${FIELD} font-mono tabular-mono`}
          />
        </label>
        <p className="text-xs leading-relaxed text-foreground-muted">
          Nome do template já aprovado na Meta para este passo. Passo sem isto, num
          canal que exige template aprovado, é pulado automaticamente em vez de tentar
          um texto livre que a Meta recusaria. O Evolution não exige isto e continua
          mandando o texto acima normalmente.
        </p>
        <p className="text-xs leading-relaxed text-foreground-muted">
          {'⚠️ Os valores enviados à Meta seguem a ordem de aparição das variáveis no texto acima ({{1}}, {{2}}...) — é assim que a Meta valida os parâmetros do template aprovado. Escreva o texto acima na mesma ordem que você submeteu para aprovação na Meta, com o mesmo número de variáveis.'}
        </p>
      </DrawerSection>
    </>
  );
}
