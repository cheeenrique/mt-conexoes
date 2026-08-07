# Etapa 1a — Base: Settings, Supplier, Plan

> Primeiro dos três sub-projetos da Etapa 1 (`docs/projeto/tecnico/07-plano-de-entrega.md`). Ordem:
> **1a Base (este doc) → 1b Cliente (Customer/Subscription/credencial) → 1c Importação**.
> Handoff visual completo: `docs/projeto/design/02-handoff-painel.md`.

## Escopo

CRUD de `Settings` (singleton), `Supplier`, `Plan`. Telas `/suppliers`, `/plans`, `/settings`.
Aba "Canais de WhatsApp" de Ajustes entra como vitrine estática (sem Server Action, sem adapter —
isso é Etapa 3). Fora do escopo: `Customer`, `Subscription`, importação — sub-projetos seguintes.

## Convenção de nomenclatura — correção

`CLAUDE.md` documentava "Rotas da UI: pt-BR, plural" como regra dura. **Decisão do product owner:
rotas e pastas de feature passam a ser em inglês** (`/suppliers`, `/plans`, `/settings`,
`features/suppliers/`). Texto visível ao usuário (sidebar, títulos de tela, labels) continua pt-BR —
só o path muda. Não é retroativo: `/login`, `/conta` (Etapa 0) ficam como estão. A tabela de
convenções do `CLAUDE.md` é corrigida no mesmo PR desta etapa (regra de projeto: doc que contradiz
decisão vigente é corrigido, não ignorado).

## 1. Migration + schema

Expand migration adicionando ao `prisma/schema.prisma` existente (`User`, `LoginAttempt` de Etapa 0
continuam intocados):

```prisma
enum BillingCycle {
  MONTHLY
  QUARTERLY
  SEMIANNUAL
  ANNUAL
}

model Settings {
  id                 String   @id @default("singleton")
  businessName       String
  timezone           String   @default("America/Sao_Paulo")
  quietHourStart     Int      @default(8)
  quietHourEnd       Int      @default(20)
  sendingPaused      Boolean  @default(false)
  pixKey             String?
  pixHolderName      String?
  marginAlertPercent Decimal  @default(30) @db.Decimal(5, 2)
  updatedAt          DateTime @updatedAt

  @@map("settings")
}

model Supplier {
  id            String   @id @default(uuid(7))
  name          String   @unique
  unitCostCents BigInt   @default(0)
  notes         String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  plans         Plan[]

  @@map("suppliers")
}

model Plan {
  id         String        @id @default(uuid(7))
  name       String        @unique
  priceCents BigInt        @default(0)
  costCents  BigInt        @default(0)
  cycle      BillingCycle  @default(MONTHLY)
  supplierId String?
  isActive   Boolean       @default(true)
  createdAt  DateTime      @default(now())

  supplier   Supplier?     @relation(fields: [supplierId], references: [id])

  @@map("plans")
}
```

Migration SQL manual (schema.prisma não é fonte única — `prisma/README.md` já documenta isso):
`CHECK (id = 'singleton')` na tabela `settings` reforça o singleton além do `@id @default`.
`UNIQUE(name)` em `suppliers`/`plans` já vem do `@unique` do Prisma — sem SQL manual extra aí.

`BigInt`/`Decimal`/`uuid(7)` seguem exatamente `docs/projeto/tecnico/02-modelo-de-dados.md`, sem
desvio.

## 2. Estrutura

```
src/features/settings/  queries.ts · service.ts · actions.ts · schema.ts · components/settings-form.tsx
src/features/suppliers/ queries.ts · service.ts · actions.ts · schema.ts · components/supplier-drawer.tsx · components/supplier-table.tsx
src/features/plans/     queries.ts · service.ts · actions.ts · schema.ts · components/plan-drawer.tsx · components/plan-table.tsx
src/app/(app)/suppliers/page.tsx
src/app/(app)/plans/page.tsx
src/app/(app)/settings/page.tsx
```

Sidebar (Etapa 0) já linka pra `/fornecedores`/`/planos`/`/ajustes` — **atualizar os `href` do
`Sidebar` component pros novos paths em inglês**, mantendo o `label` pt-BR ("Fornecedores",
"Planos", "Ajustes").

Cada `page.tsx`: Server Component, lê via `queries.ts`, compõe `<AppShell title="...">` +
`<DataTable>` (reuso do Etapa 0) + botão primário no header que abre o drawer client component.
Toda Server Action começa com `requireSession()`.

