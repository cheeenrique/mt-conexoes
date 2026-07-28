# 14 — API e Contratos

## Estratégia

**ts-rest com contratos Zod em `packages/contracts`** (ADR-005). O contrato é a fonte única: o backend implementa, o frontend consome, e o TypeScript reclama na hora se divergirem. Sem codegen.

```
packages/contracts/src/
  index.ts
  common.ts        paginação, erro, filtros
  customers.ts
  subscriptions.ts
  charges.ts
  payments.ts
  dunning.ts
  integrations.ts
  imports.ts
  onboarding.ts
  reports.ts
```

---

## Padrões

### Estrutura de um contrato

```ts
// packages/contracts/src/charges.ts
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const ChargeSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  status: z.enum(['DRAFT','OPEN','PARTIALLY_PAID','PAID','OVERDUE','CANCELED','WRITTEN_OFF']),
  principalCents: z.coerce.bigint(),
  totalCents: z.coerce.bigint(),
  paidCents: z.coerce.bigint(),
  dueAt: z.coerce.date(),
  paidAt: z.coerce.date().nullable(),
});

export const chargesContract = c.router({
  list: {
    method: 'GET',
    path: '/charges',
    query: z.object({
      status: z.array(z.string()).optional(),
      customerId: z.string().uuid().optional(),
      dueFrom: z.coerce.date().optional(),
      dueTo: z.coerce.date().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    }),
    responses: { 200: paginated(ChargeSchema) },
  },
  create: {
    method: 'POST',
    path: '/charges',
    body: CreateChargeSchema,
    responses: { 201: ChargeSchema, 409: ErrorSchema, 422: ErrorSchema },
  },
  registerPayment: {
    method: 'POST',
    path: '/charges/:id/payments',
    pathParams: z.object({ id: z.string().uuid() }),
    body: RegisterPaymentSchema,
    responses: { 201: PaymentSchema, 409: ErrorSchema },
  },
});
```

### Implementação no NestJS

```ts
@Controller()
@UseGuards(TenantGuard, RbacGuard)
export class ChargesController {
  constructor(private readonly charges: ChargeService) {}

  @TsRestHandler(chargesContract.registerPayment)
  @RequirePermission('payments:write')
  @Idempotent()
  @Audited('payment.registered')
  registerPayment() {
    return tsRestHandler(chargesContract.registerPayment, async ({ params, body }) => {
      const payment = await this.charges.registerPayment(params.id, body);
      return { status: 201, body: payment };
    });
  }
}
```

Guards, interceptors e decorators do NestJS funcionam normalmente — essa era a razão de escolher ts-rest em vez de tRPC.

### Consumo no frontend

```ts
const { data, isLoading } = api.charges.list.useQuery(
  ['charges', filters],
  { query: filters },
);

const { mutate } = api.charges.registerPayment.useMutation();
```

---

## Convenções

| Aspecto | Regra |
|---|---|
| Base URL | `https://api.meusaas.com/v1` |
| Versionamento | Prefixo de path. Quebra de contrato = `/v2` |
| Recursos | Plural, kebab-case: `/dunning-rulesets` |
| Aninhamento | Máximo 2 níveis: `/customers/:id/subscriptions` |
| Paginação | Cursor (`cursor` + `limit`), nunca offset — dados mudam durante a navegação |
| Ordenação | `sort=dueAt:desc` |
| Filtros | Query params tipados; arrays repetindo a chave |
| Datas | ISO 8601 em UTC |
| Dinheiro | Inteiro em centavos, sempre sufixo `Cents` |
| `null` vs ausente | `null` = valor limpo; ausente = não alterar (PATCH) |

---

## Erros

Formato único, sempre:

```json
{
  "error": {
    "code": "CHARGE_ALREADY_PAID",
    "message": "Esta cobrança já foi quitada em 12/07/2026.",
    "details": { "chargeId": "...", "paidAt": "2026-07-12T14:22:00Z" },
    "requestId": "req_01J..."
  }
}
```

