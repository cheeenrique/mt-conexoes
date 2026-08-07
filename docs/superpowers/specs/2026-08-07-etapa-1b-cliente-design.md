# Etapa 1b — Cliente: Customer, Subscription, credencial, ficha

> Segundo dos três sub-projetos da Etapa 1. Ordem: 1a Base (feito) → **1b Cliente (este doc)** →
> 1c Importação. Handoff visual: `docs/projeto/design/02-handoff-painel.md` (Clientes, Ficha do
> cliente, Assinatura, Credencial de acesso). Rotas em inglês (decisão registrada em 1a).

## Escopo

CRUD de `Customer`. CRUD de `Subscription` (sempre dentro do contexto de um cliente). Credencial
de acesso criptografada com revelar auditado. Ficha do cliente em rota própria. Fora do escopo:
`Charge`/`Payment` (Etapa 2), régua/mensagens (Etapa 3/4), importação da planilha (1c).

## Decisão: ficha sem `Charge`

O handoff descreve um painel de lucro (Faturado/Recebido/Custo/Lucro/Margem, somado sobre
`Charge`) e abas Assinaturas/Cobranças/Mensagens. `Charge` só existe na Etapa 2. Decisão do
product owner: **construir a estrutura visual completa agora**, com o painel de lucro mostrando
`R$ 0,00` em tudo (literalmente verdadeiro — nenhuma cobrança foi emitida ainda) e as abas
Cobranças/Mensagens desabilitadas com `title="Disponível na Etapa 2"` / `"Disponível na Etapa 3"`.
Mesmo padrão já usado na aba Canais de Ajustes (1a). Query do painel de lucro fica hardcoded em
zero com comentário apontando pra Etapa 2 — não escrever uma query real contra uma tabela que
não existe.

## 1. Migration

```prisma
enum SubscriptionStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
}

enum DiscountType {
  PERCENT
  FIXED
}

model Customer {
  id             String   @id @default(uuid(7))
  name           String
  phone          String
  email          String?
  document       String?
  notes          String?
  optedOut       Boolean  @default(false)
  optedOutAt     DateTime?
  optedOutReason String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  subscriptions  Subscription[]

  @@unique([phone])
  @@index([name])
  @@map("customers")
}

model Subscription {
  id                String             @id @default(uuid(7))
  customerId        String
  planId            String?
  supplierId        String?

  priceCents        BigInt
  costCents         BigInt             @default(0)
  cycle             BillingCycle       @default(MONTHLY)

  nextDueAt         DateTime
  startedAt         DateTime           @default(now())

  discountType      DiscountType?
  discountValue     Decimal?           @db.Decimal(10, 2)
  discountUntil     DateTime?

  status            SubscriptionStatus @default(ACTIVE)
  suspendedAt       DateTime?
  cancelledAt       DateTime?
  cancelReason      String?

  accessUsername    String?
  accessPasswordEnc String?
  accessServer      String?
  screens           Int                @default(1)
  accessNotes       String?

  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  customer          Customer           @relation(fields: [customerId], references: [id])
  plan              Plan?              @relation(fields: [planId], references: [id])
  supplier          Supplier?          @relation(fields: [supplierId], references: [id])

  @@index([status, nextDueAt])
  @@index([customerId])
  @@index([supplierId])
  @@map("subscriptions")
}

model CredentialReveal {
  id             String   @id @default(uuid(7))
  subscriptionId String
  userId         String
  revealedAt     DateTime @default(now())
  ip             String?

  @@index([subscriptionId, revealedAt])
  @@map("credential_reveals")
}
```

`Plan.subscriptions Subscription[]` e `Supplier.subscriptions Subscription[]` (relations
inversas) adicionadas aos modelos existentes de 1a — não muda comportamento, só completa o grafo
Prisma.

SQL manual: `UNIQUE(phone)` em `customers` (já vem do `@unique`), índices compostos como listado.
Sem `CHECK` novo além do que já existe.

## 2. Estrutura

```
src/features/customers/     schema.ts · service.ts · queries.ts · actions.ts · components/customer-table.tsx · components/customer-drawer.tsx
src/features/subscriptions/ schema.ts · service.ts · queries.ts · actions.ts · components/subscription-drawer.tsx · components/credential-reveal-dialog.tsx
src/app/(app)/customers/page.tsx
src/app/(app)/customers/[id]/page.tsx
```

Sidebar (1a) já tem item "Clientes" apontando pra `/clientes` (rota antiga, nunca usada) — **Task
desta etapa atualiza o href pra `/customers`**, mesmo padrão de 1a's Task 8.

## 3. Clientes (`/customers`)

`DataTable`: **Cliente** (nome 14px/600 + telefone mono 12px embaixo), **Plano** (nome do plano da
assinatura ativa mais recente, ou "—"), **Fornecedor** (idem), **Vencimento** (mono, direita —
`nextDueAt` da assinatura ativa, ou "—"), **Situação** (badge — nesta etapa sempre "—" cinza, sem
`Charge` não dá pra saber se está em atraso; recalculado de verdade na Etapa 2), ação `pencil`
abre drawer de edição + link (nome clicável) pra ficha (`/customers/[id]`).

