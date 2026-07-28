# 17 — Custos, Margem e Fornecedores

> Adicionado após análise da operação real do ICP. Sem custo e lucro, o dashboard perde para a planilha que o cliente já usa — ele acompanha **margem**, não faturamento.

## Motivação

O operador típico organiza a base **por fornecedor** (de onde vem o serviço revendido), registra o **custo do crédito** por linha, e acompanha o **lucro acumulado por cliente** ao longo de anos. "Cliente desde 2020, R$ 2.600 em vendas, R$ 2.000 de lucro" é o número de que ele tem orgulho.

Nenhuma dessas três dimensões existia no modelo original.

---

## Fornecedor (`Supplier`)

Eixo transversal: organiza a base, define custo padrão e é a principal quebra de relatório.

```prisma
model Supplier {
  id            String   @id @default(uuid(7))
  tenantId      String
  name          String
  unitCostCents BigInt   @default(0)   // custo padrão por ciclo
  notes         String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  @@unique([tenantId, name])
}
```

- `Plan.supplierId` — opcional
- `Subscription.supplierId` — copiado na criação; **fonte da verdade** (o operador migra cliente de fornecedor sem trocar de plano)
- `Charge.supplierId` — congelado na emissão

⚠️ Nome genérico proposital. "Fornecedor" serve para revendedor de qualquer coisa; não hardcodar vocabulário de nicho na UI.

**Na importação:** cada arquivo/aba corresponde a um fornecedor. O wizard pergunta "estes clientes são de qual fornecedor?" — o que transforma a armadilha "uma aba por sistema" (doc 13) em feature.

---

## Custo

### Hierarquia de resolução

```
Subscription.costCents     ← custo negociado daquela linha (ganha se preenchido)
   ↓
Plan.costCents             ← custo padrão do plano
   ↓
Supplier.unitCostCents     ← custo padrão do fornecedor
   ↓
0
```

### Congelamento

⚠️ O valor resolvido é gravado em `Charge.costCents` na emissão e **nunca recalculado**. Se o fornecedor aumentar o preço em agosto, o relatório de julho não pode mudar. Relatório que muda retroativamente destrói a confiança no sistema.

```prisma
model Charge {
  // ...
  costCents  BigInt  @default(0)   // congelado na emissão
  supplierId String?               // congelado na emissão
}

model Subscription {
  // ...
  costCents      BigInt   @default(0)
  supplierId     String?
  discountType   String?            // PERCENT | FIXED
  discountValue  Decimal?
  discountUntil  DateTime?          // null = permanente
}
```

### Momento do reconhecimento

**Na emissão da cobrança** (padrão). Custo e receita na mesma competência. Cliente inadimplente aparece como prejuízo — que é a realidade: o crédito foi comprado e não foi pago.

Alternativa configurável: reconhecer na confirmação do pagamento. Some o prejuízo da inadimplência do relatório, mas alguns operadores preferem.

Cobrança cancelada ou baixada: **não estorna o COGS** por padrão (o crédito já foi comprado, a perda é real). Configurável por tenant.

---

## Ledger

Nova conta: `COGS` (custo da mercadoria vendida) e `AP` (a pagar ao fornecedor).

```prisma
enum LedgerAccount { AR CASH CREDIT REVENUE COGS AP DISCOUNT INTEREST PENALTY WRITE_OFF REFUND }
```

Emissão de cobrança de R$ 30,00 com custo de R$ 10,00 gera **duas transações**:

```
-- receita
AR       DEBIT   3000
REVENUE  CREDIT  3000

-- custo
COGS     DEBIT   1000
AP       CREDIT  1000
```

⚠️ Se `costCents = 0`, não gerar a segunda transação — `amount_cents > 0` é constraint. As queries tratam ausência como zero via `COALESCE`.

⚠️ Todo lançamento de `COGS` carrega `customerId`, `subscriptionId` e `supplierId`. É o que permite a visão por cliente e a geral saírem da **mesma fonte**, garantindo que o agregado feche com a soma dos individuais.

---

## Fórmula do lucro

```
lucro_bruto = receita − custo − descontos − perdas(write_off)
```

⚠️ Desconto e write-off **precisam** entrar. Omitir deixa o número otimista, e o operador descobre a divergência conferindo na mão — o que custa a confiança no sistema inteiro.

⚠️ Rotular na UI como **"lucro bruto"** enquanto não houver módulo de despesas fixas. Nomear errado é pior que não ter.

---

## Visão por cliente

Painel no topo da ficha do assinante:

```
João Silva · cliente desde 03/2020 · Tubarão

  Receita acumulada    R$ 2.640,00
  Custo acumulado      R$   680,00
  Lucro bruto          R$ 1.960,00      margem 74%
  Renovações                    44
  Ticket médio         R$    60,00
  Lucro médio/mês      R$    44,55
  Histórico                     2 atrasos · 0 em aberto
```

```sql
-- packages/db/sql/customer_pnl.sql
SELECT
  MIN(occurred_at)                                                    AS since,
  COALESCE(SUM(amount_cents) FILTER (WHERE account='REVENUE'),   0)   AS revenue_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE account='COGS'),      0)   AS cost_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE account='DISCOUNT'),  0)   AS discount_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE account='WRITE_OFF'), 0)   AS loss_cents,
  COUNT(*) FILTER (WHERE account='CASH')                             AS payments_count
FROM ledger_entries
WHERE tenant_id = $1 AND customer_id = $2;
```

