'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerSection } from '@/components/ui/drawer';
import { useStableWhileClosing } from '@/components/ui/use-stable-while-closing';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/lib/toast';
import { convertLeadSchema, type ConvertLeadFormInput, type ConvertLeadInput } from '../schema';
import { resolveInterestPlanId } from '../interest-plan';
import { useExistingCustomerByPhone } from '../use-existing-customer-by-phone';
import type { ConvertLead, FindCustomerByPhone } from '../convert-types';
import type { LeadListRowDTO } from '../queries';
import type { ConvertPlanOption, ConvertSupplierOption } from './convert-options';
import { LeadConvertSubscriptionSection } from './lead-convert-subscription-section';
import { LeadCustomerFields } from './lead-customer-fields';
import { LeadConvertedNotice } from './lead-converted-notice';
import { LeadStatusActions } from './lead-status-actions';

/** Observação pré-escrita do handoff 08 §"Converter em cliente". */
function prefilledNotes(lead: LeadListRowDTO): string {
  return `Veio do formulário do site, origem ${lead.source}.`;
}

function initialValues(lead: LeadListRowDTO, plans: ConvertPlanOption[]): ConvertLeadFormInput {
  const planId = resolveInterestPlanId(plans, lead.interestPlan);
  const plan = plans.find((option) => option.id === planId);
  return {
    leadId: lead.id,
    name: lead.name,
    phone: lead.phone,
    notes: prefilledNotes(lead),
    planId,
    supplierId: plan?.supplierId ?? '',
    priceCents: plan?.priceCents ?? '0',
    costCents: plan?.costCents ?? '0',
    cycle: plan?.cycle ?? 'MONTHLY',
    screens: 1,
  };
}

export function LeadDrawer({
  lead,
  open,
  onOpenChange,
  plans,
  suppliers,
  convertLead,
  checkPhone,
}: {
  lead: LeadListRowDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: ConvertPlanOption[];
  suppliers: ConvertSupplierOption[];
  convertLead: ConvertLead;
  /** "Esse WhatsApp já é de alguém?" — avisa antes de submeter, não depois. */
  checkPhone?: FindCustomerByPhone;
}) {
  const [linkedTo, setLinkedTo] = useState<{ customerId: string; name: string } | null>(null);

  // `lead` vira nulo assim que o fechamento começa (mesmo instante em que
  // `open` vira falso). Sem isto o `Drawer` desmontaria com ele — como um
  // `if (!lead) return null` fazia antes — e a animação de saída nunca
  // chegava a rodar.
  const shownLead = useStableWhileClosing(lead, (a, b) => a.id === b.id);

  const existingByPhone = useExistingCustomerByPhone(shownLead?.phone, checkPhone);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ConvertLeadFormInput, unknown, ConvertLeadInput>({
    resolver: zodResolver(convertLeadSchema),
    values: shownLead ? initialValues(shownLead, plans) : undefined,
  });

  async function onSubmit(values: ConvertLeadInput) {
    const result = await convertLead(values, { customerId: null, subscriptionId: null, leadId: values.leadId });
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    if (result.reusedExistingCustomer) {
      setLinkedTo({ customerId: result.customerId, name: result.customerName ?? '' });
      return;
    }
    toastSuccess('Cliente e assinatura criados a partir do lead.');
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) setLinkedTo(null); onOpenChange(next); }}>
      <DrawerContent size="lg" aria-label="Converter lead em cliente">
        {shownLead && (
          <>
            <DrawerHeader title="Converter em cliente" subtitle={`Lead de ${shownLead.source}`} />
            {linkedTo ? (
              <LeadConvertedNotice
                customerId={linkedTo.customerId}
                customerName={linkedTo.name}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <form onSubmit={handleSubmit(onSubmit)}>
                <DrawerBody>
                  <DrawerSection label="Cliente">
                    <LeadCustomerFields register={register} control={control} errors={errors} />
                  </DrawerSection>

                  <LeadConvertSubscriptionSection
                    register={register}
                    control={control}
                    errors={errors}
                    setValue={setValue}
                    plans={plans}
                    suppliers={suppliers}
                    existingByPhone={existingByPhone}
                  />

                  {shownLead.status !== 'CONVERTED' && (
                    <LeadStatusActions leadId={shownLead.id} status={shownLead.status} onDone={() => onOpenChange(false)} />
                  )}
                </DrawerBody>
                <DrawerFooter>
                  <Button type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                    {isSubmitting
                      ? 'Convertendo...'
                      : existingByPhone
                        ? `Vincular a ${existingByPhone.name}`
                        : 'Converter em cliente'}
                  </Button>
                  <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                </DrawerFooter>
              </form>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
