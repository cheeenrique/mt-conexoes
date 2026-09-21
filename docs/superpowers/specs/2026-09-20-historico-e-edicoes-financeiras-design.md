# Histórico financeiro e edições diretas — design

> **Status: desenhado em 20/09/2026, não implementado.** Nasceu da troca de plano
> (`b81ca0f`), que destravou um caso e deixou à mostra que o sistema recusa toda
> correção depois que dinheiro entrou.

## Problema

O domínio trata documento com dinheiro registrado como imutável (`CLAUDE.md`
§Dinheiro). É a regra certa para relatório, e na mesa do operador ela vira parede:

| O que o operador quer | O que o sistema responde hoje |
|---|---|
| Corrigir R$ 350,00 digitado no lugar de R$ 35,00 | Nada. Não existe desfazer. Sobra registrar por cima e conviver com os dois |
| Trocar o plano de quem já pagou parte da cobrança | `ChargeHasPaymentError`. Só a baixa do restante, que fecha a cobrança pelo valor que entrou |
| Mudar o valor só desta cobrança | Mexer no preço da assinatura, realinhar, e desfazer a assinatura depois — dois passos, duas telas, um resíduo |
| Saber por que este cliente mudou de preço | Nada. Nenhuma mutação deixa rastro |

A última linha é a que sustenta as outras três. Sem registro, afrouxar a regra é
perder informação; com registro, afrouxar é ganhar rastro que hoje não existe.

⚠️ **A troca de plano acontece na virada do ciclo**, nunca no meio da validade:
o período anterior expirou e o cliente decide renovar em outro plano. Não existe
pedaço de ciclo pago a devolver, então **não existe proporcional neste desenho** —
e a cobrança em aberto no momento da troca é a que compra o período seguinte, o
que faz o realinhamento de `b81ca0f` ser o comportamento certo, não um paliativo.

## Schema

```prisma
enum FinancialEventEntity { SUBSCRIPTION CHARGE PAYMENT }

enum FinancialEventKind {
  SUBSCRIPTION_PLAN_CHANGED
  SUBSCRIPTION_PRICE_EDITED
  SUBSCRIPTION_CYCLE_CHANGED
  SUBSCRIPTION_DUE_DATE_EDITED
  SUBSCRIPTION_STATUS_CHANGED
  CHARGE_AMOUNT_EDITED
  CHARGE_REALIGNED
  CHARGE_CANCELLED
  CHARGE_WRITTEN_OFF
  PAYMENT_REGISTERED
  PAYMENT_REMOVED
}

model FinancialEvent {
  id         String               @id @default(uuid(7))
  customerId String
  entityType FinancialEventEntity
  entityId   String
  kind       FinancialEventKind
  /// Centavos vão como string. Nada lê este payload para calcular dinheiro.
  before     Json?
  after      Json?
  /// Texto livre do operador. ⚠️ Pode conter nome de pessoa — ver §LGPD.
  reason     String?
  userId     String?
  at         DateTime             @default(now())

  customer Customer @relation(fields: [customerId], references: [id])
  user     User?    @relation(fields: [userId], references: [id])

  @@index([customerId, at])
  @@map("financial_events")
}
```

**`entityId` é string solta, sem FK — de propósito.** FK para `payments` faria a
remoção do pagamento falhar (restrict) ou levar o evento junto (cascade), e o
evento é justamente o único lugar onde aquele pagamento continua existindo. O
comentário fica no schema para ninguém "consertar" isso num PR futuro.

FK para `customers` fica: a linha do tempo é sempre por cliente, e cliente não é
apagado (soft delete e anonimização preservam a linha).

### Por que uma tabela só, e não uma por entidade