Emocionalmente forte e barato de implementar. É o que faz o operador não querer voltar para a planilha.

---

## Visão geral

```
Julho/2026

  Faturamento       R$ 18.420,00    ▲ 8% vs. jun
  Custo             R$  6.150,00
  Lucro bruto       R$ 12.270,00    margem 66,6%

  Recebido          R$ 16.890,00
  Em aberto         R$  1.530,00    ⚠ margem em risco: R$ 1.020,00
```

⚠️ **Margem em risco** = custo já reconhecido de cobranças ainda não recebidas. Número que quase nenhum concorrente mostra e que importa muito para quem paga o crédito antes de receber.

### Quebras (mesma query, `GROUP BY` diferente)

| Por | Uso |
|---|---|
| Fornecedor | "Tubarão dá 60% de margem, Club TV 40%" — decide onde concentrar |
| Plano | Identifica plano vendido abaixo do custo |
| Mês (12 meses) | Tendência de **margem**, não só de receita |
| Cliente (top/bottom 20) | Quem sustenta e quem drena a operação |

---

## Alertas derivados

Baratos, porque os dados já estão no ledger. É aqui que o sistema supera a planilha:

| Alerta | Regra |
|---|---|
| ⚠️ **Margem negativa** | `priceCents − costCents ≤ 0` na assinatura |
| **Margem abaixo do limite** | Percentual configurável (padrão 30%) |
| **Aumento de custo do fornecedor** | Ao editar `Supplier.unitCostCents`, mostrar quantas assinaturas caem abaixo do limite e oferecer **reajuste em lote** |
| **Cliente de alto valor em atraso** | LTV acima da média + cobrança vencida → tratamento prioritário |

A última fecha um ciclo útil: o dado de lucro alimenta a régua. Nova condição de passo:

```ts
type StepConditions = {
  // ...
  minLifetimeValueCents?: bigint;
  maxMarginPercent?: number;
};
```

---

## Campos personalizados

Substitui a decisão anterior de "ignorar coluna de login/senha na importação" (doc 13), que estava errada como produto: usuário e senha de acesso fazem parte do fluxo diário do operador. Se a importação descarta, ele mantém a planilha aberta do lado e não migrou nada.

```prisma
model CustomFieldDef {
  id       String  @id @default(uuid(7))
  tenantId String
  scope    String            // SUBSCRIPTION | CUSTOMER
  key      String            // "usuario", "senha", "telas", "servidor"
  label    String
  type     String            // TEXT | NUMBER | DATE | SELECT | SECRET
  options  Json?
  required Boolean @default(false)

  @@unique([tenantId, scope, key])
}
```

- Valores comuns em `Subscription.customFields Json`
- Valores `SECRET` em coluna criptografada separada (mesmo envelope encryption das integrações)

### ⚠️ Regras para `SECRET`

1. Mascarado por padrão; revelar exige permissão `subscriptions:secrets:read`
2. **Todo acesso auditado** — quem revelou, quando, qual assinatura
3. Nunca em export, log, Sentry, mensagem ou template
4. Excluído da importação por padrão, com opt-in explícito e aviso de responsabilidade
5. Não indexado, não pesquisável

Isso cobre usuário, senha, servidor, telas e qualquer campo idiossincrático — sem hardcodar o domínio e sem construirmos um produto de gestão de credenciais.

**Telas/conexões:** campo personalizado numérico no MVP. 🔮 Se virar driver de preço (R$ 25 por 1 tela, R$ 40 por 2), promove a first-class com `pricePerUnit × quantity`.

---

## Desconto recorrente

O operador tem promoções fixas, não desconto pontual. `Subscription.discountType/Value/Until`, aplicado na emissão de cada cobrança, com lançamento em `DISCOUNT`.

Alimenta diretamente o alerta de margem negativa — desconto antigo nunca revisto + custo do fornecedor que subiu é a causa mais comum de linha no prejuízo.

---

## Fora do escopo

🔮 **Controle de lote de créditos.** O operador compra 50 créditos por R$ 450 e vai consumindo. Modelar corretamente é controle de estoque (entrada, consumo, saldo, custo médio ponderado). O custo unitário por assinatura entrega ~90% do valor. O modelo atual não quebra ao evoluir: `Charge.costCents` continua sendo o custo reconhecido; muda apenas de onde ele vem.

🔮 **Despesas gerais** (hospedagem, chip, o próprio SaaS). Sem isso, o número é margem bruta. Módulo simples de despesas fixas mensais na fase 5 fecha o lucro real.

---

## Impacto no roadmap

| Fase | Adição | Custo |
|---|---|---|
| 1 | `Supplier`, `costCents`, conta `COGS`/`AP`, desconto recorrente | +3–4 dias |
| 2 | Campos `SECRET` com permissão e auditoria | +1 dia |
| 3 | Fornecedor por aba na importação; campos personalizados no mapeamento | +2 dias |
| 4 | Dashboard de lucro, margem por fornecedor, painel de LTV, alertas | +3–4 dias |

**Total: ~2 semanas.** Vale cada dia — sem custo e lucro, o operador compara nosso dashboard com a planilha dele e a planilha ganha.

## Impacto nos planos comerciais

| Recurso | Starter | Pro | Business |
|---|---|---|---|
| Fornecedores | 1 | 5 | ilimitados |
| Campos personalizados | 3 | 10 | ilimitados |
| Relatório de margem e LTV | — | ✓ | ✓ |