| HTTP | Uso |
|---|---|
| 400 | Requisição malformada |
| 401 | Sem autenticação ou token expirado |
| 403 | Autenticado, sem permissão · fora do tenant |
| 404 | Não existe **ou** pertence a outro tenant (⚠️ nunca revelar a diferença) |
| 409 | Conflito de estado (cobrança já paga, transição inválida) |
| 422 | Validação de domínio |
| 429 | Rate limit — inclui `Retry-After` |
| 500 | Erro interno — `requestId` sempre presente |

⚠️ `message` é escrito para o usuário final, em português, sem jargão técnico. `code` é para o cliente da API. Nunca vazar stack trace, SQL ou nome de tabela.

Códigos de domínio nomeados (lista viva): `CHARGE_ALREADY_PAID`, `CHARGE_HAS_ALLOCATIONS`, `INVALID_SUBSCRIPTION_TRANSITION`, `CONTACT_OPTED_OUT`, `INTEGRATION_NOT_CONNECTED`, `PLAN_LIMIT_EXCEEDED`, `IMPORT_ROLLBACK_BLOCKED`, `DUNNING_IN_REVIEW`.

---

## Idempotência

⚠️ Toda escrita não-idempotente aceita `Idempotency-Key`:

```
POST /v1/charges
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Comportamento:

1. Chave inexistente → processa, grava `(key, requestHash, statusCode, response)`, responde
2. Chave existente com **mesmo** `requestHash` → devolve a resposta gravada, sem reprocessar
3. Chave existente com `requestHash` **diferente** → `422 IDEMPOTENCY_KEY_REUSED`
4. TTL de 24h

Obrigatório em: criação de cobrança, registro de pagamento, envio de mensagem, execução de importação.

O frontend gera a chave por ação do usuário (não por retry), o que resolve o duplo-clique no botão "Registrar pagamento" — que vai acontecer.

---

## Rate limiting

| Escopo | Limite |
|---|---|
| Por IP (não autenticado) | 30 req/min |
| Por usuário | 300 req/min |
| Por tenant | conforme plano (doc 15) |
| `POST /auth/login` | 5 / 15 min por e-mail e por IP |
| `POST /imports` | 5 / hora por tenant |
| Envio de mensagem | conforme plano + travas do doc 09 |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## Webhooks recebidos

Fora do contrato ts-rest (payload é definido por terceiro). Controllers dedicados marcados `@Public()`.

```
POST /webhooks/mercadopago/:tenantSlug
POST /webhooks/pagbank/:tenantSlug
POST /webhooks/meta/:tenantSlug
GET  /webhooks/meta/:tenantSlug        (challenge de verificação)
POST /webhooks/evolution/:tenantSlug
POST /webhooks/resend
```

⚠️ Regras invioláveis:
1. Verificar assinatura **antes** de qualquer processamento
2. `UNIQUE(providerCode, externalId)` para dedupe
3. Responder `200` em < 1s; processamento pesado vai para a fila
4. Proteção contra replay: rejeitar timestamp com mais de 5 min
5. Nunca confiar em valores do payload sem conferir contra o estado local

---

## SSE (fase 2)

🔮 No MVP, atualização em tempo real usa `refetchInterval` do TanStack Query — resolve 95% dos casos e custa zero infra. SSE entra quando houver necessidade real (progresso de importação longa, caixa de entrada).

⚠️ Com mais de uma instância da API, SSE precisa de pub/sub para rotear o evento até a instância certa (Postgres `LISTEN/NOTIFY`). Considerar isso antes de adotar.

---

## OpenAPI

Gerado do mesmo contrato com `@ts-rest/open-api`, servido em `/docs` (protegido em produção). Existe para: onboarding de integrador futuro, collection de Postman para suporte, e teste de contrato no CI.