A ficha precisa de **uma** lista ordenada cruzando assinatura, cobrança e
pagamento — é essa a história que o operador lê ("mudou de plano → corrigi a
cobrança → tirei o pagamento errado"). Três tabelas viram UNION ou três consultas
costuradas na mão, e cada `kind` novo pede coluna nova ou nasce quase toda nula.

O custo é perder tipagem de dinheiro no payload, e ele é pago com uma regra dura:
**o log é registro, nunca fonte de saldo.** Todo total continua saindo de `SUM`
sobre `payments`/`charges`. Um teste garante que nenhuma query de relatório toca
`financial_events`.

## Camadas

`lib/financial-events.ts` — `recordFinancialEvent(tx, {...})` e
`listFinancialEvents(customerId)`.

Mora em `lib/` porque três features escrevem nele, e feature não importa de
feature (`.claude/rules/01-arquitetura.md` §Matriz de import). É o único ponto
onde a regra "`lib/` não contém regra de negócio" é esticada: o enum é
vocabulário do domínio, não decisão. **Quando** registrar continua sendo do
service — `lib/` só sabe escrever a linha.

Pontos de escrita, todos **dentro da transação que já existe**:

| Service | Evento |
|---|---|
| `patchSubscription` | um evento por **decisão**, não por campo — ver abaixo |
| `changeSubscriptionPlan` | `SUBSCRIPTION_PLAN_CHANGED` |
| `realignChargeToSubscription` | `CHARGE_REALIGNED` |
| `cancelCharge` | `CHARGE_CANCELLED` |
| `writeOffRemaining` | `CHARGE_WRITTEN_OFF` |
| `registerPayment` | `PAYMENT_REGISTERED` |
| `editChargeAmount` *(novo)* | `CHARGE_AMOUNT_EDITED` |
| `removePayment` *(novo)* | `PAYMENT_REMOVED` |

`entityId` é o id da própria entidade: assinatura nos `SUBSCRIPTION_*`, cobrança
nos `CHARGE_*`, pagamento nos `PAYMENT_*`.

**Um evento por decisão do operador, não por coluna alterada.** Trocar o plano
mexe em plano, preço, custo e ciclo de uma vez; quatro eventos para um clique
transformam a linha do tempo em log de banco. `SUBSCRIPTION_PLAN_CHANGED` carrega
os quatro no `before`/`after` e é uma linha só. Só vira evento próprio o que o
operador mexeu sozinho: preço e custo editados à mão sem trocar de plano
(`SUBSCRIPTION_PRICE_EDITED`, os dois no mesmo evento — andam juntos na tela),
ciclo, vencimento e situação.

Campo que não mudou não vira evento. Salvar a ficha sem tocar em nada não pode
encher a linha do tempo de ruído — é o jeito mais rápido de fazer o operador
parar de lê-la.

## Edições diretas

### `editChargeAmount(chargeId, { principalCents, reason })`

Motivo **obrigatório** — é ele que faz a linha do tempo valer alguma coisa.

- cobrança viva (nem `PAID` nem `CANCELLED`)
- `principalCents - discountCents` **≥ soma dos pagamentos**. Abaixo disso não é
  edição, é fechar pelo que entrou: erro apontando a baixa do restante
- recalcula `status` por `deriveChargeStatus`
- cancela mensagem `PENDING` da cobrança (`amount_changed`) — o valor vai
  congelado no corpo desde a avaliação da régua
- `costCents` **não** é tocado: continua congelado na emissão

### `realignChargeToSubscription` passa a aceitar cobrança com pagamento

Mesma trava de piso. Hoje ela recusa qualquer cobrança com pagamento
(`ChargeHasPaymentError`); passa a recusar só quando o valor da assinatura ficaria
abaixo do já pago.

### Recorte de período na troca de ciclo

Trocar trimestral por mensal deixa `periodStart`/`periodEnd` com o recorte do
ciclo antigo. Nada financeiro lê esses campos — relatório atribui receita por
`dueAt` (`reports/sql/*.sql`) — então é rótulo mentindo, não número errado.

`periodEnd` acompanha o vencimento. **`periodStart` não muda**: é a chave de
idempotência (`@@unique([subscriptionId, periodStart])`) e é por ela que a
remoção de pagamento acha a cobrança seguinte (§abaixo).

## Remoção de pagamento

`removePayment(paymentId, reason)`, tudo numa transação:

1. lê pagamento, cobrança e assinatura
2. se a cobrança estava `PAID`, a quitação disparou `openNextCycle` — acha a
   cobrança seguinte por `(subscriptionId, periodStart = periodEnd da quitada)`
3. **recusa** se a seguinte tiver pagamento registrado, mensagem enviada, ou não
   estiver viva. Erro em pt-BR dizendo o que fazer no lugar
4. apaga a cobrança seguinte; devolve `subscription.nextDueAt` para o `dueAt` da
   cobrança; apaga o pagamento; recalcula `status` e `paidAt` da cobrança
5. grava `PAYMENT_REMOVED` com o pagamento inteiro em `before`

**Não re-suspende** a assinatura que a quitação tinha religado
(`SUSPENDED → ACTIVE`). Cortar acesso de um cliente adimplente por efeito
colateral de uma correção de digitação é pior do que deixar a régua suspender de
novo na passada seguinte, se o caso ainda for esse. Fica no log.

⚠️ `payments` tem `idempotencyKey @unique` e `@@unique([source, externalId])`.
Apagar a linha **libera as duas chaves**. Hoje só `registerPayment` cria pagamento
(`source: MANUAL`), então não há quem ressuscite; no dia em que um webhook passar a
criar `source: WEBHOOK`, remoção de pagamento de webhook tem que ser bloqueada ou a
chave reservada — senão a próxima tentativa do provedor recria o que o operador
acabou de tirar. Comentário obrigatório no service.

## LGPD

`reason` é o único campo com risco de dado pessoal — o resto do payload é centavo,
data e id. `anonymizeCustomer` (`app/(app)/customers/customer-anonymization.ts`)
passa a limpar `reason` dos eventos do cliente, na mesma transação das outras
quatro features. O fato econômico (valor antes, valor depois, quando) fica: é a
mesma regra que preserva cobrança e pagamento.

## Tela

- **Ficha do cliente**: seção "Alterações", cronológica, com antes → depois
  formatado por `kind` e o motivo quando houver. Trata vazio ("Nada mudou nesta
  assinatura ainda").
- **Cobranças**: ação de linha "Corrigir valor", em cobrança viva. Diálogo com
  valor e motivo obrigatório.
- **Ficha · Histórico de pagamentos**: "Remover" por pagamento, com motivo
  obrigatório e confirmação — é ação destrutiva.

## Regras duras que mudam

`CLAUDE.md` §Dinheiro, no mesmo PR:

- "Cobrança com pagamento registrado não é cancelada nem editada" → **não é
  cancelada; é editável para cima do que já foi pago**, com motivo e registro.
- "Correção é registro novo" → **correção de pagamento é remoção registrada +
  lançamento novo**.

O que **não** muda: `costCents` congelado na emissão; nenhuma coluna de saldo;
cobrança sem pagamento se cancela, não se dá baixa.

## Testes

Bloqueiam a entrega:

- evento e mutação no **mesmo commit** — rollback não deixa nenhum dos dois órfão
- remoção recusada quando a cobrança seguinte já tem pagamento ou mensagem enviada
- remoção devolve `nextDueAt` e apaga a cobrança seguinte intocada
- remoção **não** re-suspende assinatura religada
- `editChargeAmount` recusa valor abaixo do já pago
- realinhamento com pagamento parcial passa; abaixo do pago, recusa
- soma de recebido inalterada — nenhuma query de pagamento ganha filtro novo
- anonimização limpa `reason` e preserva valores
- nenhuma query de relatório lê `financial_events`

## Ordem de implementação

Duas fatias, cada uma utilizável sozinha:

1. **Log e linha do tempo** — migration, `lib/financial-events.ts`, os seis
   pontos de escrita que já existem, a seção "Alterações" na ficha, e a limpeza
   de `reason` na anonimização. Entrega "por que este cliente mudou de preço"
   sem afrouxar nenhuma regra.
2. **Edições e remoção** — `editChargeAmount`, o piso no realinhamento, o recorte
   de `periodEnd`, `removePayment` com a cascata, as ações de tela e a mudança
   das regras duras no `CLAUDE.md`.

A ordem importa: a fatia 2 afrouxa a imutabilidade, e o que torna isso aceitável
é o log da fatia 1 já estar gravando.

## Escopo fora

- **Proporcional / crédito de ciclo.** A troca acontece na virada; não há pedaço
  pago a devolver.
- **Desfazer a remoção.** Remoção é definitiva; o que sobra é lançar de novo.
- **Linha do tempo fora da ficha** (tela própria de auditoria, exportação).
- **Reversão de pagamento de webhook** — ver ⚠️ em §Remoção de pagamento.

## Estado

Não implementado. O que existe hoje e encosta neste desenho:
`realignChargeToSubscription` e `cancelCharge`/`writeOffRemaining`
(`features/charges/service.ts`), `patchSubscription` e `changeSubscriptionPlan`
(`features/subscriptions/service.ts`), `anonymizeCustomer`
(`app/(app)/customers/customer-anonymization.ts`).
