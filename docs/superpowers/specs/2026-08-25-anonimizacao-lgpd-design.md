# Anonimização de cliente (direito de eliminação, LGPD) — design

> **Status: aprovado no desenho, implementação adiada por decisão do cliente (25/08/2026).**
> Nada deste documento existe em código. Ver §Estado no fim.

## Problema

`docs/projeto/tecnico/05-credenciais-e-seguranca.md:150`, `CLAUDE.md:134` e
`.claude/rules/03-dados.md:17` afirmam que existe `anonymizeCustomer(id)`.
**Não existe.** `grep -rni "anonymiz|anonimiz" src/ prisma/` devolve zero. O modelo
`Customer` não tem coluna de marcação e `docs/testes-manuais.md` não tem um único caso —
a palavra aparece lá só na lista do que não foi coberto.

Consequências: o titular que pede eliminação não tem como ser atendido; a base guarda
telefone e credencial de acesso de gente que saiu há anos; e quem lê o projeto (incluindo
sessões futuras do Claude) acredita numa proteção ausente.

## O que a operação faz

Destrói o dado pessoal e preserva o fato econômico. Cobrança de R$ 60,00 emitida em julho
e paga dia 05 continua na base e no relatório; deixa de ser vinculável a uma pessoa.

### Valores neutros

| Campo | Vira |
|---|---|
| `customers.name` | `'Cliente anonimizado'` |
| `customers.phone` | `NULL` — `@@unique([phone])` aceita vários `NULL` no Postgres, dois anonimizados não colidem |
| `customers.email`, `document`, `notes` | `NULL` |
| `subscriptions.accessUsername`, `accessPasswordEnc`, `accessServer`, `accessNotes` | `NULL` |
| `messages.body` | `'[conteúdo removido a pedido do titular]'` |
| `messages.toPhone` | `''` — coluna é `NOT NULL`; manter assim evita migration em cascata no despacho |
| `messages.templateParams` | `NULL` — guarda o nome nos valores posicionais |
| `leads.name` | `'Lead anonimizado'`; `phone` → `''`; `city`, `note` → `NULL` |
| `charges`, `payments`, `dunning_executions` | **intactos** |

Alcance escolhido: customer + assinaturas + mensagens + leads **vinculados por
`customerId`**. Lead nunca convertido com o mesmo telefone fica fora (ver §Escopo fora).

## Schema

Migration nova, só aditiva — sem expand/contract.

```sql
ALTER TABLE customers
  ADD COLUMN "anonymizedAt"        TIMESTAMP(3),
  ADD COLUMN "anonymizedByUserId"  TEXT REFERENCES users(id);
CREATE INDEX customers_anonymized_at_idx ON customers ("anonymizedAt");
```

⚠️ Coluna em **camelCase entre aspas**. Só a *tabela* é `snake_case` (via `@@map`); nenhum
campo do schema usa `@map`, então as colunas nasceram `customerId`, `scheduledDate`,
`createdAt`. `CLAUDE.md` e `.claude/rules/03-dados.md` escrevem os índices parciais como
`messages (customer_id, scheduled_date)` e `channel_configs (is_default)` — não é o nome
real das colunas. SQL manual de migration escrito assim falha.

Auditoria em coluna, não em tabela própria: o painel tem um usuário só e o evento ocorre
no máximo uma vez por cliente — `customer_anonymizations` guardaria uma linha por customer
e ainda exigiria `anonymized_at` aqui pra tela saber o estado.

## Camadas

```
core/anonymization.ts            constantes neutras + assertAnonymizable(estado) → erro como dado. Puro.
features/customers/service.ts    anonymizeCustomerRow(tx, id, userId)
features/subscriptions/service   scrubSubscriptionAccess(tx, customerId)
features/messaging/service.ts    scrubCustomerMessages(tx, customerId) — e CANCELA as PENDING
features/leads/service.ts        scrubLeadsOfCustomer(tx, customerId)
app/(app)/customers/customer-anonymization.ts   compõe as quatro, UMA transação
app/(app)/customers/customer-actions.ts         anonymizeCustomerAction — casca
```

A composição mora em `app/` porque cruza quatro features, e `app/` é a única camada
autorizada a cruzar features (`.claude/rules/01-arquitetura.md` §Matriz de import). Fica
fora do arquivo `'use server'` pela mesma razão de `customer-onboarding.ts`: o teste de
integração chama direto, sem sessão.

**Uma transação só.** Commit parcial deixa cliente com nome neutro e credencial de acesso
ainda gravada — o pior dos dois mundos.

## Trava

`assertAnonymizable` recusa quando há assinatura `ACTIVE` ou cobrança `OPEN` / `OVERDUE` /
`PARTIALLY_PAID`. O erro nomeia o que impede:

> `Este cliente tem 1 assinatura ativa e 2 cobranças em aberto. Cancele antes de anonimizar.`
> — code `CUSTOMER_NOT_ANONYMIZABLE`

Razão: a régua roda todo dia procurando quem cobrar. Cliente sem telefone com cobrança viva
vira erro diário no cron, ou mensagem disparada pro vazio. Cancelar e anonimizar são duas
decisões de negócio — juntá-las numa ação irreversível faz o operador que errou de cliente
perder a assinatura junto.

## Defesa em profundidade

Espelha o padrão da trava T5 (opt-out conferido na avaliação **e** no despacho):
`dunning/evaluate` e `messages-dispatch` passam a pular cliente com `anonymizedAt`. A
mensagem `PENDING` já é cancelada dentro da transação; o guard no despacho é o que impede
envio pra `toPhone` vazio se alguma linha escapar.

## Tela

Seção destrutiva no fim da ficha do cliente. Confirmação **por digitação do nome do
cliente**, não "Tem certeza?" — o diálogo nomeia o que será destruído e o que será
preservado. Depois da operação: badge `Anonimizado`, ficha em leitura, sem editar, cobrar
ou mensagear.

Lista de Clientes esconde anonimizados por padrão; um chip de situação `Anonimizado` os
traz de volta — é assim que se prova numa fiscalização que a eliminação ocorreu.

## Testes

TDD, vermelho antes de verde.

- `core/` — `assertAnonymizable` em cada combinação de estado
- Integração contra Postgres real:
  - a transação zera os quatro grupos e **não** toca `charges` / `payments`
  - rodar duas vezes dá o mesmo resultado
  - a trava bloqueia com assinatura ativa e com cobrança em aberto
  - o total do relatório do mês fecha igual antes e depois
- Guard de despacho e de avaliação

## Escopo fora

Retenção de 12 meses do corpo da mensagem (é cron separado), export dos dados do titular,
e anonimizar lead nunca convertido que tenha o mesmo telefone.

## Estado

Desenho fechado com o cliente em 25/08/2026, com estas quatro decisões:

1. Alcance: customer + assinaturas + mensagens + leads vinculados
2. Trava: bloqueia com assinatura ativa ou cobrança em aberto, exige cancelar antes
3. Auditoria: `anonymizedAt` + `anonymizedByUserId` em coluna, sem tabela nova
4. Tela: some da lista por padrão, volta por chip de situação

**Implementação adiada a pedido do cliente.** Retomar por
`superpowers:writing-plans` sobre este arquivo.
