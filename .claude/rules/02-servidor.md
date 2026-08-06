# 02 — Servidor (Server Components, Actions, services)

Padrão: **Server Component lê · Server Action escreve · service orquestra · `core/` calcula.**

O risco conhecido do App Router é regra de negócio vazando para dentro de `page.tsx` e de `actions.ts`. As regras abaixo existem para conter isso.

## Leitura — Server Component

```tsx
// app/(app)/cobrancas/page.tsx
export default async function Page({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = parseFilters(await searchParams);
  const charges = await listCharges(filters);        // features/charges/queries.ts
  return <ChargeTable charges={charges} />;
}
```

- `page.tsx` é composição: resolve params, chama a query, monta o layout. **Zero Prisma, zero cálculo, zero `if` de regra.**
- Query devolve **DTO**, nunca modelo Prisma. Modelo Prisma vazando para a tela é como `accessPasswordEnc` aparece num lugar que ninguém revisou.
- `BigInt` vira `string` no DTO. Nenhum componente cliente recebe `BigInt`.
- Filtro e paginação vivem em `searchParams`, não em estado.

## Escrita — Server Action

```ts
// features/charges/actions.ts
'use server';

export async function registerPaymentAction(input: unknown) {
  const user = await requireSession();
  const data = registerPaymentSchema.parse(input);        // Zod — mesmo schema do form
  const payment = await chargesService.registerPayment(data, user.id);
  revalidatePath('/cobrancas');
  return { paymentId: payment.id };
}
```

Só isto: sessão, validação, chamada ao service, revalidação. **Nunca** Prisma direto, cálculo ou `if` de regra de negócio.

- ❌ `if (charge.status === 'PAID') throw ...` na action — é regra, vai para o service.
- ❌ `'use server'` num arquivo que também exporta componente. Actions ficam em `actions.ts`.
- ❌ Action sem `requireSession()`. Server Action é endpoint HTTP público — a ausência de guard não é protegida pelo middleware.
- Toda entrada passa por Zod. ❌ `z.any()`, `z.unknown()`, `.passthrough()` em borda de entrada.
- `revalidatePath` / `revalidateTag` **depois** da transação, nunca dentro.

## Service

**Uma razão para mudar.** Passou de 250 linhas ou 8 métodos públicos, split por coesão — ver [01-arquitetura](./01-arquitetura.md).

- **Cálculo nunca vive no service.** Service busca dados, chama `core/`, persiste o resultado.
- Service não sabe de HTTP: sem `Request`, `Response`, `cookies()`, `headers()`, status code.
- Service não chama `revalidatePath`. Isso é da action.

```ts
// ✅ service orquestra, core calcula
const { principalCents, discountCents } = calcChargeAmount(sub, now);
await tx.charge.create({ data: { principalCents, discountCents, ... } });

// ❌ cálculo inline no service
const discount = sub.priceCents * 10n / 100n;
```

## Transação — a regra que mais importa

Uma mudança de estado relevante = **uma transação**, contendo a escrita e o seu efeito colateral.

```ts
await db.$transaction(async (tx) => {
  const payment = await tx.payment.create({ data });
  await tx.charge.update({ where: { id }, data: { status, paidAt } });
  await tx.message.updateMany({
    where: { chargeId: id, status: 'PENDING' },
    data:  { status: 'CANCELLED', cancelReason: 'PAYMENT_RECEIVED' },
  });
});
```

- ❌ **Chamada HTTP a provider externo dentro da transação.** Vira linha `PENDING` em `messages`, despachada pelo cron.
- ❌ Cancelar os passos da régua **depois** do commit. Crash entre os dois manda cobrança para quem acabou de pagar.
- ❌ Transação que abrange duas ações do usuário. Uma transação por operação.
- ❌ `revalidatePath` dentro da transação.
- Lote grande processa em blocos (~500 linhas), **cada bloco em transação própria**. Nunca uma transação para 5.000 linhas.

## Rotas de cron

```ts
// app/api/cron/dunning-evaluate/route.ts
export async function POST(req: Request) {
  await assertCloudSchedulerToken(req);          // 401 sem corpo se falhar
  const result = await dunningService.evaluate({ now: new Date() });
  logger.info({ job: 'dunning-evaluate', ...result });
  return Response.json(result);
}
```

- Handler é **casca**: valida o token, chama o service, loga o resultado. Zero regra própria.
- **Todo handler é idempotente.** Rodar duas vezes produz o mesmo resultado — garantido por constraint no banco, não por `if` no código.
- Nenhum handler assume que outro já rodou.
- `now` entra por parâmetro e desce até `core/`. É o que torna o job testável.
- Falha parcial não derruba a passada: erro por cliente é capturado, logado e a passada continua.
- Handler que pode passar do timeout do Cloud Run processa **em lote** e volta na próxima execução.

## Erros

Errors as data, com código de domínio.

```ts
export class DomainError extends Error {
  constructor(message: string, readonly code: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ChargeAlreadyPaidError extends DomainError {
  constructor(chargeId: string, cause?: unknown) {
    super('Esta cobrança já foi paga.', 'CHARGE_ALREADY_PAID', { cause });
  }
}
```

- `message` é escrito **para o usuário final, em pt-BR, sem jargão**. `code` é para o tratamento no cliente.
- Server Action captura `DomainError` e devolve `{ error: { code, message } }`. Erro inesperado vira mensagem genérica + log com stack.
- Nunca vazar stack trace, SQL ou nome de tabela para a tela.
- Re-throw sempre com `{ cause }`.
- ❌ `catch { /* swallow */ }`.

## Logs

JSON estruturado em `stdout` — o Cloud Run agrega.

Carrega: `requestId`, `userId`, `route` ou `job`, `durationMs`, `status`.
Nunca carrega: senha, token, credencial, corpo de mensagem enviada, telefone completo, documento.

`console.log` não passa em review. Log de objeto inteiro (`logger.info({ subscription })`) também não — loga ids.
