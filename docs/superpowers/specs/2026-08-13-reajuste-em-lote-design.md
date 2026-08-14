# Reajuste em lote — design

> Implementa o alerta "custo do fornecedor subiu" de `docs/projeto/tecnico/04-dinheiro-e-margem.md`: ao editar `Supplier.unitCostCents` pra um valor maior, mostra quantas assinaturas ativas são afetadas e oferece reajustar o lote inteiro.
> Aprovado: 2026-08-13.

## Motivação

`SupplierDrawer` já avisa em texto ("Mudar o custo não reajusta assinatura existente sozinho") mas não oferece nenhuma ação — o operador tem que editar assinatura por assinatura na mão. `Subscription.costCents` é um valor gravado na criação (sem cascata automática pro custo do fornecedor), então depois que o fornecedor sobe o preço, toda assinatura ligada a ele fica com `costCents` desatualizado até alguém corrigir.

## Regra

Gatilho: `Supplier.unitCostCents` sobe (novo valor > valor anterior) **e** existe pelo menos uma `Subscription` `ACTIVE` com esse `supplierId`.

Fórmula, por assinatura afetada — markup absoluto, não percentual:

```
delta      = novoCustoFornecedor − custoAtualDaAssinatura
novoCusto  = novoCustoFornecedor
novoPreço  = preçoAtualDaAssinatura + delta
```

`delta` usa o custo **da assinatura**, não o custo antigo do fornecedor — funciona igual se alguma assinatura já tinha `costCents` sobrescrito manualmente (nesse caso, incomum, `delta` pode até ser negativo pra essa linha isolada; o comportamento é consistente, só significa que aquela assinatura específica já estava acima do novo custo do fornecedor).

⚠️ Custo **caindo** não dispara nada — fora de escopo, só trata alta.

## O que entra

### Query — preview

```ts
// src/features/suppliers/queries.ts — adiciona
export type BulkAdjustPreviewRow = {
  subscriptionId: string;
  customerName: string;
  oldCostCents: string;
  newCostCents: string;
  oldPriceCents: string;
  newPriceCents: string;
};

export async function listBulkAdjustPreview(supplierId: string): Promise<BulkAdjustPreviewRow[]> {
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const subscriptions = await db.subscription.findMany({
    where: { supplierId, status: 'ACTIVE' },
    include: { customer: { select: { name: true } } },
  });

  return subscriptions.map((sub) => {
    const delta = supplier.unitCostCents - sub.costCents;
    const newPriceCents = sub.priceCents + delta;
    return {
      subscriptionId: sub.id,
      customerName: sub.customer.name,
      oldCostCents: sub.costCents.toString(),
      newCostCents: supplier.unitCostCents.toString(),
      oldPriceCents: sub.priceCents.toString(),
      newPriceCents: (newPriceCents < 0n ? 0n : newPriceCents).toString(),
    };
  });
}
```

### Service — aplicar

```ts
// src/features/suppliers/service.ts — adiciona
export async function applyBulkPriceAdjustment(supplierId: string): Promise<{ count: number }> {
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const subscriptions = await tx.subscription.findMany({ where: { supplierId, status: 'ACTIVE' } });

    for (const sub of subscriptions) {
      const delta = supplier.unitCostCents - sub.costCents;
      const newPriceCents = sub.priceCents + delta;
      await tx.subscription.update({
        where: { id: sub.id },
        data: { costCents: supplier.unitCostCents, priceCents: newPriceCents < 0n ? 0n : newPriceCents },
      });
    }

    return { count: subscriptions.length };
  });
}
```

Não toca em `Charge` nenhuma — documento emitido é imutável, regra dura do projeto. Só a próxima cobrança emitida (gerada no próximo pagamento, per o modelo de vencimento por pagamento) reflete os novos valores.

### Actions

```ts
// src/features/suppliers/actions.ts — adiciona
export async function getBulkAdjustPreviewAction(supplierId: string) {
  try {
    await requireSession();
    const rows = await listBulkAdjustPreview(supplierId);
    return { ok: true as const, rows };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.bulkAdjustPreview', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function applyBulkAdjustAction(supplierId: string) {
  try {
    await requireSession();
    const result = await applyBulkPriceAdjustment(supplierId);
    revalidatePath('/suppliers');
    return { ok: true as const, count: result.count };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.bulkAdjust', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

### UI

`SupplierDrawer.onSubmit`: depois de `updateSupplierAction` ter sucesso, se está editando (não criando) **e** `BigInt(values.unitCostCents) > BigInt(supplier.unitCostCents)` (comparação client-side com o valor original, já disponível na prop), chama `getBulkAdjustPreviewAction(supplier.id)`. Se `rows.length > 0`, fecha o `SupplierDrawer` e abre `BulkAdjustDialog` com as linhas.

`BulkAdjustDialog` (novo componente, `src/features/suppliers/components/bulk-adjust-dialog.tsx`) — lista `cliente · custo antigo→novo · preço antigo→novo`, botão "Aplicar em N assinatura(s)". Segue **exatamente** o padrão já usado em `send-message-dialog.tsx`: acima de 100 linhas, abre `TypeToConfirmDialog` (componente já existe, `src/components/ui/type-to-confirm-dialog.tsx`) pedindo pra digitar o número; até 100, aplica direto ao clicar.

```tsx
const BATCH_CONFIRM_THRESHOLD = 100;

function handleConfirmClick() {
  if (rows.length > BATCH_CONFIRM_THRESHOLD) {
    setConfirmOpen(true);
    return;
  }
  apply();
}
```

Fechar o dialog sem aplicar não salva nada — sem estado "pendente" gravado em lugar nenhum. Se o operador voltar depois, o preview é recalculado do zero a partir dos valores atuais (idempotente, sem drift).

## Testes

- `features/suppliers/queries.integration.test.ts` (novo) — `listBulkAdjustPreview`: assinatura `ACTIVE` do fornecedor aparece com valores corretos; assinatura `SUSPENDED`/`CANCELLED` do mesmo fornecedor não aparece; assinatura de outro fornecedor não aparece; assinatura com `costCents` já maior que o novo custo do fornecedor produz `delta` negativo e `newPriceCents` correspondentemente menor (não é bug, é o comportamento documentado); `newPriceCents` nunca fica negativo mesmo com `delta` muito negativo (clamp em `0n`).
- `features/suppliers/service.integration.test.ts` (novo ou estendido) — `applyBulkPriceAdjustment`: aplica em transação, `costCents`/`priceCents` batem com o preview; `Charge` já emitida não muda (cria uma cobrança antes, aplica o reajuste, confere que a cobrança antiga continua com o valor congelado); assinatura de outro fornecedor não é tocada.

## Fora de escopo

- Custo caindo — sem gatilho, sem reajuste automático pra baixo.
- Qualquer alteração em `Charge` já emitida.
- Notificação ao cliente sobre o reajuste de preço (fora do escopo desta feature — decisão de produto separada, hoje o sistema não avisa assinante de mudança de preço).
