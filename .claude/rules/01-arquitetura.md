# 01 — Arquitetura e camadas

Aplicação única: Next.js App Router, um deployable no Cloud Run. Sem monorepo, sem API separada.

## Direção de dependência

A seta aponta para quem pode ser importado. **Nunca inverter.**

```
app/       ──┬──> features/
             ├──> core/
             ├──> lib/
             └──> components/ui/

features/  ──┬──> core/
             ├──> lib/
             └──> components/ui/

core/      ──> nada do projeto. Só date-fns e decimal.js.
lib/       ──> Prisma, env, node:crypto
components/ui/ ──> nada do domínio
```

### Matriz de import

| De ↓ / Para → | core | lib | features | components/ui | app |
|---|---|---|---|---|---|
| `app/` | ✅ | ✅ | ✅ | ✅ | — |
| `features/*` | ✅ | ✅ | ❌¹ | ✅ | ❌ |
| `core/` | — | ❌ | ❌ | ❌ | ❌ |
| `lib/` | ✅ | — | ❌ | ❌ | ❌ |
| `components/ui/` | ❌ | ❌ | ❌ | — | ❌ |

¹ Uma feature não importa de outra. Precisou compartilhar, promove — ver [05-reuso](./05-reuso.md).

## Regras duras de fronteira

- **`core/` é puro.** Não importa Prisma, Next, `process.env`, `node:crypto` nem qualquer I/O. **Não chama `new Date()`** — o instante entra por parâmetro. Se uma regra financeira precisa de banco para ser testada, está no lugar errado.
- **`components/ui/` não conhece o domínio.** `<DataTable>` sim, `<ChargeTable>` não. Se precisa importar um enum do Prisma, não é de `ui`.
- **`lib/` não contém regra de negócio.** É infra: cliente Prisma, sessão, criptografia, formatação.
- **Deletar uma feature deve ser apagar uma pasta.** Se não for, o acoplamento está errado.

## Onde cada tipo de código mora

| Código | Lugar | Por quê |
|---|---|---|
| Vencimento, âncora de fim de mês, ciclo, desconto, arredondamento, margem | `core/` | Puro, testável em ms |
| Avaliação de passo da régua, consolidação por cliente | `core/` | Idem |
| Orquestração: transação, persistência, enfileiramento de mensagem | `features/*/service.ts` | Precisa de I/O |
| Leitura para tela e relatório | `features/*/queries.ts` | Separada da escrita — cresce por outro motivo |
| SQL de relatório | `features/reports/sql/*.sql` | Versionado e revisável, não string dentro do service |
| Schema de entrada | `features/*/schema.ts` (Zod) | Mesmo schema no formulário e na Server Action |
| Server Action que **compõe** queries de várias features | `app/<rota>/<nome>-action.ts` | `app/` é a única camada que pode importar de várias features. Ex.: `app/(app)/customers/ficha-action.ts` monta a ficha do cliente com `customers`, `subscriptions`, `charges`, `messaging` e `reports`. O componente cliente recebe a action **por prop** — é isso que deixa a mesma gaveta abrir de Início, Cobranças e Mensagens sem que `features/customers` importe as outras |
| Componente visual sem domínio | `components/ui/` | shadcn + o que for genérico |
| Criptografia, sessão, formatação, cliente Prisma | `lib/` | Infra compartilhada |

## Estrutura

```
src/
  app/
    (auth)/login/
    (app)/
      page.tsx            dashboard
      clientes/ assinaturas/ cobrancas/ mensagens/ regua/
      fornecedores/ planos/ configuracoes/
    api/cron/
      charges-mark-overdue/route.ts
      dunning-evaluate/route.ts
      messages-dispatch/route.ts
      ping/route.ts
  features/
    customers/  subscriptions/  charges/  payments/
    dunning/    messaging/      suppliers/  reports/
      ├── actions.ts       Server Actions
      ├── queries.ts       leitura
      ├── service.ts       escrita e orquestração
      ├── schema.ts        Zod
      └── components/
  core/     money.ts  dates.ts  billing-cycle.ts  dunning-rules.ts
  lib/      db.ts  auth.ts  crypto.ts  format.ts  logger.ts
  components/ui/
prisma/
```

## Orçamento de tamanho

Aperta o limite global (arquivo ≤300, função ≤30). Estourar é sinal de split por responsabilidade, **nunca** de subir o limite.

| Artefato | Limite | Ao estourar |
|---|---|---|
| Server Action | 30 linhas | Sobrou regra — mover para o service |
| `service.ts` | 250 linhas | Split por coesão, não por camada |
| Método de service | 30 linhas | Extrair passo para função privada ou para `core/` |
| Função em `core/` | 40 linhas | Função pura longa quase sempre são duas |
| Componente React | 150 linhas | Extrair subcomponente |
| Hook | 100 linhas | Split por preocupação |
| `page.tsx` | 100 linhas | Rota é composição — conteúdo vai para a feature |
| `schema.ts` | sem limite | Declaração densa, não lógica |
| Teste | sem limite | Legibilidade > budget |

Exemplo de split por coesão quando `charges/service.ts` cresce:

```
charges/service.ts           emitir, cancelar (ciclo de vida)
charges/payment.service.ts   registrar pagamento, resolver status
charges/queries.ts           listas, filtros, agregações
```
