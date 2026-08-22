'use client';

import Link from 'next/link';
import { DrawerBody, DrawerFooter } from '@/components/ui/drawer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * O que a tela mostra quando o WhatsApp do lead já era de um cliente: o lead
 * virou `Convertido` e ganhou o vínculo, mas **nenhuma assinatura foi criada**.
 *
 * As duas conversões terminam com o lead fora da fila; só uma cobra alguém.
 * Fechar com um toast genérico deixaria o operador achando que a assinatura
 * saiu — e ele só descobriria no fim do mês, sem cobrança.
 */
export function LeadConvertedNotice({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
}) {
  return (
    <>
      <DrawerBody>
        <Alert tone="warning">
          <p className="font-semibold">Esse WhatsApp já é de {customerName}.</p>
          <p className="mt-1 leading-relaxed">
            O lead foi vinculado a esse cadastro, sem duplicar o cliente e <strong>sem criar assinatura</strong>. Se
            ele vai assinar de novo, abra a ficha e cadastre a assinatura lá — assim você vê o que ele já paga antes
            de gerar outra cobrança.
          </p>
        </Alert>
      </DrawerBody>
      <DrawerFooter>
        <Button size="lg" nativeButton={false} render={<Link href={`/customers/${customerId}`} />}>
          Abrir ficha de {customerName}
        </Button>
        <Button variant="outline" size="lg" onClick={onClose}>
          Fechar
        </Button>
      </DrawerFooter>
    </>
  );
}
