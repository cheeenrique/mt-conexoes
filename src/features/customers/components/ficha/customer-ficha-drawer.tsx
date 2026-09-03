'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { CUSTOMER_SITUATION_LABELS, CUSTOMER_SITUATION_TONES } from '@/lib/labels';
import { useCustomerParam } from '../../use-customer-param';
import { CustomerFicha } from './customer-ficha';
import { FichaForm } from './ficha-form';
import { fichaFormValues } from './ficha-form-values';
import { fichaSubtitle } from './ficha-subtitle';
import type { AnonymizeCustomer, FindCustomerByPhone, LoadCustomerFicha, RevealAccessPassword, SaveCustomerFicha } from '../../ficha-types';

type Loaded = { key: string; result: Awaited<ReturnType<LoadCustomerFicha>> };

/**
 * Gaveta da ficha, aberta por `?cliente=<id>` em qualquer tela que a monte.
 * Recebe as ações do servidor por prop porque quem pode compor queries de
 * várias features é `app/` — assim Início, Cobranças e Mensagens reaproveitam
 * esta mesma gaveta passando as mesmas ações.
 *
 * Modo leitura e edição vivem no **mesmo** drawer (handoff 04 §"Modo edição"):
 * o `pencil` do cabeçalho troca o corpo pelo `FichaForm`, sem navegar.
 */
export function CustomerFichaDrawer({
  loadFicha,
  revealPassword,
  saveFicha,
  checkPhone,
  anonymizeCustomer,
}: {
  loadFicha: LoadCustomerFicha;
  revealPassword: RevealAccessPassword;
  saveFicha: SaveCustomerFicha;
  checkPhone?: FindCustomerByPhone;
  anonymizeCustomer?: AnonymizeCustomer;
}) {
  const { customerId, closeCustomer } = useCustomerParam();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [editing, setEditing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [shownCustomerId, setShownCustomerId] = useState(customerId);

  // `customerId` vira nulo antes da animação de saída do painel terminar
  // (~150ms) — `shownCustomerId` só troca ao abrir um cliente novo, nunca ao
  // fechar, e é ele quem decide o conteúdo do `DrawerContent`.
  const displayCustomerId = customerId ?? shownCustomerId;

  // A chave carrega o cliente e o contador de recarga: o "carregando" sai da
  // comparação com ela, não de um setState dentro do efeito.
  const key = `${displayCustomerId ?? ''}#${reloadToken}`;

  // Cliente novo: nem edição nem faixa de sucesso do anterior sobrevivem.
  // Ajuste durante o render — padrão do React para "resetar estado quando
  // uma prop muda", sem cascata de `setState` dentro de `useEffect`.
  if (customerId && customerId !== shownCustomerId) {
    setShownCustomerId(customerId);
    setEditing(false);
    setSavedBanner(null);
  }

  useEffect(() => {
    if (!customerId) return;
    let current = true;
    loadFicha(customerId).then((result) => {
      if (current) setLoaded({ key, result });
    });
    return () => { current = false; };
  }, [customerId, loadFicha, key]);

  const result = loaded?.key === key ? loaded.result : null;
  const data = result && !('error' in result) ? result.data : null;
  const errorMessage = result && 'error' in result ? result.error.message : null;

  return (
    <Drawer open={!!customerId} onOpenChange={(next) => { if (!next) closeCustomer(); }}>
      <DrawerContent size="lg" aria-label="Ficha do cliente">
        {displayCustomerId && (
          <>
            <DrawerHeader title={data?.name ?? 'Carregando…'} subtitle={data ? fichaSubtitle(data) : undefined}>
              {data && !editing && (
                <>
                  <StatusBadge tone={CUSTOMER_SITUATION_TONES[data.situation]}>
                    {CUSTOMER_SITUATION_LABELS[data.situation]}
                  </StatusBadge>
                  <Button variant="outline" size="icon-lg" aria-label="Editar cliente" title="Editar cliente" onClick={() => setEditing(true)}>
                    <Pencil size={15} />
                  </Button>
                </>
              )}
            </DrawerHeader>

            {editing && data ? (
              <FichaForm
                defaultValues={fichaFormValues(data)}
                plans={data.plans}
                suppliers={data.suppliers}
                ids={{ customerId: data.id, subscriptionId: data.subscription?.id ?? null }}
                save={saveFicha}
                checkPhone={checkPhone}
                submitLabel="Salvar alterações"
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  setSavedBanner('Alterações salvas. O novo valor vale a partir da próxima cobrança gerada.');
                  setReloadToken((n) => n + 1);
                }}
              />
            ) : (
              <>
                <DrawerBody>
                  {savedBanner && <Alert tone="success">{savedBanner}</Alert>}
                  {!result && (
                    <>
                      <Skeleton className="h-32" />
                      <Skeleton className="h-40" />
                      <Skeleton className="h-40" />
                    </>
                  )}
                  {errorMessage && (
                    <div className="flex flex-col items-start gap-3 rounded border border-border bg-surface p-4">
                      <p className="text-sm text-danger">{errorMessage}</p>
                      <Button variant="outline" onClick={() => setReloadToken((n) => n + 1)}>
                        <RefreshCw aria-hidden="true" />
                        Tentar de novo
                      </Button>
                    </div>
                  )}
                  {data && <CustomerFicha data={data} revealPassword={revealPassword} anonymizeCustomer={anonymizeCustomer} />}
                </DrawerBody>
                <DrawerFooter>
                  {/* `nativeButton={false}` porque o base-ui avisa quando um
                      componente com semântica de botão renderiza um <a>. */}
                  <Button size="lg" nativeButton={false} render={<Link href={`/customers/${displayCustomerId}`} />}>
                    Abrir ficha completa
                  </Button>
                  <Button variant="outline" size="lg" onClick={closeCustomer}>Fechar</Button>
                </DrawerFooter>
              </>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