Busca: campo com ícone, filtra por nome, telefone **e** `accessUsername` da assinatura (query
com `OR` em três colunas, via `searchParams?q=`). Chips de situação ficam desabilitados/ocultos
nesta etapa (dependem de `Charge`).

Drawer 560px (criar/editar dados básicos do cliente, não assinatura): nome, telefone
(`PhoneInput`, obrigatório, único), email, documento (CPF/CNPJ, texto livre — sem máscara
específica nesta etapa), observações (textarea).

## 4. Ficha do cliente (`/customers/[id]`)

Página própria, `AppShell` com botão "voltar" no header (`ArrowLeft` + `router.back()`).

Cabeçalho: nome, "Fornecedor X · cliente desde MM/AAAA" (fornecedor da assinatura mais recente),
badge situação (ATIVO se tem assinatura `status=ACTIVE`, senão "SEM ASSINATURA").

Painel de lucro (card, mono): Faturado, Recebido, Custo, Lucro, Margem — todos `formatCents(0n)`
nesta etapa. Comentário no código: `// TODO Etapa 2: SUM(charge.principalCents - discountCents) e SUM(charge.costCents) por customerId, ver docs/projeto/tecnico/04-dinheiro-e-margem.md`.

Abas: **Assinaturas** (ativa, lista as `Subscription` do cliente + botão "Nova assinatura"),
**Cobranças** (desabilitada, `title="Disponível na Etapa 2"`), **Mensagens** (desabilitada,
`title="Disponível na Etapa 3"`). Mesmo padrão de aba via `searchParams` de 1a.

## 5. Assinatura (drawer dentro da aba Assinaturas)

Drawer 560px. Campos: plano (select — ao trocar, copia `priceCents`/`costCents`/`cycle` sugeridos
do plano pro formulário, mas não salva sozinho, operador confirma/ajusta), fornecedor (select,
pré-preenchido com o do plano escolhido na criação, editável independente depois), preço
(`CurrencyInput`), custo (`CurrencyInput`), ciclo (select), desconto — tipo (nenhum/percentual/
fixo), valor, válido até (opcional, `DateInput`). Margem calculada ao vivo
(`core/money.ts#marginPercent`, mesma régua de cor de 1a).

**Vencimento nunca é campo.** Em modo leitura (assinatura existente), mostra
`nextDueAt` formatado como texto. Na criação, calculado via
`core/dates.ts#firstDueDate({ startedAt: now, cycle, timezone: Settings.timezone })` — busca
`Settings.timezone` (1a) na Server Action, não hardcoded `America/Sao_Paulo`.

Credencial de acesso: usuário (`accessUsername`, texto livre), senha — campo de texto normal na
criação/edição (operador digita a senha real do serviço, criptografada com
`lib/crypto.ts#encrypt(valor, 'subscription.accessPassword')` antes de salvar); em modo leitura,
mascarada `••••••••` com botão "Revelar" que abre `CredentialRevealDialog`. Servidor, secundário
(`accessServer`), telas (`screens`, número), observações de acesso (`accessNotes`).

## 6. Revelar credencial

`CredentialRevealDialog`: botão "Revelar" chama `revealCredentialAction(subscriptionId)` — a
action grava `CredentialReveal { subscriptionId, userId, ip }` **antes** de decriptar e devolver
o valor. DTO padrão de `Subscription` (usado na listagem/leitura normal) **nunca inclui**
`accessPasswordEnc` nem o valor decriptado — só a action de revelar devolve. Diálogo mostra o
valor + botão copiar + nota "Este acesso foi registrado." + fecha sozinho em 30s
(`setTimeout` no client) ou ao clicar fora; valor sai do estado React ao fechar, nunca fica
atrás de blur.

## Fora do escopo desta etapa

`Charge`/`Payment` e tudo que depende deles (situação real de cobrança, painel de lucro
verdadeiro, aba Cobranças funcional) — Etapa 2. Opt-out (`Customer.optedOut`) sem controle de UI
— campo existe no schema, toggle vem quando a régua existir (Etapa 3/4). Importação da planilha —
sub-projeto 1c.

## Critério de pronto

- Migration aplicada, `Customer`/`Subscription`/`CredentialReveal` funcionando.
- CRUD completo de Customer (criar, editar, listar, buscar por nome/telefone/usuário de acesso).
- Criar assinatura calcula `nextDueAt` corretamente via `firstDueDate`, sem campo de vencimento
  no formulário.
- Margem calculada ao vivo no drawer de assinatura, mesma fórmula de `core/money.ts`.
- Senha de acesso nunca aparece em DTO padrão, só via `revealCredentialAction`; revelar grava
  `CredentialReveal` antes de devolver o valor — testável em integração.
- Ficha do cliente renderiza painel de lucro zerado + aba Assinaturas real + abas
  Cobranças/Mensagens desabilitadas.
- Sidebar "Clientes" aponta pra `/customers`.
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` verdes.
