'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

const TABS = [
  { key: 'subscriptions', label: 'Assinaturas', disabled: false, title: undefined },
  { key: 'charges', label: 'Cobranças', disabled: false, title: undefined },
  { key: 'messages', label: 'Mensagens', disabled: false, title: undefined },
] as const;

export function CustomerTabs({
  customerId,
  aba,
  children,
}: {
  customerId: string;
  aba: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {TABS.map((tab) =>
          tab.disabled ? (
            <span
              key={tab.key}
              title={tab.title}
              className="flex h-10 items-center rounded-sm border border-border px-4 text-sm font-semibold text-foreground-disabled opacity-50"
            >
              {tab.label}
            </span>
          ) : (
            <Link
              key={tab.key}
              href={`/customers/${customerId}?aba=${tab.key}`}
              className={`flex h-10 items-center rounded-sm px-4 text-sm font-semibold ${aba === tab.key ? 'bg-brand text-background' : 'border border-border text-foreground-muted'}`}
            >
              {tab.label}
            </Link>
          ),
        )}
      </div>
      {children}
    </div>
  );
}