## 3. Fornecedores (`/suppliers`)

`DataTable`: **Fornecedor** (nome), **Custo padrão por ciclo** (mono, `formatCents`), **Assinaturas
ativas** (fixo `0` nesta etapa — coluna existe desde já pro schema de tabela não mudar quando
`Subscription` chegar em 1b), **Margem média** (fixo `—`, mesmo motivo), ação `pencil`. Header:
"Novo fornecedor".

Drawer 520px: nome, custo padrão por ciclo (`CurrencyInput`), observações (textarea). Em edição:
switch "Ativo" (toggle `isActive`, sem tela de exclusão — regra: nenhuma exclusão real dado FK
futura de `Subscription`/`Charge`). Aviso estático ao editar custo: "Mudar o custo não reajusta
assinatura existente sozinho" (texto informativo agora; o reajuste em lote de verdade é Etapa 4,
quando `Subscription` existir).

## 4. Planos (`/plans`)

`DataTable`: **Plano**, **Ciclo** (label pt-BR: Mensal/Trimestral/Semestral/Anual), **Preço**,
**Custo**, **Margem** (`core/money.ts#marginPercent(priceCents, costCents)`, `StatusBadge` colorido
pela faixa ≥40% verde / ≥15% amarelo / abaixo vermelho — mesmo threshold hardcoded aqui;
`Settings.marginAlertPercent` plugará nisso quando o alerta de margem existir, Etapa 4), **Assinaturas
ativas** (fixo `0`), ação `pencil`. Header: "Novo plano".

Drawer 520px: nome, ciclo (select), preço (`CurrencyInput`), custo padrão (`CurrencyInput`),
fornecedor padrão (select populado por `listActiveSuppliers()`, opcional). Margem calculada ao vivo
no client enquanto digita — mesma fórmula de `core/money.ts`, chamada client-side (`core/` é puro,
sem I/O, seguro de importar em client component). Em edição: switch "Ativo". Aviso estático: "Mudar
o preço não reajusta assinatura existente."

## 5. Ajustes (`/settings`)

Duas abas em chips 40px. Aba ativa por `searchParams` (`?aba=negocio|canais`), não `useState` —
regra do projeto: filtro/navegação de tela vai na URL.

**Negócio** — form único: nome do negócio, fuso (select com timezones BR comuns, default
`America/Sao_Paulo`), quiet hours início/fim (número 0-23, `quietHourStart < quietHourEnd`
validado no Zod), chave Pix + titular (com preview ao vivo "Pix `<chave>` em nome de `<titular>`"),
limite de alerta de margem (`%`, `Decimal`, input numérico). Barra de alterações não salvas: sticky
no rodapé, aparece quando `JSON.stringify(form) !== JSON.stringify(snapshotSalvo)`, botões
"Descartar" (reseta pro snapshot) / "Salvar alterações". Botão do header também salva.

**Canais** — lista estática dos 3 canais (Meta Cloud API, Evolution API, Salvy), cada linha com
badge "Não configurado" fixo (cinza, `#3A3A42`) e botão "Configurar" **desabilitado** com
`title="Disponível na Etapa 3"`. Zero Server Action nesta aba — é vitrine, sem persistência.

## Fora do escopo desta etapa

`Customer`, `Subscription`, credencial de acesso, ficha do cliente, importação da planilha —
sub-projeto 1b/1c. Adapters de WhatsApp reais — Etapa 3. Reajuste em lote de fornecedor/plano —
Etapa 4 (os avisos estáticos hoje viram ação de verdade lá). Alerta de margem abaixo do limite —
Etapa 4 (o campo `Settings.marginAlertPercent` já existe e é editável, só não dispara nada ainda).

## Critério de pronto

- Migration aplicada, `Settings` com a linha singleton criada pelo seed (Etapa 0's `prisma/seed.ts`
  ganha um upsert de `Settings` com defaults, idempotente igual ao seed de `User`).
- CRUD completo de Supplier e Plan funcionando ponta a ponta (criar, editar, listar, desativar).
- Margem calculada corretamente na lista e ao vivo no drawer de Plano, batendo com
  `core/money.ts#marginPercent` (mesmo cálculo, sem reimplementação divergente).
- Aba Negócio de Ajustes salva e persiste; barra de alterações não salvas aparece/some
  corretamente.
- Aba Canais renderiza sem erro, sem nenhum botão funcional.
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` verdes.
- `CLAUDE.md` atualizado: tabela de convenções reflete rotas em inglês.
