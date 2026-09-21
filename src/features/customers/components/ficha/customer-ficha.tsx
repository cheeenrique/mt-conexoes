'use client';

import type { ReactNode } from 'react';
import { FichaProfit } from './ficha-profit';
import { FichaSubscription } from './ficha-subscription';
import { FichaAccess } from './ficha-access';
import { FichaPayments } from './ficha-payments';
import { FichaMessages } from './ficha-messages';
import { FichaEvents } from './ficha-events';
import { FichaOptOut } from './ficha-opt-out';
import { CustomerAnonymizeSection } from './customer-anonymize-section';
import type { AnonymizeCustomer, CustomerFichaData, ResumeMessaging, RevealAccessPassword } from '../../ficha-types';

/**
 * Corpo da ficha do cliente, na ordem do handoff 04. O mesmo componente serve
 * ao drawer de `?cliente=<id>` e à rota `/customers/<id>` — o cabeçalho e o
 * rodapé ficam com quem o monta, porque a gaveta e a página têm chrome
 * diferente e o miolo é que precisa ser único.
 */
export function CustomerFicha({
  data,
  revealPassword,
  subscriptionAction,
  anonymizeCustomer,
  resumeMessaging,
}: {
  data: CustomerFichaData;
  revealPassword: RevealAccessPassword;
  subscriptionAction?: ReactNode;
  /** Desfaz o opt-out (T5). Ausente = o aviso aparece sem o botão. */
  resumeMessaging?: ResumeMessaging;
  /** Ausente = seção de exclusão não aparece (ex.: tela que ainda não a fiou). */
  anonymizeCustomer?: AnonymizeCustomer;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FichaOptOut
        customerId={data.id}
        optedOut={data.optedOut}
        optedOutAt={data.optedOutAt}
        optedOutReason={data.optedOutReason}
        timezone={data.timezone}
        resumeMessaging={resumeMessaging}
      />
      <FichaProfit
        billedCents={data.billedCents}
        receivedCents={data.receivedCents}
        costCents={data.costCents}
        renewalCount={data.renewalCount}
        sinceAt={data.sinceAt}
        timezone={data.timezone}
      />
      <FichaSubscription
        subscription={data.subscription}
        timezone={data.timezone}
        action={subscriptionAction}
      />
      {data.subscription && (
        <FichaAccess
          subscriptionId={data.subscription.id}
          accessUsername={data.subscription.accessUsername}
          hasAccessPassword={data.subscription.hasAccessPassword}
          revealPassword={revealPassword}
        />
      )}
      <FichaPayments payments={data.payments} timezone={data.timezone} />
      <FichaMessages messages={data.messages} timezone={data.timezone} />
      <FichaEvents events={data.events} timezone={data.timezone} />
      {data.notes && (
        <section className="rounded border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">Observações</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{data.notes}</p>
        </section>
      )}
      <CustomerAnonymizeSection
        customerId={data.id}
        customerName={data.name}
        anonymized={data.situation === 'ANONYMIZED'}
        onAnonymize={anonymizeCustomer}
      />
    </div>
  );
}
