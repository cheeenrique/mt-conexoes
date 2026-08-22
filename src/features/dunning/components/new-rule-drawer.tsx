'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerSection } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/lib/toast';
import { createDunningRuleSchema } from '../schema';
import { createDunningRuleAction } from '../actions';
import type { DunningRuleListItemDTO } from '../queries';

type FormValues = z.input<typeof createDunningRuleSchema>;

const FIELD = 'h-11 rounded-badge border border-border bg-surface-elevated px-3 text-sm text-foreground';

/**
 * ⚠️ Sem vínculo régua↔plano. Régua se aplica pelo padrão do sistema, não por
 * plano — `telas/07-reguas.md` e `telas/10-planos.md`. O README do handoff diz o
 * contrário; os documentos de tela são mais específicos e o schema segue eles.
 */
export function NewRuleDrawer({
  open,
  onOpenChange,
  rules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: DunningRuleListItemDTO[];
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createDunningRuleSchema),
    defaultValues: { name: '', stepsSource: 'suggested', copyFromRuleId: rules[0]?.id },
  });

  async function onSubmit(values: FormValues) {
    const result = await createDunningRuleAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess('Régua criada em rascunho.');
    onOpenChange(false);
    router.push(`/regua?regua=${result.data.ruleId}`);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent width={560}>
        <DrawerHeader
          title="Nova régua"
          subtitle="Nasce em rascunho: o motor nem avalia até você mandar para revisão."
        />
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody>
            <DrawerSection label="Identificação">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
                Nome da régua
                <input {...register('name')} placeholder="Mensal padrão" maxLength={60} className={FIELD} />
              </label>
              {errors.name && <p className="text-[13px] text-danger">{errors.name.message}</p>}
              <span className="text-xs leading-snug text-foreground-muted">
                Só a régua marcada como padrão é avaliada pelo motor. Criar uma nova não tira a padrão de hoje: isso é
                uma ação separada, com confirmação.
              </span>
            </DrawerSection>

            <DrawerSection label="Passos">
              <span className="text-[13px] leading-relaxed text-foreground-muted">
                Comece pela sequência sugerida (D-5, D-2, D0, D+1, D+3 e suspensão em D+5), copie os passos de uma
                régua que já existe, ou monte do zero no eixo.
              </span>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
                Como começar
                <select {...register('stepsSource')} className={FIELD}>
                  <option value="suggested">Começar com a régua sugerida</option>
                  <option value="copy">Copiar os passos de outra régua</option>
                  <option value="empty">Montar do zero</option>
                </select>
              </label>
              {watch('stepsSource') === 'copy' && (
                <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
                  Copiar de
                  <select {...register('copyFromRuleId')} className={FIELD}>
                    {rules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name} ({rule.stepCount} passos)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {errors.copyFromRuleId && <p className="text-[13px] text-danger">{errors.copyFromRuleId.message}</p>}
            </DrawerSection>
          </DrawerBody>

          <DrawerFooter>
            <Button type="submit" size="lg" className="min-w-[200px] flex-1" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              Criar em rascunho
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-w-[140px] flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
